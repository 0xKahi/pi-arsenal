import { createHash } from 'node:crypto';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { SAFE_SESSION_ID_PATTERN, SUBAGENT_SESSIONS_ROOT } from '../constants.ts';

export { SUBAGENT_SESSIONS_ROOT };

export function canonicalizeWorkingDirectory(cwd: string): string {
  const resolved = path.resolve(cwd);
  return existsSync(resolved) ? realpathSync.native(resolved) : resolved;
}

export function createWorkingDirectoryKey(cwd: string): string {
  return createHash('sha256').update(canonicalizeWorkingDirectory(cwd)).digest('hex');
}

/** Session IDs become path segments, so anything that could escape the bucket is rejected. */
export function assertSafeSessionId(value: string, label: string): void {
  if (!SAFE_SESSION_ID_PATTERN.test(value)) throw new Error(`Invalid ${label} session ID: ${JSON.stringify(value)}`);
}

export function resolveChildSessionDirectory(cwd: string, parentSessionId: string, root = SUBAGENT_SESSIONS_ROOT): string {
  assertSafeSessionId(parentSessionId, 'parent');
  return path.join(root, createWorkingDirectoryKey(cwd), parentSessionId);
}
