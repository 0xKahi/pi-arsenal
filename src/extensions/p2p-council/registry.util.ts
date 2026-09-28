import { randomBytes } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocket } from 'ws';
import { Atomic } from '../../utils/atomic.util';
import { type FileSearchResult, PathUtil } from '../../utils/path.util';

export interface CouncilRegistryEntry {
  name: string;
  port: number;
  hostPid: number;
  createdAt: string;
  token: string;
}

const PROBE_TIMEOUT_MS = 1500;

export class CouncilRegistry {
  private readonly dir: FileSearchResult;

  public constructor(dir: FileSearchResult = PathUtil.findArsenalConfig({ type: 'global', path: 'p2p-councils' })) {
    this.dir = dir;
  }

  private entryPath(name: string): string {
    return join(this.dir.path, `${name}.json`);
  }

  /** Read a single entry, or undefined if it does not exist or fails to parse. */
  public read(name: string): CouncilRegistryEntry | undefined {
    const found = PathUtil.findFile(this.entryPath(name));
    if (!found.exists) return undefined;
    try {
      const parsed = JSON.parse(readFileSync(found.path, 'utf8'));
      if (isCouncilRegistryEntry(parsed)) return parsed;
      return undefined;
    } catch {
      return undefined;
    }
  }

  /** List all raw entries found in the registry directory (not validated for liveness). */
  public list(): CouncilRegistryEntry[] {
    if (!this.dir.exists) return [];
    const entries: CouncilRegistryEntry[] = [];
    for (const file of readdirSync(this.dir.path)) {
      if (!file.endsWith('.json')) continue;
      const name = file.slice(0, -'.json'.length);
      const entry = this.read(name);
      if (entry) entries.push(entry);
      else this.remove(name);
    }
    return entries;
  }

  /** Atomically write (create or replace) an entry via write-temp-then-rename. */
  public async write(entry: CouncilRegistryEntry): Promise<void> {
    mkdirSync(this.dir.path, { recursive: true, mode: 0o700 });
    await Atomic.write({ filePath: this.entryPath(entry.name), data: entry });
  }

  /** Remove an entry if present. Safe to call when already absent. */
  public remove(name: string): void {
    try {
      rmSync(this.entryPath(name), { force: true });
    } catch {
      // best-effort cleanup
    }
  }

  public exists(name: string): boolean {
    return PathUtil.findFile(this.entryPath(name)).exists;
  }
}

function isCouncilRegistryEntry(value: unknown): value is CouncilRegistryEntry {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.name === 'string' &&
    typeof v.port === 'number' &&
    typeof v.hostPid === 'number' &&
    typeof v.createdAt === 'string' &&
    typeof v.token === 'string' &&
    v.token.length > 0
  );
}

export function generateCouncilToken(): string {
  return randomBytes(32).toString('base64url');
}

export function councilUrl(port: number, token: string): string {
  return `ws://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`;
}

/** Cheap liveness check: does a process with this pid currently exist? */
export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Connect probe: does something answer a WebSocket handshake on this port? */
export function probeCouncilPort(port: number, token: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    const socket = new WebSocket(councilUrl(port, token));
    const finish = (result: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      try {
        socket.close();
      } catch {
        // ignore
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    timer.unref?.();
    socket.on('open', () => finish(true));
    socket.on('error', () => finish(false));
  });
}

/**
 * Validate a registry entry for staleness: check host pid liveness first
 * (cheap), then fall back to a connect probe. Returns true when the council
 * appears reachable.
 */
export async function isEntryLive(entry: CouncilRegistryEntry): Promise<boolean> {
  if (!isPidAlive(entry.hostPid)) return false;
  return probeCouncilPort(entry.port, entry.token);
}

/** List only entries that pass liveness validation, pruning stale ones from disk. */
export async function listLiveCouncils(registry: CouncilRegistry): Promise<CouncilRegistryEntry[]> {
  const all = registry.list();
  const live: CouncilRegistryEntry[] = [];
  for (const entry of all) {
    if (await isEntryLive(entry)) {
      live.push(entry);
    } else {
      registry.remove(entry.name);
    }
  }
  return live;
}
