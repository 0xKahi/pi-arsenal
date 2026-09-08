import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type ExtensionAPI, type ExtensionContext, SessionManager } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../../../src/config/config-loader.ts';
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

  const harness = (options: { sessionManager: SessionManager; enabled?: boolean }) => {
    const config = MultiverseConfigSchema.parse({ enabled: options.enabled ?? true, defaultAgent: 'megamind' });
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
      ui: { notify: (message: string) => notifications.push(message) },
    } as unknown as ExtensionContext;

    const activation = registerMultiverse(pi, {
      config: { getMultiverse: () => config } as ConfigProvider,
      definitionsDirectory,
      repository: new ChildSessionRepository({ root }),
    });

    return {
      activation,
      notifications,
      start: () => handlers.get('session_start')?.({} as never, ctx),
      turn: () => handlers.get('before_agent_start')?.({ systemPrompt: 'HOST PROMPT' } as never, ctx) as { systemPrompt: string } | undefined,
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
    expect(turn?.systemPrompt).toBe('ORIGINAL CHILD PROMPT');
    expect(turn?.systemPrompt).not.toContain('HOST PROMPT');
  });

  it('leaves a reopened child untouched when Multiverse is disabled', () => {
    const harnessed = harness({ sessionManager: SessionManager.open(childSessionFile), enabled: false });
    harnessed.start();

    // Disabled means "off", not "enforce child restrictions": only the spawn tool is withdrawn.
    expect(harnessed.tools()).toEqual(['read', 'bash', 'write']);
    expect(harnessed.turn()).toBeUndefined();
  });

  it('adopts an edited definition on the next reload rather than mid-session', () => {
    const before = harness({ sessionManager: SessionManager.open(childSessionFile) });
    before.start();
    expect(before.turn()?.systemPrompt).toBe('ORIGINAL CHILD PROMPT');

    writeFileSync(definitionFile, definitionSource('UPDATED CHILD PROMPT', '[read, bash]'));

    // The running session keeps the definition it activated with.
    expect(before.turn()?.systemPrompt).toBe('ORIGINAL CHILD PROMPT');
    expect(before.tools()).toEqual(['read']);

    // A fresh extension instance — a reload or reopen — picks the edit up.
    const after = harness({ sessionManager: SessionManager.open(childSessionFile) });
    after.start();
    expect(after.turn()?.systemPrompt).toBe('UPDATED CHILD PROMPT');
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
    // The Megamind contribution appends to the host prompt and never mutates tools.
    expect(turn?.systemPrompt).toContain('HOST PROMPT');
    expect(turn?.systemPrompt).toContain('explorer');
    expect(harnessed.tools()).toEqual(toolsBeforeTurn);

    // Repeated turns must not accumulate copies of the contribution.
    const first = turn?.systemPrompt ?? '';
    expect(harnessed.turn()?.systemPrompt).toBe(first);
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
});
