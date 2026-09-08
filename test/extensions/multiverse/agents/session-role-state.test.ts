import { describe, expect, it } from 'bun:test';
import type { ExtensionAPI, ExtensionContext, SessionEntry } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../../../src/config/config-loader.ts';
import { SUBAGENT_IDENTITY_CUSTOM_TYPE, SubagentIdentityHandler } from '../../../../src/extensions/multiverse/agents/session-identity.ts';
import { SessionRoleState } from '../../../../src/extensions/multiverse/agents/session-role-state.ts';
import { registerMultiverse } from '../../../../src/extensions/multiverse/multiverse.extension.ts';

type SessionStartHandler = (event: { type: 'session_start'; reason: 'startup' | 'reload' }, ctx: ExtensionContext) => void;

const entry = (customType: string, data: unknown, id = customType): SessionEntry => ({
  type: 'custom',
  id,
  parentId: null,
  timestamp: '2026-01-01T00:00:00.000Z',
  customType,
  data,
});

const enabledConfig: ConfigProvider = {
  getP2pCouncil: () => ({ enabled: false, layout: 'inline' }),
  getTmuxPopup: () => ({ enabled: false, width: 50, height: 50, fileCommand: 'nvim' }),
  getMultiverse: () => ({
    enabled: true,
    defaultAgent: 'default',
    maxConcurrency: 5,
    subagents: { explorer: { enabled: true }, fixer: { enabled: true }, visualizer: { enabled: true } },
  }),
};

const setup = () => {
  const handlers: SessionStartHandler[] = [];
  const agentNameEvents: Array<{ agentName: string; color?: string }> = [];
  const pi = {
    on: (eventName: string, handler: SessionStartHandler) => {
      if (eventName === 'session_start') handlers.push(handler);
    },
    registerTool: () => {},
    registerCommand: () => {},
    getActiveTools: () => [],
    getAllTools: () => ['read', 'grep', 'find', 'ls', 'bash', 'edit', 'write'].map(name => ({ name })),
    getCommands: () => [],
    setActiveTools: () => {},
    events: {
      emit: (_name: string, payload: { agentName: string; color?: string }) => agentNameEvents.push(payload),
      on: () => {},
    },
  } as unknown as ExtensionAPI;
  const roleState = new SessionRoleState();
  registerMultiverse(pi, { config: enabledConfig, roleState });
  const handler = handlers[0];
  if (!handler) throw new Error('session_start handler was not registered');
  return { handler, roleState, agentNameEvents };
};

const context = (entries: SessionEntry[], notifications: string[] = []): ExtensionContext =>
  ({
    sessionManager: { getEntries: () => entries },
    ui: { notify: (message: string) => notifications.push(message) },
  }) as unknown as ExtensionContext;

describe('Multiverse session role classification', () => {
  it('keeps an ordinary session in the parent role', async () => {
    const { handler, roleState, agentNameEvents } = setup();

    handler({ type: 'session_start', reason: 'startup' }, context([]));

    expect(roleState.get()).toEqual({ kind: 'parent' });
    await Bun.sleep(20);
    expect(agentNameEvents).toEqual([{ agentName: 'DEFAULT' }]);
  });

  it('recognizes a marked child while Multiverse is enabled', async () => {
    const { handler, roleState, agentNameEvents } = setup();
    const entries = [
      entry('arsenal-parent-agent', { version: 1, agent: 'megamind' }),
      entry(SUBAGENT_IDENTITY_CUSTOM_TYPE, SubagentIdentityHandler.create('visualizer', 'parent'), 'marker'),
    ];

    handler({ type: 'session_start', reason: 'reload' }, context(entries));

    expect(roleState.get()).toEqual({
      kind: 'child',
      identity: { version: 1, agent: 'visualizer', parentSessionId: 'parent' },
    });
    await Bun.sleep(20);
    expect(agentNameEvents.map(event => event.agentName)).toEqual(['VISUALIZER']);
  });

  it('fails closed and notifies for an invalid child marker', () => {
    const { handler, roleState } = setup();
    const notifications: string[] = [];

    handler(
      { type: 'session_start', reason: 'startup' },
      context([entry(SUBAGENT_IDENTITY_CUSTOM_TYPE, { version: 2, agent: 'fixer', parentSessionId: 'parent' })], notifications),
    );

    expect(roleState.get().kind).toBe('invalid-child');
    expect(notifications.join('\n')).toContain('arsenal-subagent');
  });
});
