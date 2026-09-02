import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SubagentIdentityHandler } from '../../../../src/extensions/multiverse/agents/session-identity.ts';
import { ChildSessionRepository } from '../../../../src/extensions/multiverse/runtime/child-session-repository.ts';
import { resolveChildSessionDirectory } from '../../../../src/extensions/multiverse/runtime/child-storage.util.ts';

const appendSettledTurn = (repository: ReturnType<ChildSessionRepository['create']>) => {
  repository.sessionManager.appendMessage({ role: 'user', content: 'question', timestamp: Date.now() });
  repository.sessionManager.appendMessage({
    role: 'assistant',
    content: [{ type: 'text', text: 'answer' }],
    api: 'openai-completions',
    provider: 'openai',
    model: 'test-model',
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  });
};

describe('ChildSessionRepository', () => {
  let root: string;
  let cwd: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'pi-arsenal-child-repository-'));
    cwd = path.join(root, 'project');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('creates a stable marked child in the parent-scoped Pi session directory', () => {
    const repository = new ChildSessionRepository({ root, createId: () => 'child-123' });

    const child = repository.create(cwd, 'parent-123', 'fixer');

    expect(child.sessionId).toBe('child-123');
    expect(child.sessionFile).toStartWith(resolveChildSessionDirectory(cwd, 'parent-123', root));
    expect(SubagentIdentityHandler.parse(child.sessionManager.getEntries())).toMatchObject({
      kind: 'child',
      identity: { agent: 'fixer', parentSessionId: 'parent-123' },
    });
  });

  it('reopens persisted conversation context from a fresh repository instance', () => {
    const creator = new ChildSessionRepository({ root, createId: () => 'child-456' });
    const child = creator.create(cwd, 'parent-456', 'explorer');
    appendSettledTurn(child);

    const reopened = new ChildSessionRepository({ root }).open(cwd, 'parent-456', 'child-456');

    expect(reopened.sessionId).toBe('child-456');
    expect(reopened.sessionFile).toBe(child.sessionFile);
    expect(reopened.sessionManager.buildSessionContext().messages.map(message => message.role)).toEqual(['user', 'assistant']);
    expect(reopened.sessionManager.buildSessionContext().messages[0]).toMatchObject({ content: 'question' });
  });

  it('rebuilds missing or stale derived metadata from JSONL identity entries', () => {
    const repository = new ChildSessionRepository({ root, createId: () => 'child-indexed' });
    const child = repository.create(cwd, 'parent-indexed', 'fixer');
    appendSettledTurn(child);
    const directory = resolveChildSessionDirectory(cwd, 'parent-indexed', root);
    const indexPath = path.join(directory, 'index.json');

    unlinkSync(indexPath);
    expect(repository.locate(cwd, 'parent-indexed', 'child-indexed')).toBe(child.sessionFile);

    writeFileSync(
      indexPath,
      JSON.stringify({
        version: 1,
        sessions: {
          'child-indexed': { fileName: 'missing.jsonl', agent: 'explorer', parentSessionId: 'wrong' },
        },
      }),
    );
    expect(repository.locate(cwd, 'parent-indexed', 'child-indexed')).toBe(child.sessionFile);
  });

  it('does not find a child in a different parent bucket', () => {
    const repository = new ChildSessionRepository({ root, createId: () => 'child-789' });
    const child = repository.create(cwd, 'parent-owner', 'visualizer');
    appendSettledTurn(child);

    expect(() => repository.open(cwd, 'parent-other', 'child-789')).toThrow('was not found for this parent');
  });

  it('rejects a copied child file whose durable identity belongs to another parent', () => {
    const repository = new ChildSessionRepository({ root, createId: () => 'child-copied' });
    const child = repository.create(cwd, 'parent-owner', 'fixer');
    appendSettledTurn(child);
    const forkDirectory = resolveChildSessionDirectory(cwd, 'parent-fork', root);
    mkdirSync(forkDirectory, { recursive: true });
    copyFileSync(child.sessionFile, path.join(forkDirectory, path.basename(child.sessionFile)));

    expect(() => repository.open(cwd, 'parent-fork', 'child-copied')).toThrow('cross-parent import is not supported in V1');
    expect(repository.open(cwd, 'parent-owner', 'child-copied').sessionId).toBe('child-copied');
  });
});
