import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { SubagentIdentityHandler } from '../agents/session-identity.ts';
import type { BundledSubagentName } from '../agents/subagent-definition.ts';
import { CHILD_SESSION_INDEX_FILE as INDEX_FILE, CHILD_SESSION_INDEX_VERSION as INDEX_VERSION } from '../constants.ts';

interface ChildSessionIndexEntry {
  fileName: string;
  agent: BundledSubagentName;
  parentSessionId: string;
}

interface ChildSessionIndex {
  version: typeof INDEX_VERSION;
  sessions: Record<string, ChildSessionIndexEntry>;
}

export function resolveIndexedChildSession(sessionDirectory: string, childSessionId: string): string | undefined {
  const index = readIndex(sessionDirectory);
  const entry = index?.sessions[childSessionId];
  if (!entry) return undefined;
  const sessionFile = path.join(sessionDirectory, entry.fileName);
  return existsSync(sessionFile) ? sessionFile : undefined;
}

export function recordIndexedChildSession(
  sessionDirectory: string,
  input: { childSessionId: string; sessionFile: string; agent: BundledSubagentName; parentSessionId: string },
): void {
  const index = readIndex(sessionDirectory) ?? emptyIndex();
  index.sessions[input.childSessionId] = {
    fileName: path.basename(input.sessionFile),
    agent: input.agent,
    parentSessionId: input.parentSessionId,
  };
  writeIndex(sessionDirectory, index);
}

/** Rebuild derived metadata exclusively from native JSONL headers and child identity entries. */
export function rebuildChildSessionIndex(sessionDirectory: string): ChildSessionIndex {
  const index = emptyIndex();
  let fileNames: string[] = [];
  try {
    fileNames = readdirSync(sessionDirectory).filter(fileName => fileName.endsWith('.jsonl'));
  } catch {
    return index;
  }

  for (const fileName of fileNames) {
    const sessionFile = path.join(sessionDirectory, fileName);
    try {
      const sessionManager = SessionManager.open(sessionFile);
      const identity = SubagentIdentityHandler.parse(sessionManager.getEntries());
      if (identity.kind !== 'child') continue;
      index.sessions[sessionManager.getSessionId()] = {
        fileName,
        agent: identity.identity.agent,
        parentSessionId: identity.identity.parentSessionId,
      };
    } catch {
      // A corrupt/non-child JSONL is not a discoverable managed child.
    }
  }

  writeIndex(sessionDirectory, index);
  return index;
}

function emptyIndex(): ChildSessionIndex {
  return { version: INDEX_VERSION, sessions: {} };
}

function readIndex(sessionDirectory: string): ChildSessionIndex | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path.join(sessionDirectory, INDEX_FILE), 'utf8')) as unknown;
    if (!isIndex(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function isIndex(value: unknown): value is ChildSessionIndex {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { version?: unknown; sessions?: unknown };
  return (
    candidate.version === INDEX_VERSION && Boolean(candidate.sessions) && typeof candidate.sessions === 'object' && !Array.isArray(candidate.sessions)
  );
}

function writeIndex(sessionDirectory: string, index: ChildSessionIndex): void {
  const indexPath = path.join(sessionDirectory, INDEX_FILE);
  const temporaryPath = `${indexPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, indexPath);
}
