import { describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { type SessionEntry, SessionManager } from '@earendil-works/pi-coding-agent';
import {
  SubagentIdentityHandler,
  SUBAGENT_IDENTITY_CUSTOM_TYPE,
} from '../../../../src/extensions/multiverse/agents/session-identity.ts';

const customEntry = (id: string, data: unknown, parentId: string | null = null): SessionEntry => ({
  type: 'custom',
  id,
  parentId,
  timestamp: '2026-01-01T00:00:00.000Z',
  customType: SUBAGENT_IDENTITY_CUSTOM_TYPE,
  data,
});

const unrelatedEntry = (id: string): SessionEntry => ({
  type: 'custom',
  id,
  parentId: null,
  timestamp: '2026-01-01T00:00:00.000Z',
  customType: 'other-extension',
  data: {},
});

describe('SubagentIdentityHandler.markSession', () => {
  it('persists exactly one marker before the first interaction', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'pi-arsenal-child-marker-'));
    try {
      const sessionManager = SessionManager.create('/tmp/project', directory, { id: 'child-session' });
      const entryId = SubagentIdentityHandler.markSession(sessionManager, 'explorer', 'parent-session');

      expect(SubagentIdentityHandler.parse(sessionManager.getEntries())).toEqual({
        kind: 'child',
        identity: { version: 1, agent: 'explorer', parentSessionId: 'parent-session' },
        entryId,
      });
      expect(() => SubagentIdentityHandler.markSession(sessionManager, 'explorer', 'parent-session')).toThrow('identity already exists');

      sessionManager.appendMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'settled' }],
        api: 'openai-completions',
        provider: 'openai',
        model: 'test-model',
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
      });
      const sessionFile = sessionManager.getSessionFile();
      expect(sessionFile).toBeDefined();
      if (!sessionFile) return;

      const reopened = SessionManager.open(sessionFile);
      const markers = reopened.getEntries().filter(entry => entry.type === 'custom' && entry.customType === SUBAGENT_IDENTITY_CUSTOM_TYPE);
      expect(markers).toHaveLength(1);
      expect(readFileSync(sessionFile, 'utf8')).toContain('"customType":"arsenal-subagent"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('SubagentIdentityHandler.parse', () => {
  it('returns none when the session has no child marker', () => {
    expect(SubagentIdentityHandler.parse([unrelatedEntry('other')])).toEqual({ kind: 'none' });
  });

  it('recognizes a valid marker regardless of its conversation branch', () => {
    const identity = SubagentIdentityHandler.create('visualizer', 'parent-session');
    const result = SubagentIdentityHandler.parse([
      unrelatedEntry('root'),
      customEntry('child-marker', identity, 'abandoned-branch-entry'),
      unrelatedEntry('active-branch-entry'),
    ]);

    expect(result).toEqual({ kind: 'child', identity, entryId: 'child-marker' });
  });

  it('rejects duplicate markers even when their data agrees', () => {
    const identity = SubagentIdentityHandler.create('fixer', 'parent-session');
    const result = SubagentIdentityHandler.parse([customEntry('one', identity), customEntry('two', identity, 'other-branch')]);

    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') expect(result.error).toContain('found 2');
  });

  it.each([
    [{ version: 2, agent: 'fixer', parentSessionId: 'parent' }, 'version'],
    [{ version: 1, agent: 'unknown', parentSessionId: 'parent' }, 'agent'],
    [{ version: 1, agent: 'fixer', parentSessionId: '' }, 'parentSessionId'],
    [{ version: 1, agent: 'fixer', parentSessionId: 'parent', prompt: 'snapshot' }, 'prompt'],
  ])('rejects invalid marker data %p', (data, expectedError) => {
    const result = SubagentIdentityHandler.parse([customEntry('marker', data)]);

    expect(result.kind).toBe('invalid');
    if (result.kind === 'invalid') {
      expect(result.error).toContain('marker');
      expect(result.error).toContain(expectedError);
    }
  });
});
