import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  canonicalizeWorkingDirectory,
  createWorkingDirectoryKey,
  resolveChildSessionDirectory,
} from '../../../../src/extensions/multiverse/runtime/child-storage.util.ts';

describe('child session path resolution', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'pi-arsenal-storage-'));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('maps equivalent canonical paths to one stable opaque key', () => {
    const project = path.join(root, 'project');
    const alias = path.join(root, 'alias');
    mkdirSync(project);
    symlinkSync(project, alias);

    expect(canonicalizeWorkingDirectory(alias)).toBe(canonicalizeWorkingDirectory(project));
    expect(createWorkingDirectoryKey(alias)).toBe(createWorkingDirectoryKey(project));
    expect(createWorkingDirectoryKey(project)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('separates distinct cwd and parent combinations', () => {
    const one = path.join(root, 'one');
    const two = path.join(root, 'two');
    mkdirSync(one);
    mkdirSync(two);

    const paths = new Set([
      resolveChildSessionDirectory(one, 'parent-a', root),
      resolveChildSessionDirectory(one, 'parent-b', root),
      resolveChildSessionDirectory(two, 'parent-a', root),
    ]);

    expect(paths.size).toBe(3);
    expect(resolveChildSessionDirectory(one, 'parent-a', root)).toStartWith(root);
  });

  it('rejects parent IDs that could escape their storage bucket', () => {
    expect(() => resolveChildSessionDirectory(root, '../parent', root)).toThrow('Invalid parent session ID');
    expect(() => resolveChildSessionDirectory(root, 'parent/child', root)).toThrow('Invalid parent session ID');
  });
});
