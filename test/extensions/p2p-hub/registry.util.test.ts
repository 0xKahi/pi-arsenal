import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';
import { HubRegistry, isEntryLive, isPidAlive, listLiveHubs } from '../../../src/extensions/p2p-hub/registry.util';
import { PathUtil } from '../../../src/utils/path.util';

describe('HubRegistry', () => {
  let dir: string;
  let registry: HubRegistry;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'p2p-registry-'));
    registry = new HubRegistry(PathUtil.findFile(dir));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('write then read round-trips an entry', async () => {
    await registry.write({ name: 'frontend', port: 12345, hostPid: process.pid, createdAt: new Date().toISOString() });
    const entry = registry.read('frontend');
    expect(entry?.name).toBe('frontend');
    expect(entry?.port).toBe(12345);
  });

  test('list returns all written entries', async () => {
    await registry.write({ name: 'a', port: 1, hostPid: process.pid, createdAt: new Date().toISOString() });
    await registry.write({ name: 'b', port: 2, hostPid: process.pid, createdAt: new Date().toISOString() });
    const names = registry
      .list()
      .map(e => e.name)
      .sort();
    expect(names).toEqual(['a', 'b']);
  });

  test('remove deletes an entry and is safe when already absent', async () => {
    await registry.write({ name: 'a', port: 1, hostPid: process.pid, createdAt: new Date().toISOString() });
    registry.remove('a');
    expect(registry.exists('a')).toBe(false);
    expect(() => registry.remove('a')).not.toThrow();
  });

  test('exists reflects presence', async () => {
    expect(registry.exists('missing')).toBe(false);
    await registry.write({ name: 'present', port: 1, hostPid: process.pid, createdAt: new Date().toISOString() });
    expect(registry.exists('present')).toBe(true);
  });
});

describe('isPidAlive', () => {
  test('returns true for the current process', () => {
    expect(isPidAlive(process.pid)).toBe(true);
  });

  test('returns false for a pid unlikely to exist', () => {
    expect(isPidAlive(999_999)).toBe(false);
  });
});

describe('isEntryLive / listLiveHubs', () => {
  let dir: string;
  let registry: HubRegistry;
  let server: WebSocketServer;
  let port: number;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'p2p-registry-live-'));
    registry = new HubRegistry(PathUtil.findFile(dir));
    server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>(resolve => server.once('listening', resolve));
    const address = server.address();
    port = typeof address === 'object' && address !== null ? address.port : 0;
  });

  afterEach(async () => {
    rmSync(dir, { recursive: true, force: true });
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  test('a live hub with a reachable port and alive pid passes validation', async () => {
    const entry = { name: 'live', port, hostPid: process.pid, createdAt: new Date().toISOString() };
    expect(await isEntryLive(entry)).toBe(true);
  });

  test('a dead-pid entry fails validation without probing the port', async () => {
    const entry = { name: 'dead', port, hostPid: 999_999, createdAt: new Date().toISOString() };
    expect(await isEntryLive(entry)).toBe(false);
  });

  test('an unreachable port fails validation even with a live pid', async () => {
    const entry = { name: 'unreachable', port: 1, hostPid: process.pid, createdAt: new Date().toISOString() };
    expect(await isEntryLive(entry)).toBe(false);
  });

  test('listLiveHubs prunes stale entries and keeps live ones', async () => {
    await registry.write({ name: 'live', port, hostPid: process.pid, createdAt: new Date().toISOString() });
    await registry.write({ name: 'stale', port: 1, hostPid: 999_999, createdAt: new Date().toISOString() });

    const live = await listLiveHubs(registry);
    expect(live.map(e => e.name)).toEqual(['live']);
    expect(registry.exists('stale')).toBe(false);
    expect(registry.exists('live')).toBe(true);
  });
});
