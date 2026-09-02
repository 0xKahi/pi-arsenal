import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { SubagentIdentityHandler } from '../agents/session-identity.ts';
import type { BundledSubagentName } from '../agents/subagent-definition.ts';
import { rebuildChildSessionIndex, recordIndexedChildSession, resolveIndexedChildSession } from './child-session-index.ts';
import { assertSafeSessionId, resolveChildSessionDirectory, SUBAGENT_SESSIONS_ROOT } from './child-storage.util.ts';

export interface ChildSessionHandle {
  sessionId: string;
  sessionFile: string;
  sessionManager: SessionManager;
}

export interface ChildSessionRepositoryOptions {
  root?: string;
  createId?: () => string;
}

/**
 * Owns durable child session files.
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

  create(cwd: string, parentSessionId: string, agent: BundledSubagentName): ChildSessionHandle {
    const sessionId = this.createId();
    assertSafeSessionId(sessionId, 'child');
    const sessionDirectory = resolveChildSessionDirectory(cwd, parentSessionId, this.root);
    mkdirSync(sessionDirectory, { recursive: true });
    const sessionManager = SessionManager.create(cwd, sessionDirectory, { id: sessionId });
    SubagentIdentityHandler.markSession(sessionManager, agent, parentSessionId);
    const sessionFile = sessionManager.getSessionFile();
    if (!sessionFile) throw new Error(`Persistent child session ${sessionId} did not receive a session file.`);
    recordIndexedChildSession(sessionDirectory, { childSessionId: sessionId, sessionFile, agent, parentSessionId });
    return { sessionId, sessionFile, sessionManager };
  }

  /** Open a child owned by this parent. Validates ownership; does not select a checkpoint. */
  open(cwd: string, parentSessionId: string, childSessionId: string): ChildSessionHandle {
    assertSafeSessionId(childSessionId, 'child');
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
    assertSafeSessionId(childSessionId, 'child');
    const sessionDirectory = resolveChildSessionDirectory(cwd, parentSessionId, this.root);
    const indexed = resolveIndexedChildSession(sessionDirectory, childSessionId);
    if (indexed) return indexed;

    try {
      rebuildChildSessionIndex(sessionDirectory);
    } catch (error) {
      throw new Error(`Unable to index child session "${childSessionId}": ${formatError(error)}`);
    }
    const rebuilt = resolveIndexedChildSession(sessionDirectory, childSessionId);
    if (!rebuilt) throw new Error(`Child session "${childSessionId}" was not found for this parent.`);
    return rebuilt;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
