import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export type PathValidationResult = { success: true; normalizedPath: string } | { success: false; error: string };

/**
 * Normalize a tmux_popup file path:
 * - Remove one optional leading `@`.
 * - Expand `~` or `~/...` to the current user's home directory.
 * - Reject `~other-user` paths.
 * - Require the result to be an absolute path.
 */
export function normalizeTmuxPopupPath(rawPath: string): PathValidationResult {
  let normalized = rawPath;

  if (normalized.startsWith('@')) {
    normalized = normalized.slice(1);
  }

  if (normalized === '~' || normalized.startsWith('~/')) {
    normalized = path.join(homedir(), normalized === '~' ? '' : normalized.slice(2));
  } else if (normalized.startsWith('~')) {
    return { success: false, error: 'Home directory expansion for other users is not supported.' };
  }

  if (!path.isAbsolute(normalized)) {
    return { success: false, error: 'An absolute file path is required.' };
  }

  return { success: true, normalizedPath: normalized };
}

/**
 * Validate that the normalized path exists and resolves to a file.
 * Accepts regular files and file-targeting symlinks; rejects missing paths
 * and directories.
 */
export function validateExistingFile(normalizedPath: string): PathValidationResult {
  try {
    const stats = statSync(normalizedPath);
    if (stats.isDirectory()) {
      return { success: false, error: `Path is a directory: ${normalizedPath}` };
    }
    if (!stats.isFile()) {
      return { success: false, error: `Path is not a file: ${normalizedPath}` };
    }
    return { success: true, normalizedPath };
  } catch {
    return { success: false, error: `File does not exist: ${normalizedPath}` };
  }
}
