import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAgentSession, DefaultResourceLoader, type ExtensionAPI, type SessionEntry, SessionManager } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../../../src/config/config-loader.ts';
import type { SubagentDefinition } from '../../../../src/extensions/multiverse/agents/subagent-definition.ts';
import { registerMultiverse, type MultiverseActivation } from '../../../../src/extensions/multiverse/multiverse.extension.ts';
import { ChildRuntime } from '../../../../src/extensions/multiverse/runtime/child-runtime.ts';
import { ChildSessionRepository } from '../../../../src/extensions/multiverse/runtime/child-session-repository.ts';
import { MultiverseConfigSchema } from '../../../../src/schemas/multiverse.config.schema.ts';
import { type FakeModelServer, type RecordedRequest, startFakeModelServer } from './fake-model-server.ts';

/**
 * Provider-capture coverage for the real Multiverse extension prompt handlers.
 *
 * These run the shipped `registerMultiverse` factory inside `DefaultResourceLoader`,
 * driven by a real `AgentSession`, and assert on what the fake provider actually
 * received. Megamind contributes an additive `sections.orchestrator_role` entry rather than a
 * `systemPrompt` replacement, so the effective provider instructions must contain the
 * base prompt plus the contribution exactly once, and the transcript must record the
 * section once (and a `null` removal patch when the parent returns to Default). A
 * registered child still returns `systemPrompt` for an exact full replacement.
 */

const HOST_BASE_MARKER = 'You are an expert coding assistant operating inside pi';
const MEGAMIND_MARKER = 'You are a workflow manager for coding work.';
const CHILD_PROMPT = 'CHILD PROMPT INTEGRATION MARKER';

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

type AgentSessionHandle = Awaited<ReturnType<typeof createAgentSession>>['session'];
type SectionPatch = Record<string, string | null>;

describe('Multiverse system prompt against a real provider request', () => {
  let server: FakeModelServer;
  let definitionsDirectory: string;
  let isolatedAgentsDirectory: string;
  let sessionDirectory: string;
  let root: string;
  let cwd: string;
  let config: ReturnType<typeof MultiverseConfigSchema.parse>;
  let live: AgentSessionHandle[];

  const definitionSource = (prompt: string, tools = '[read]') =>
    `---\nname: explorer\ntools: ${tools}\nskills: []\nmetadata: ["Lane: explorer"]\n---\n${prompt}`;

  const childDefinition = (): SubagentDefinition => ({
    name: 'explorer',
    tools: ['read'],
    skills: [],
    metadata: ['Lane: explorer'],
    prompt: CHILD_PROMPT,
    filePath: path.join(definitionsDirectory, 'explorer.md'),
  });

  const factory =
    (activations: MultiverseActivation[]): ((pi: ExtensionAPI) => void) =>
    pi => {
      activations.push(
        registerMultiverse(pi, {
          config: { getMultiverse: () => config } as ConfigProvider,
          definitionsDirectory,
          projectAgentsDirectory: isolatedAgentsDirectory,
          globalAgentsDirectory: isolatedAgentsDirectory,
          repository: new ChildSessionRepository({ root }),
        }),
      );
    };

  const openSession = async (sessionManager: SessionManager): Promise<{ session: AgentSessionHandle; activation: MultiverseActivation }> => {
    const activations: MultiverseActivation[] = [];
    const loader = new DefaultResourceLoader({
      cwd,
      agentDir: server.agentDir,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      extensionFactories: [factory(activations)],
    });
    await loader.reload();
    const { session } = await createAgentSession({
      cwd,
      agentDir: server.agentDir,
      resourceLoader: loader,
      sessionManager,
      model: server.model,
      thinkingLevel: 'off',
    });
    // `createAgentSession` builds the runtime but does not start it; the real runner modes
    // call `bindExtensions`, which emits `session_start` and activates the extension.
    await session.bindExtensions({ mode: 'print' });
    live.push(session);
    const activation = activations[0];
    if (!activation) throw new Error('Multiverse extension factory did not register an activation.');
    return { session, activation };
  };

  /**
   * The effective system instructions the provider received. This transport collapses the
   * structured transcript into a single replayed system message, so its text is the current
   * prompt state rather than the historical sequence of section patches.
   */
  const providerInstructions = (request: RecordedRequest): string => request.system;

  const lastRequest = (): RecordedRequest => {
    const request = server.requests.at(-1);
    if (!request) throw new Error('No provider request was captured.');
    return request;
  };

  const sectionPatches = (entries: SessionEntry[]): SectionPatch[] =>
    entries.flatMap(entry => (entry.type === 'message' && entry.message.role === 'system' ? [entry.message.sections ?? {}] : []));

  /** Section patches on the active branch, in order (one per system message). */
  const activeBranchSectionPatches = (session: AgentSessionHandle): SectionPatch[] =>
    sectionPatches(session.sessionManager.getBranch());

  /** Section patches across every branch, including discarded ones, for branch-discard assertions. */
  const allSectionPatches = (session: AgentSessionHandle): SectionPatch[] => sectionPatches(session.sessionManager.getEntries());

  /** Replay the active branch's section patches into the section state the model currently holds. */
  const effectiveSections = (session: AgentSessionHandle): SectionPatch => {
    const state: SectionPatch = {};
    for (const patch of activeBranchSectionPatches(session)) {
      for (const [name, value] of Object.entries(patch)) {
        if (value === null) delete state[name];
        else state[name] = value;
      }
    }
    return state;
  };

  /** How many times the active branch declares (not removes) the Megamind section. */
  const megamindDeclarations = (session: AgentSessionHandle): number =>
    activeBranchSectionPatches(session).filter(patch => typeof patch.orchestrator_role === 'string').length;

  beforeAll(async () => {
    server = await startFakeModelServer();
    definitionsDirectory = mkdtempSync(path.join(tmpdir(), 'arsenal-sdk-defs-'));
    isolatedAgentsDirectory = mkdtempSync(path.join(tmpdir(), 'arsenal-sdk-isolated-'));
    sessionDirectory = mkdtempSync(path.join(tmpdir(), 'arsenal-sdk-sessions-'));
    root = mkdtempSync(path.join(tmpdir(), 'arsenal-sdk-children-'));
    cwd = mkdtempSync(path.join(tmpdir(), 'arsenal-sdk-cwd-'));
    writeFileSync(path.join(definitionsDirectory, 'explorer.md'), definitionSource(CHILD_PROMPT));
    config = MultiverseConfigSchema.parse({ enabled: true, defaultAgent: 'megamind' });
  });

  afterAll(async () => {
    await server.close();
    for (const directory of [definitionsDirectory, isolatedAgentsDirectory, sessionDirectory, root, cwd, server.agentDir]) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    server.requests.length = 0;
    live = [];
  });

  afterEach(async () => {
    // `registerMultiverse` defers its agent-name event by 10ms. Let it fire while the
    // session is still active so a pending timer cannot surface as a stale-ctx error later.
    await Bun.sleep(25);
    for (const session of live) session.dispose();
    live = [];
  });

  it('contributes Megamind as a prompt section across turns and tool continuation without accumulation', async () => {
    const target = path.join(cwd, 'note.txt');
    writeFileSync(target, 'file contents for tool continuation');
    const { session } = await openSession(SessionManager.create(cwd, sessionDirectory));

    server.script({ toolCalls: [{ name: 'read', arguments: { path: target } }] }, { text: 'after tool' }, { text: 'after second turn' });
    await session.prompt('first parent message');
    await session.prompt('second parent message');

    // One request for each of: tool-call assistant turn, post-tool continuation, second user turn.
    expect(server.requests).toHaveLength(3);
    for (const request of server.requests) {
      const instructions = providerInstructions(request);
      expect(instructions).toContain(HOST_BASE_MARKER);
      expect(occurrences(instructions, MEGAMIND_MARKER)).toBe(1);
    }
    // The tool really ran and its result reached the continuation request.
    expect(JSON.stringify(server.requests[1]?.messages)).toContain('file contents for tool continuation');

    // The section is declared once in the transcript and never re-declared on later turns.
    expect(effectiveSections(session).orchestrator_role).toContain(MEGAMIND_MARKER);
    expect(megamindDeclarations(session)).toBe(1);
  });

  it('removes the persisted Megamind section when the parent switches back to Default', async () => {
    const { session, activation } = await openSession(SessionManager.create(cwd, sessionDirectory));

    server.script({ text: 'megamind reply' });
    await session.prompt('megamind message');
    expect(occurrences(providerInstructions(lastRequest()), MEGAMIND_MARKER)).toBe(1);
    expect(effectiveSections(session).orchestrator_role).toContain(MEGAMIND_MARKER);

    activation.parentAgentState.setActive('default');
    server.requests.length = 0;
    server.script({ text: 'default reply' });
    await session.prompt('default message');

    const instructions = providerInstructions(lastRequest());
    expect(instructions).toContain(HOST_BASE_MARKER);
    expect(occurrences(instructions, MEGAMIND_MARKER)).toBe(0);
    // The active branch records an explicit removal patch and no longer holds the section.
    expect(effectiveSections(session).orchestrator_role).toBeUndefined();
    expect(activeBranchSectionPatches(session).some(patch => patch.orchestrator_role === null)).toBe(true);
  });

  it('re-contributes a single Megamind section after a Default detour', async () => {
    const { session, activation } = await openSession(SessionManager.create(cwd, sessionDirectory));

    server.script({ text: 'megamind reply' });
    await session.prompt('megamind message');
    const original = effectiveSections(session).orchestrator_role;
    expect(original).toContain(MEGAMIND_MARKER);

    activation.parentAgentState.setActive('default');
    server.script({ text: 'default reply' });
    await session.prompt('default message');
    expect(effectiveSections(session).orchestrator_role).toBeUndefined();

    activation.parentAgentState.setActive('megamind');
    server.requests.length = 0;
    server.script({ text: 'megamind again' });
    await session.prompt('megamind again');

    // One initial declaration, one removal, one re-declaration: the section never accumulates.
    expect(occurrences(providerInstructions(lastRequest()), MEGAMIND_MARKER)).toBe(1);
    expect(effectiveSections(session).orchestrator_role).toBe(original);
    expect(megamindDeclarations(session)).toBe(2);
  });

  it('persists the section across a reopen and keeps it effective without re-declaring it', async () => {
    const first = await openSession(SessionManager.create(cwd, sessionDirectory));
    server.script({ text: 'first reply' });
    await first.session.prompt('saved parent message');
    expect(effectiveSections(first.session).orchestrator_role).toContain(MEGAMIND_MARKER);
    const sessionFile = first.session.sessionManager.getSessionFile();
    if (!sessionFile) throw new Error('Persisted parent session did not receive a session file.');

    server.requests.length = 0;
    const resumed = await openSession(SessionManager.open(sessionFile));
    server.script({ text: 'resumed reply' });
    await resumed.session.prompt('resumed parent message');

    // The section was persisted in the transcript, so the reopened parent keeps it and does
    // not need to (and must not) declare it a second time.
    expect(effectiveSections(resumed.session).orchestrator_role).toContain(MEGAMIND_MARKER);
    expect(megamindDeclarations(resumed.session)).toBe(1);
    expect(occurrences(providerInstructions(lastRequest()), MEGAMIND_MARKER)).toBe(1);
  });

  it('keeps the active branch Megamind section after discarding a later Default removal', async () => {
    const { session, activation } = await openSession(SessionManager.create(cwd, sessionDirectory));
    server.script({ text: 'root reply' }, { text: 'second reply' }, { text: 'default reply' });
    await session.prompt('root parent message');
    await session.prompt('second parent message');

    const firstUser = session.sessionManager
      .getEntries()
      .find(entry => entry.type === 'message' && entry.message.role === 'user');
    if (!firstUser) throw new Error('No user entry was persisted to branch from.');

    // Record a Default removal on the later branch and confirm it is effective there.
    activation.parentAgentState.setActive('default');
    await session.prompt('default message');
    expect(activeBranchSectionPatches(session).some(patch => patch.orchestrator_role === null)).toBe(true);
    expect(effectiveSections(session).orchestrator_role).toBeUndefined();

    // Navigate back to the earlier Megamind user entry; the Default removal is now on a discarded branch.
    server.requests.length = 0;
    await session.navigateTree(firstUser.id, { summarize: false });
    // Tree navigation does not reload the in-memory persona, so restore Megamind as the user would.
    activation.parentAgentState.setActive('megamind');
    server.script({ text: 'branched reply' });
    await session.prompt('branched parent message');

    // The discarded removal is not on the active branch, so Megamind stays effective exactly once.
    expect(activeBranchSectionPatches(session).some(patch => patch.orchestrator_role === null)).toBe(false);
    expect(allSectionPatches(session).some(patch => patch.orchestrator_role === null)).toBe(true);
    expect(effectiveSections(session).orchestrator_role).toContain(MEGAMIND_MARKER);
    expect(megamindDeclarations(session)).toBe(1);
    expect(occurrences(providerInstructions(lastRequest()), MEGAMIND_MARKER)).toBe(1);
  });

  it('fully replaces the host prompt with the registered child prompt', async () => {
    server.script({ text: 'seed reply' });
    const handle = new ChildSessionRepository({ root }).create(cwd, 'parent-child-prompt', 'explorer');
    await new ChildRuntime({ agentDir: server.agentDir }).run({
      cwd,
      definition: childDefinition(),
      sessionManager: handle.sessionManager,
      model: server.model,
      thinkingLevel: 'off',
      prompt: 'seed',
      checkpoint: null,
    });

    server.requests.length = 0;
    const { session } = await openSession(SessionManager.open(handle.sessionFile));
    server.script({ text: 'child reply' });
    await session.prompt('child message');

    const instructions = providerInstructions(lastRequest());
    expect(instructions).toBe(CHILD_PROMPT);
    expect(instructions).not.toContain(HOST_BASE_MARKER);
    expect(occurrences(instructions, MEGAMIND_MARKER)).toBe(0);
    expect(lastRequest().toolNames).toEqual(['read']);
  });
});
