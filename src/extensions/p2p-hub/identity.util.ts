import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { parse } from 'yaml';
import { PathUtil } from '../../utils/path.util';

export interface P2pAgentIdentity {
  name: string;
  description: string | undefined;
}

interface RoleFileShape {
  name?: unknown;
  description?: unknown;
}

/**
 * Resolve an agent's p2p identity from `<cwd>/.arsenal/p2p-role.yml`.
 * No upward directory traversal: cwd is used literally, since not every
 * cwd pi is launched from is a git repository.
 * Falls back to `basename(cwd)` for the name when the file is absent,
 * unreadable, invalid, or omits `name`.
 */
export function resolveP2pIdentity(cwd: string): P2pAgentIdentity {
  const fallbackName = basename(cwd) || cwd;
  const rolePath = PathUtil.findArsenalConfig({ type: 'project', cwd, path: 'p2p-role.yml' });

  if (!rolePath.exists) {
    return { name: fallbackName, description: undefined };
  }

  let raw: unknown;
  try {
    raw = parse(readFileSync(rolePath.path, 'utf8'));
  } catch {
    return { name: fallbackName, description: undefined };
  }

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { name: fallbackName, description: undefined };
  }

  const shape = raw as RoleFileShape;
  const name = typeof shape.name === 'string' && shape.name.trim() !== '' ? shape.name.trim() : fallbackName;
  const description = typeof shape.description === 'string' && shape.description.trim() !== '' ? shape.description.trim() : undefined;

  return { name, description };
}
