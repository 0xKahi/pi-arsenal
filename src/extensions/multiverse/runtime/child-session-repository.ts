import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { Atomic } from '../../../utils/atomic.util.ts';
import { SubagentIdentityHandler } from '../agents/session-identity.ts';
import {
  CHILD_SESSION_INDEX_FILE as INDEX_FILE,
  CHILD_SESSION_INDEX_VERSION as INDEX_VERSION,
  SAFE_SESSION_ID_PATTERN,
  SUBAGENT_SESSIONS_ROOT,
} from '../constants.ts';

export interface ChildSessionHandle {
  sessionId: string;
  sessionFile: string;
  sessionManager: SessionManager;
}

export interface ChildSessionRepositoryOptions {
  root?: string;
  createId?: () => string;
}

interface ChildSessionIndexEntry {
  fileName: string;
  agent: string;
  parentSessionId: string;
}

interface ChildSessionIndex {
  version: typeof INDEX_VERSION;
  sessions: Record<string, ChildSessionIndexEntry>;
}

/**
 * Owns durable child session files, the working-directory bucketing that separates
 * them, and the derived index used to find one by ID.
 *
 * Opening a child never moves its leaf: checkpoint selection belongs to the
 * interaction that is about to run, so branching lives in one place only.
 */
export class ChildSessionRepository {
  private readonly root: string;
  private readonly createId: () => string;

  constructor(options: ChildSessionRepositoryOptions = {}) {
    this.root = options.root ?? SUBAGENT_SESSIONS_ROOT;
    this.createId = options.createId ?? randomUUID;
  }

  create(cwd: string, parentSessionId: string, agent: string): ChildSessionHandle {
    const sessionId = this.createId();
    ChildSessionRepository.assertSafeSessionId(sessionId, 'child');
    const sessionDirectory = this.sessionDirectory(cwd, parentSessionId);
    mkdirSync(sessionDirectory, { recursive: true });
    const sessionManager = SessionManager.create(cwd, sessionDirectory, { id: sessionId });
    SubagentIdentityHandler.markSession(sessionManager, agent, parentSessionId);
    const sessionFile = sessionManager.getSessionFile();
    if (!sessionFile) throw new Error(`Persistent child session ${sessionId} did not receive a session file.`);
    this.recordIndexEntry(sessionDirectory, { childSessionId: sessionId, sessionFile, agent, parentSessionId });
    return { sessionId, sessionFile, sessionManager };
  }

  /** Open a child owned by this parent. Validates ownership; does not select a checkpoint. */
  open(cwd: string, parentSessionId: string, childSessionId: string): ChildSessionHandle {
    ChildSessionRepository.assertSafeSessionId(childSessionId, 'child');
    const sessionFile = this.locate(cwd, parentSessionId, childSessionId);
    const sessionManager = SessionManager.open(sessionFile);
    if (sessionManager.getSessionId() !== childSessionId) {
      throw new Error(`Child session header ID does not match requested ID "${childSessionId}".`);
    }
    const identity = SubagentIdentityHandler.parse(sessionManager.getEntries());
    if (identity.kind !== 'child') {
      throw new Error(identity.kind === 'invalid' ? identity.error : `Child session "${childSessionId}" has no arsenal-subagent identity.`);
    }
    if (identity.identity.parentSessionId !== parentSessionId) {
      throw new Error(
        `Child session "${childSessionId}" is owned by parent "${identity.identity.parentSessionId}"; cross-parent import is not supported in V1.`,
      );
    }
    return { sessionId: childSessionId, sessionFile, sessionManager };
  }

  locate(cwd: string, parentSessionId: string, childSessionId: string): string {
    ChildSessionRepository.assertSafeSessionId(childSessionId, 'child');
    const sessionDirectory = this.sessionDirectory(cwd, parentSessionId);
    const indexed = this.resolveIndexed(sessionDirectory, childSessionId);
    if (indexed) return indexed;

    try {
      this.rebuildIndex(sessionDirectory);
    } catch (error) {
      throw new Error(`Unable to index child session "${childSessionId}": ${formatError(error)}`);
    }
    const rebuilt = this.resolveIndexed(sessionDirectory, childSessionId);
    if (!rebuilt) throw new Error(`Child session "${childSessionId}" was not found for this parent.`);
    return rebuilt;
  }

  // --- storage layout ---------------------------------------------------

  private sessionDirectory(cwd: string, parentSessionId: string): string {
    ChildSessionRepository.assertSafeSessionId(parentSessionId, 'parent');
    return path.join(this.root, ChildSessionRepository.workingDirectoryKey(cwd), parentSessionId);
  }

  private static canonicalizeWorkingDirectory(cwd: string): string {
    const resolved = path.resolve(cwd);
    return existsSync(resolved) ? realpathSync.native(resolved) : resolved;
  }

  private static workingDirectoryKey(cwd: string): string {
    return createHash('sha256').update(ChildSessionRepository.canonicalizeWorkingDirectory(cwd)).digest('hex');
  }

  /** Session IDs become path segments, so anything that could escape the bucket is rejected. */
  private static assertSafeSessionId(value: string, label: string): void {
    if (!SAFE_SESSION_ID_PATTERN.test(value)) throw new Error(`Invalid ${label} session ID: ${JSON.stringify(value)}`);
  }

  // --- derived index ----------------------------------------------------

  private resolveIndexed(sessionDirectory: string, childSessionId: string): string | undefined {
    const entry = this.readIndex(sessionDirectory)?.sessions[childSessionId];
    if (!entry) return undefined;
    const sessionFile = path.join(sessionDirectory, entry.fileName);
    return existsSync(sessionFile) ? sessionFile : undefined;
  }

  private recordIndexEntry(
    sessionDirectory: string,
    input: { childSessionId: string; sessionFile: string; agent: string; parentSessionId: string },
  ): void {
    const index = this.readIndex(sessionDirectory) ?? emptyIndex();
    index.sessions[input.childSessionId] = {
      fileName: path.basename(input.sessionFile),
      agent: input.agent,
      parentSessionId: input.parentSessionId,
    };
    this.writeIndex(sessionDirectory, index);
  }

  /** Rebuild derived metadata exclusively from native JSONL headers and child identity entries. */
  private rebuildIndex(sessionDirectory: string): ChildSessionIndex {
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

    this.writeIndex(sessionDirectory, index);
    return index;
  }

  private readIndex(sessionDirectory: string): ChildSessionIndex | undefined {
    try {
      const parsed = JSON.parse(readFileSync(path.join(sessionDirectory, INDEX_FILE), 'utf8')) as unknown;
      return isIndex(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private writeIndex(sessionDirectory: string, index: ChildSessionIndex): void {
    Atomic.writeSync({ filePath: path.join(sessionDirectory, INDEX_FILE), data: index });
  }
}

function emptyIndex(): ChildSessionIndex {
  return { version: INDEX_VERSION, sessions: {} };
}

function isIndex(value: unknown): value is ChildSessionIndex {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { version?: unknown; sessions?: unknown };
  return (
    candidate.version === INDEX_VERSION && Boolean(candidate.sessions) && typeof candidate.sessions === 'object' && !Array.isArray(candidate.sessions)
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
