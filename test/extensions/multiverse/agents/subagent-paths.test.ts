import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { discoverOrderedSubagentPaths, discoverSubagentPaths } from '../../../../src/extensions/multiverse/agents/subagent-paths.ts';

const isRoot = process.getuid?.() === 0;

describe('discoverSubagentPaths', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'arsenal-discover-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const write = (directory: string, name: string) => {
    const filePath = path.join(directory, name);
    writeFileSync(filePath, `---\nname: ${name}\ntools: [read]\nskills: []\nmetadata: [routing]\n---\nprompt`);
    return filePath;
  };

  test('emits only .md files in alphabetical order', () => {
    const directory = path.join(root, 'agents');
    mkdirSync(directory);
    const b = write(directory, 'b.md');
    write(directory, 'notes.txt');
    const a = write(directory, 'a.md');

    expect(discoverSubagentPaths(directory)).toEqual({ paths: [a, b], errors: [] });
  });

  test('reports exactly one error when the directory exists but cannot be read', () => {
    if (isRoot) return;
    const directory = path.join(root, 'agents');
    mkdirSync(directory);
    write(directory, 'a.md');
    chmodSync(directory, 0o000);
    try {
      const result = discoverSubagentPaths(directory);
      expect(result.paths).toEqual([]);
      expect(result.errors).toHaveLength(1);
    } finally {
      chmodSync(directory, 0o700);
    }
  });

  test('reports one error for a missing directory by default', () => {
    const result = discoverSubagentPaths(path.join(root, 'absent'));
    expect(result.paths).toEqual([]);
    expect(result.errors).toHaveLength(1);
  });

  test('treats a missing directory as silent when optionalDirectory is set', () => {
    expect(discoverSubagentPaths(path.join(root, 'absent'), { optionalDirectory: true })).toEqual({ paths: [], errors: [] });
  });

  test('still reports an existing-but-unreadable optional directory', () => {
    if (isRoot) return;
    const directory = path.join(root, 'agents');
    mkdirSync(directory);
    chmodSync(directory, 0o000);
    try {
      const result = discoverSubagentPaths(directory, { optionalDirectory: true });
      expect(result.paths).toEqual([]);
      expect(result.errors).toHaveLength(1);
    } finally {
      chmodSync(directory, 0o700);
    }
  });
});

describe('discoverOrderedSubagentPaths', () => {
  let root: string;
  let bundled: string;
  let project: string;
  let global: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'arsenal-ordered-'));
    bundled = path.join(root, 'bundled');
    project = path.join(root, 'project');
    global = path.join(root, 'global');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const write = (directory: string, name: string) => {
    const filePath = path.join(directory, name);
    writeFileSync(filePath, `---\nname: ${name}\ntools: [read]\nskills: []\nmetadata: [routing]\n---\nprompt`);
    return filePath;
  };

  test('emits bundled, then project, then global, alphabetical within each', () => {
    mkdirSync(bundled);
    mkdirSync(project);
    mkdirSync(global);
    const bundledA = write(bundled, 'a.md');
    const bundledZ = write(bundled, 'z.md');
    const projectA = write(project, 'a.md');
    const projectM = write(project, 'm.md');
    const globalA = write(global, 'a.md');
    const globalG = write(global, 'g.md');

    const result = discoverOrderedSubagentPaths({
      bundledDirectory: bundled,
      projectDirectory: project,
      globalDirectory: global,
    });

    expect(result.errors).toEqual([]);
    expect(result.paths).toEqual([bundledA, bundledZ, projectA, projectM, globalA, globalG]);
  });

  test('omits the project directory entirely when it is not passed', () => {
    mkdirSync(bundled);
    mkdirSync(project);
    mkdirSync(global);
    const bundledA = write(bundled, 'a.md');
    write(project, 'ignored.md');
    const globalG = write(global, 'g.md');

    const result = discoverOrderedSubagentPaths({ bundledDirectory: bundled, globalDirectory: global });

    expect(result.errors).toEqual([]);
    expect(result.paths).toEqual([bundledA, globalG]);
  });

  test('treats missing user directories as silent', () => {
    mkdirSync(bundled);
    const bundledA = write(bundled, 'a.md');

    const result = discoverOrderedSubagentPaths({
      bundledDirectory: bundled,
      projectDirectory: path.join(root, 'absent-project'),
      globalDirectory: path.join(root, 'absent-global'),
    });

    expect(result.errors).toEqual([]);
    expect(result.paths).toEqual([bundledA]);
  });

  test('reports an existing-but-unreadable user directory exactly once', () => {
    if (isRoot) return;
    mkdirSync(bundled);
    mkdirSync(project);
    const bundledA = write(bundled, 'a.md');
    chmodSync(project, 0o000);
    try {
      const result = discoverOrderedSubagentPaths({ bundledDirectory: bundled, projectDirectory: project });

      expect(result.paths).toEqual([bundledA]);
      expect(result.errors).toHaveLength(1);
    } finally {
      chmodSync(project, 0o700);
    }
  });
});
