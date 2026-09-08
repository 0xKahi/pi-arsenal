import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SubagentIdentityHandler } from '../../../../src/extensions/multiverse/agents/session-identity.ts';
import { ChildSessionRepository } from '../../../../src/extensions/multiverse/runtime/child-session-repository.ts';

/** The storage layout is private, so tests observe it through the file a handle reports. */
const bucketOf = (sessionFile: string) => path.dirname(sessionFile);

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
    expect(child.sessionFile).toStartWith(root);
    // <root>/<64-hex working-directory key>/<parent id>/<file>
    expect(path.relative(root, child.sessionFile).split(path.sep)[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(path.basename(bucketOf(child.sessionFile))).toBe('parent-123');
    expect(SubagentIdentityHandler.parse(child.sessionManager.getEntries())).toMatchObject({
      kind: 'child',
      identity: { agent: 'fixer', parentSessionId: 'parent-123' },
    });
  });

  it('maps equivalent canonical working directories to one bucket', () => {
    const project = path.join(root, 'project-canonical');
    const alias = path.join(root, 'alias-canonical');
    mkdirSync(project);
    symlinkSync(project, alias);

    const child = new ChildSessionRepository({ root, createId: () => 'child-alias' }).create(alias, 'parent-alias', 'fixer');
    appendSettledTurn(child);

    // Created through the symlink, reachable through the real path: one canonical bucket.
    expect(new ChildSessionRepository({ root }).locate(project, 'parent-alias', 'child-alias')).toBe(child.sessionFile);
  });

  it('separates distinct working directory and parent combinations', () => {
    const one = path.join(root, 'one');
    const two = path.join(root, 'two');
    mkdirSync(one);
    mkdirSync(two);
    let next = 0;
    const repository = new ChildSessionRepository({ root, createId: () => `child-${next++}` });

    const buckets = new Set([
      bucketOf(repository.create(one, 'parent-a', 'fixer').sessionFile),
      bucketOf(repository.create(one, 'parent-b', 'fixer').sessionFile),
      bucketOf(repository.create(two, 'parent-a', 'fixer').sessionFile),
    ]);

    expect(buckets.size).toBe(3);
  });

  it('rejects session IDs that could escape their storage bucket', () => {
    const repository = new ChildSessionRepository({ root, createId: () => 'child-safe' });

    expect(() => repository.create(cwd, '../parent', 'fixer')).toThrow('Invalid parent session ID');
    expect(() => repository.create(cwd, 'parent/child', 'fixer')).toThrow('Invalid parent session ID');
    expect(() => repository.locate(cwd, 'parent-ok', '../child')).toThrow('Invalid child session ID');
    expect(() => new ChildSessionRepository({ root, createId: () => '../evil' }).create(cwd, 'parent-ok', 'fixer')).toThrow(
      'Invalid child session ID',
    );
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
    const indexPath = path.join(bucketOf(child.sessionFile), 'index.json');

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

  it('leaves no temp file and no corrupt index when an index write fails', () => {
    const repository = new ChildSessionRepository({ root, createId: () => 'child-atomic' });
    const child = repository.create(cwd, 'parent-atomic', 'fixer');
    appendSettledTurn(child);
    const directory = bucketOf(child.sessionFile);
    const indexPath = path.join(directory, 'index.json');
    const before = readFileSync(indexPath, 'utf8');

    // A directory where the temp file wants to be makes the write fail mid-flight.
    const blocked = new ChildSessionRepository({ root, createId: () => 'child-blocked' });
    chmodSync(directory, 0o500);
    try {
      expect(() => blocked.create(cwd, 'parent-atomic', 'fixer')).toThrow();
    } finally {
      chmodSync(directory, 0o700);
    }

    expect(readFileSync(indexPath, 'utf8')).toBe(before);
    expect(JSON.parse(readFileSync(indexPath, 'utf8')).sessions['child-atomic']).toBeDefined();
    expect(readdirSync(directory).filter(name => name.includes('.tmp'))).toEqual([]);
    // The index is written through Atomic, so it carries owner-only permissions.
    expect(statSync(indexPath).mode & 0o777).toBe(0o600);
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
    const forkDirectory = path.join(path.dirname(bucketOf(child.sessionFile)), 'parent-fork');
    mkdirSync(forkDirectory, { recursive: true });
    copyFileSync(child.sessionFile, path.join(forkDirectory, path.basename(child.sessionFile)));

    expect(() => repository.open(cwd, 'parent-fork', 'child-copied')).toThrow('cross-parent import is not supported in V1');
    expect(repository.open(cwd, 'parent-owner', 'child-copied').sessionId).toBe('child-copied');
  });
});
