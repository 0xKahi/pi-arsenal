import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverSubagentPaths } from '../../../../src/extensions/multiverse/agents/subagent-paths.ts';
import { SubAgentRegistry } from '../../../../src/extensions/multiverse/agents/subagent-registry.ts';
import { runSpawn, type SpawnOrchestratorDependencies } from '../../../../src/extensions/multiverse/orchestrator/spawn-orchestrator.ts';
import { ChildAdmissionRegistry } from '../../../../src/extensions/multiverse/runtime/child-admission.ts';
import { ChildRuntime, type ModelResolutionRegistry } from '../../../../src/extensions/multiverse/runtime/child-runtime.ts';
import { ChildSessionRepository } from '../../../../src/extensions/multiverse/runtime/child-session-repository.ts';
import { MultiverseConfigSchema } from '../../../../src/schemas/multiverse.config.schema.ts';
import { type FakeModelServer, startFakeModelServer } from './fake-model-server.ts';

/**
 * End-to-end spawn coverage: the real orchestrator, real `ChildRuntime`, real
 * `AgentSession`, and real durable child session files. Only the upstream model
 * endpoint is a local fake, so scheduling, isolation, ordering, persistence, and
 * abort behaviour are exercised as shipped.
 */

const definitionSource = (name: string, prompt: string, tools = '[read]') =>
  `---\nname: ${name}\ntools: ${tools}\nskills: []\nmetadata: ["Lane: ${name}"]\n---\n${prompt}`;

describe('spawn end-to-end with real child sessions', () => {
  let server: FakeModelServer;
  let definitionsDirectory: string;
  let root: string;
  let cwd: string;
  let registry: SubAgentRegistry;

  beforeAll(async () => {
    server = await startFakeModelServer();
    definitionsDirectory = mkdtempSync(path.join(tmpdir(), 'arsenal-defs-'));
    writeFileSync(path.join(definitionsDirectory, 'explorer.md'), definitionSource('explorer', 'You are the explorer child.'));
    writeFileSync(path.join(definitionsDirectory, 'fixer.md'), definitionSource('fixer', 'You are the fixer child.'));

    root = mkdtempSync(path.join(tmpdir(), 'arsenal-children-'));
    cwd = mkdtempSync(path.join(tmpdir(), 'arsenal-cwd-'));

    registry = new SubAgentRegistry();
    registry.register(discoverSubagentPaths(definitionsDirectory).paths);
    registry.resolveAvailability(MultiverseConfigSchema.parse({ enabled: true }));
  });

  afterAll(async () => {
    await server.close();
    for (const directory of [definitionsDirectory, root, cwd, server.agentDir]) rmSync(directory, { recursive: true, force: true });
  });

  beforeEach(() => {
    server.requests.length = 0;
  });

  const modelRegistry: ModelResolutionRegistry = {
    find: () => server.model,
    getApiKeyAndHeaders: async () => ({ ok: true, apiKey: 'test-key' }),
  };

  const dependencies = (parentSessionId: string, overrides: Partial<SpawnOrchestratorDependencies> = {}): SpawnOrchestratorDependencies => ({
    cwd,
    parentSessionId,
    repository: new ChildSessionRepository({ root }),
    admission: new ChildAdmissionRegistry(),
    maxConcurrency: 2,
    model: server.model,
    thinkingLevel: 'off',
    registry: modelRegistry,
    subagentModel: () => undefined,
    subagentReasoning: () => undefined,
    getSubAgent: name => registry.getSubAgent(name),
    resolveContinuation: () => undefined,
    // The real runtime, pinned to the fake server's agent directory for credentials.
    runtime: new ChildRuntime({ agentDir: server.agentDir }),
    ...overrides,
  });

  it('creates several children in one batch and returns results in input order', async () => {
    server.script({ text: 'explorer reply' }, { text: 'fixer reply' });

    const result = await runSpawn(
      {
        context: 'shared context',
        tasks: [
          { action: 'create', agent: 'explorer', task: 'explore' },
          { action: 'create', agent: 'fixer', task: 'fix' },
        ],
      },
      dependencies('parent-batch'),
    );

    expect(result.aborted).toBe(false);
    expect(result.interactions.map(interaction => interaction.agent)).toEqual(['explorer', 'fixer']);
    expect(result.interactions.map(interaction => interaction.status)).toEqual(['success', 'success']);

    // Each child ran under its own definition prompt, and both saw the shared context.
    const systems = server.requests.map(request => request.system);
    expect(systems.some(system => system.includes('You are the explorer child.'))).toBe(true);
    expect(systems.some(system => system.includes('You are the fixer child.'))).toBe(true);
    for (const request of server.requests) expect(JSON.stringify(request.messages)).toContain('shared context');
  });

  it('isolates a failing task without disturbing its siblings', async () => {
    server.script({ text: 'healthy reply' });

    const result = await runSpawn(
      {
        context: 'ctx',
        tasks: [
          { action: 'create', agent: 'explorer', task: 'ok' },
          { action: 'create', agent: 'ghost', task: 'unknown agent' },
        ],
      },
      dependencies('parent-isolation'),
    );

    expect(result.interactions).toHaveLength(2);
    expect(result.interactions[0]?.status).toBe('success');
    expect(result.interactions[1]?.status).toBe('failure');
    expect(result.interactions[1]?.error).toBeTruthy();
  });

  it('continues a child on a later call once the first runtime is gone', async () => {
    server.script({ text: 'first reply' }, { text: 'second reply' });
    const shared = { repository: new ChildSessionRepository({ root }), admission: new ChildAdmissionRegistry() };

    const created = await runSpawn(
      { context: 'ctx', tasks: [{ action: 'create', agent: 'explorer', task: 'start' }] },
      dependencies('parent-continue', shared),
    );
    const first = created.interactions[0];
    expect(first?.status).toBe('success');

    const continued = await runSpawn(
      { context: 'ctx', tasks: [{ action: 'continue', childSessionId: first?.childSessionId as string, task: 'keep going' }] },
      dependencies('parent-continue', { ...shared, resolveContinuation: id => (id === first?.childSessionId ? first : undefined) }),
    );

    expect(continued.interactions[0]).toMatchObject({ status: 'success', childSessionId: first?.childSessionId, agent: 'explorer' });
    // Continuation reuses the same durable file rather than starting a new child.
    expect(JSON.stringify(server.requests.at(-1)?.messages)).toContain('first reply');
  });

  it('rejects a continuation that is not reachable on the active parent branch', async () => {
    const result = await runSpawn(
      { context: 'ctx', tasks: [{ action: 'continue', childSessionId: '018f2c7a-1d3e-4b90-9c11-5a7e0b2d4f86', task: 'resume' }] },
      dependencies('parent-branch'),
    );

    expect(result.interactions[0]?.status).toBe('failure');
    expect(server.requests).toHaveLength(0);
  });

  it('never exceeds the configured concurrency across a batch', async () => {
    const tasks = Array.from({ length: 5 }, (_, index) => ({ action: 'create' as const, agent: 'explorer', task: `task ${index}` }));
    server.script(...tasks.map(() => ({ text: 'done', delayMs: 25 })));

    let inFlight = 0;
    let peak = 0;
    const runtime = new ChildRuntime({ agentDir: server.agentDir });
    const instrumented = new Proxy(runtime, {
      get(target, property, receiver) {
        if (property !== 'run') return Reflect.get(target, property, receiver);
        return async (input: Parameters<ChildRuntime['run']>[0]) => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          try {
            return await target.run(input);
          } finally {
            inFlight--;
          }
        };
      },
    });

    const result = await runSpawn({ context: 'ctx', tasks }, dependencies('parent-concurrency', { maxConcurrency: 2, runtime: instrumented }));

    expect(result.interactions).toHaveLength(5);
    expect(peak).toBeLessThanOrEqual(2);
    expect(result.interactions.every(interaction => interaction.status === 'success')).toBe(true);
  });

  it('aborts in flight, settles every task, and leaves created children on disk', async () => {
    server.script({ text: 'slow reply', delayMs: 2_000 });
    const controller = new AbortController();
    const repository = new ChildSessionRepository({ root });

    const running = runSpawn(
      { context: 'ctx', tasks: [{ action: 'create', agent: 'explorer', task: 'long' }] },
      dependencies('parent-abort', { repository }),
      { signal: controller.signal },
    );
    // Abort once the request has actually reached the model.
    await Bun.sleep(150);
    controller.abort();

    const result = await running;
    expect(result.aborted).toBe(true);
    expect(result.interactions).toHaveLength(1);
    expect(result.interactions[0]?.status).toBe('aborted');

    // The child file survives an abort so the user can inspect or resume it.
    const childSessionId = result.interactions[0]?.childSessionId as string;
    expect(() => repository.open(cwd, 'parent-abort', childSessionId)).not.toThrow();
  });
});
