import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type ExtensionAPI, type ExtensionContext, SessionManager } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../../../src/config/config-loader.ts';
import { SubagentIdentityHandler } from '../../../../src/extensions/multiverse/agents/session-identity.ts';
import { registerMultiverse } from '../../../../src/extensions/multiverse/multiverse.extension.ts';
import { ChildRuntime } from '../../../../src/extensions/multiverse/runtime/child-runtime.ts';
import { ChildSessionRepository } from '../../../../src/extensions/multiverse/runtime/child-session-repository.ts';
import { SPAWN_TOOL_NAME } from '../../../../src/extensions/multiverse/tools/spawn/spawn.tool.ts';
import { MultiverseConfigSchema } from '../../../../src/schemas/multiverse.config.schema.ts';
import { type FakeModelServer, startFakeModelServer } from './fake-model-server.ts';

/**
 * Activation coverage against session files that were really written to disk by
 * `ChildSessionRepository`, rather than hand-built entry arrays. This is what
 * proves role restoration, tool policy, and prompt policy survive a reopen.
 */

const HOST_TOOLS = ['read', 'bash', 'write', SPAWN_TOOL_NAME];

const definitionSource = (prompt: string, tools = '[read]') =>
  `---\nname: explorer\ntools: ${tools}\nskills: []\nmetadata: ["Lane: explorer"]\n---\n${prompt}`;

describe('Multiverse activation against real session files', () => {
  let definitionsDirectory: string;
  let definitionFile: string;
  let root: string;
  let cwd: string;
  let childSessionFile: string;
  let server: FakeModelServer;

  beforeAll(async () => {
    definitionsDirectory = mkdtempSync(path.join(tmpdir(), 'arsenal-defs-'));
    definitionFile = path.join(definitionsDirectory, 'explorer.md');
    writeFileSync(definitionFile, definitionSource('ORIGINAL CHILD PROMPT'));

    root = mkdtempSync(path.join(tmpdir(), 'arsenal-children-'));
    cwd = mkdtempSync(path.join(tmpdir(), 'arsenal-cwd-'));

    // A genuine durable child. Pi only materializes a session file once the first
    // assistant message lands, so the child has to actually run one interaction.
    server = await startFakeModelServer();
    server.script({ text: 'child reply' });
    const handle = new ChildSessionRepository({ root }).create(cwd, 'parent-session', 'explorer');
    childSessionFile = handle.sessionFile;
    await new ChildRuntime({ agentDir: server.agentDir }).run({
      cwd,
      definition: { name: 'explorer', tools: ['read'], skills: [], metadata: [], prompt: 'ORIGINAL CHILD PROMPT', filePath: definitionFile },
      sessionManager: handle.sessionManager,
      model: server.model,
      thinkingLevel: 'off',
      prompt: 'seed',
      checkpoint: null,
    });
  });

  afterAll(async () => {
    await server.close();
    for (const directory of [definitionsDirectory, root, cwd, server.agentDir]) rmSync(directory, { recursive: true, force: true });
  });

  beforeEach(() => writeFileSync(definitionFile, definitionSource('ORIGINAL CHILD PROMPT')));

  const harness = (options: { sessionManager: SessionManager; enabled?: boolean; globalAgentsDirectory?: string }) => {
    const config = MultiverseConfigSchema.parse({
      enabled: options.enabled ?? true,
      defaultAgent: 'megamind',
    });
    let activeTools = [...HOST_TOOLS];
    const notifications: string[] = [];
    const handlers = new Map<string, (event: never, ctx: ExtensionContext) => unknown>();

    const pi = {
      on: (name: string, handler: (event: never, ctx: ExtensionContext) => unknown) => handlers.set(name, handler),
      registerCommand: () => {},
      registerTool: () => {},
      getAllTools: () => HOST_TOOLS.map(name => ({ name })),
      getActiveTools: () => activeTools,
      setActiveTools: (names: string[]) => {
        activeTools = names;
      },
      appendEntry: () => {},
      events: { emit: () => {}, on: () => {} },
    } as unknown as ExtensionAPI;

    const ctx = {
      mode: 'tui',
      cwd,
      model: { provider: 'groq', id: 'test-model' },
      thinkingLevel: 'off',
      modelRegistry: {},
      sessionManager: options.sessionManager,
      isProjectTrusted: () => true,
      ui: { notify: (message: string) => notifications.push(message) },
    } as unknown as ExtensionContext;

    const activation = registerMultiverse(pi, {
      config: { getMultiverse: () => config } as ConfigProvider,
      definitionsDirectory,
      globalAgentsDirectory: options.globalAgentsDirectory,
      repository: new ChildSessionRepository({ root }),
    });

    return {
      activation,
      notifications,
      start: () => handlers.get('session_start')?.({} as never, ctx),
      turn: () => {
        const event = { systemPrompt: 'HOST PROMPT', systemPromptOptions: { sections: {} as Record<string, string> } };
        const result = handlers.get('before_agent_start')?.(event as never, ctx) as { systemPrompt?: string } | undefined;
        return { result, contribution: event.systemPromptOptions.sections.orchestrator_role };
      },
      tools: () => activeTools,
    };
  };

  it('restores a child role from a persisted session file and applies its tool policy', () => {
    const harnessed = harness({ sessionManager: SessionManager.open(childSessionFile) });
    harnessed.start();

    expect(harnessed.activation.roleState.get().kind).toBe('child');
    // Only the definition's declared tools survive; host and spawn tools are gone.
    expect(harnessed.tools()).toEqual(['read']);

    const turn = harnessed.turn();
    expect(turn.result?.systemPrompt).toBe('ORIGINAL CHILD PROMPT');
    expect(turn.result?.systemPrompt).not.toContain('HOST PROMPT');
  });

  it('leaves a reopened child untouched when Multiverse is disabled', () => {
    const harnessed = harness({ sessionManager: SessionManager.open(childSessionFile), enabled: false });
    harnessed.start();

    // Disabled means "off", not "enforce child restrictions": only the spawn tool is withdrawn.
    expect(harnessed.tools()).toEqual(['read', 'bash', 'write']);
    expect(harnessed.turn().result).toBeUndefined();
  });

  it('adopts an edited definition on the next reload rather than mid-session', () => {
    const before = harness({ sessionManager: SessionManager.open(childSessionFile) });
    before.start();
    expect(before.turn().result?.systemPrompt).toBe('ORIGINAL CHILD PROMPT');

    writeFileSync(definitionFile, definitionSource('UPDATED CHILD PROMPT', '[read, bash]'));

    // The running session keeps the definition it activated with.
    expect(before.turn().result?.systemPrompt).toBe('ORIGINAL CHILD PROMPT');
    expect(before.tools()).toEqual(['read']);

    // A fresh extension instance — a reload or reopen — picks the edit up.
    const after = harness({ sessionManager: SessionManager.open(childSessionFile) });
    after.start();
    expect(after.turn().result?.systemPrompt).toBe('UPDATED CHILD PROMPT');
    expect(after.tools()).toEqual(['read', 'bash']);
  });

  it('keeps the turn hook prompt-only for a Megamind parent', () => {
    const parent = SessionManager.create(cwd, mkdtempSync(path.join(tmpdir(), 'arsenal-parent-')));
    const harnessed = harness({ sessionManager: parent });
    harnessed.start();

    expect(harnessed.activation.roleState.get().kind).toBe('parent');
    expect(harnessed.activation.parentAgentState.getActive()).toBe('megamind');
    expect(harnessed.tools()).toContain(SPAWN_TOOL_NAME);

    const toolsBeforeTurn = harnessed.tools();
    const turn = harnessed.turn();
    // The Megamind contribution is an additive section, not a full replacement, and never mutates tools.
    expect(turn.result).toBeUndefined();
    expect(turn.contribution).toContain('explorer');
    expect(harnessed.tools()).toEqual(toolsBeforeTurn);

    // Repeated turns must not accumulate copies of the contribution.
    expect(harnessed.turn().contribution).toBe(turn.contribution);
  });

  it('warns about unknown declared tools without disabling the agent', () => {
    writeFileSync(definitionFile, definitionSource('CHILD PROMPT', '[read, nonexistent-tool]'));
    const harnessed = harness({ sessionManager: SessionManager.open(childSessionFile) });
    harnessed.start();

    expect(harnessed.notifications.some(message => message.includes('unknown tools: nonexistent-tool'))).toBe(true);
    expect(harnessed.activation.roleState.get().kind).toBe('child');
    // Pi filters the unregistered name itself; the agent stays usable.
    expect(harnessed.tools()).toEqual(['read']);
  });

  it('builds a child for a user-defined agent and fails clearly once its file is removed', async () => {
    const userAgentsDirectory = mkdtempSync(path.join(tmpdir(), 'arsenal-user-'));
    const reviewerFile = path.join(userAgentsDirectory, 'reviewer.md');
    writeFileSync(reviewerFile, `---\nname: reviewer\ntools: [read]\nskills: []\nmetadata: ["Lane: review"]\n---\nREVIEWER CHILD PROMPT`);
    try {
      // Materialize a genuine durable child of the user-defined agent.
      server.script({ text: 'reviewer reply' });
      const handle = new ChildSessionRepository({ root }).create(cwd, 'parent-personal', 'reviewer');
      await new ChildRuntime({ agentDir: server.agentDir }).run({
        cwd,
        definition: {
          name: 'reviewer',
          tools: ['read'],
          skills: [],
          metadata: ['Lane: review'],
          prompt: 'REVIEWER CHILD PROMPT',
          filePath: reviewerFile,
        },
        sessionManager: handle.sessionManager,
        model: server.model,
        thinkingLevel: 'off',
        prompt: 'seed',
        checkpoint: null,
      });

      const opened = harness({ sessionManager: SessionManager.open(handle.sessionFile), globalAgentsDirectory: userAgentsDirectory });
      opened.start();

      expect(opened.activation.roleState.get().kind).toBe('child');
      // Only the definition's declared tools survive, exactly as for a bundled child.
      expect(opened.tools()).toEqual(['read']);
      expect(opened.turn().result?.systemPrompt).toBe('REVIEWER CHILD PROMPT');

      // The durable identity marker names the user-defined agent.
      const identity = SubagentIdentityHandler.parse(SessionManager.open(handle.sessionFile).getEntries());
      expect(identity).toMatchObject({ kind: 'child', identity: { agent: 'reviewer', parentSessionId: 'parent-personal' } });

      // Removing the file preserves the session but yields a clear, agent-named failure.
      const removed = harness({ sessionManager: SessionManager.open(handle.sessionFile) });
      removed.start();
      expect(removed.activation.roleState.get().kind).toBe('child');
      expect(removed.notifications.join('\n')).toContain('reviewer');
      expect(removed.notifications.join('\n')).toContain('not registered');
      expect(() => new ChildSessionRepository({ root }).open(cwd, 'parent-personal', handle.sessionId)).not.toThrow();
    } finally {
      rmSync(userAgentsDirectory, { recursive: true, force: true });
    }
  });
});
