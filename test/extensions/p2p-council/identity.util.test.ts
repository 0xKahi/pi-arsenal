import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { resolveP2pIdentity } from '../../../src/extensions/p2p-council/identity.util';

describe('resolveP2pIdentity', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'p2p-identity-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('falls back to basename(cwd) when .arsenal/p2p-role.yml is absent', () => {
    const identity = resolveP2pIdentity(dir);
    expect(identity.name).toBe(basename(dir));
    expect(identity.description).toBeUndefined();
  });

  test('reads custom name and description from p2p-role.yml', () => {
    mkdirSync(join(dir, '.arsenal'), { recursive: true });
    writeFileSync(join(dir, '.arsenal', 'p2p-role.yml'), 'name: reviewer\ndescription: reviews PRs\n');

    const identity = resolveP2pIdentity(dir);
    expect(identity.name).toBe('reviewer');
    expect(identity.description).toBe('reviews PRs');
  });

  test('falls back to basename(cwd) when name key is missing', () => {
    mkdirSync(join(dir, '.arsenal'), { recursive: true });
    writeFileSync(join(dir, '.arsenal', 'p2p-role.yml'), 'description: only a description\n');

    const identity = resolveP2pIdentity(dir);
    expect(identity.name).toBe(basename(dir));
    expect(identity.description).toBe('only a description');
  });

  test('falls back gracefully on invalid YAML', () => {
    mkdirSync(join(dir, '.arsenal'), { recursive: true });
    writeFileSync(join(dir, '.arsenal', 'p2p-role.yml'), ':::not: valid: yaml:::');

    const identity = resolveP2pIdentity(dir);
    expect(identity.name).toBe(basename(dir));
    expect(identity.description).toBeUndefined();
  });

  test('does not walk upward from cwd to find .arsenal', () => {
    const nested = join(dir, 'nested', 'deeper');
    mkdirSync(nested, { recursive: true });
    mkdirSync(join(dir, '.arsenal'), { recursive: true });
    writeFileSync(join(dir, '.arsenal', 'p2p-role.yml'), 'name: parent-level\n');

    const identity = resolveP2pIdentity(nested);
    expect(identity.name).toBe(basename(nested));
  });
});
