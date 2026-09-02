import { homedir } from 'node:os';
import path from 'node:path';

/** Public tool name exposed to the model. */
export const SPAWN_TOOL_NAME = 'spawn';

/** Durable custom session entry types written by Multiverse. */
export const SUBAGENT_IDENTITY_CUSTOM_TYPE = 'arsenal-subagent';
export const PARENT_AGENT_CUSTOM_TYPE = 'arsenal-parent-agent';
export const SPAWN_MANIFEST_CUSTOM_TYPE = 'arsenal-spawn-manifest';

/** Versions for every durable Multiverse payload. */
export const SUBAGENT_IDENTITY_VERSION = 1 as const;
export const PARENT_AGENT_VERSION = 1 as const;
export const CHILD_INTERACTION_VERSION = 1 as const;
export const SPAWN_MANIFEST_VERSION = 1 as const;
export const CHILD_SESSION_INDEX_VERSION = 1 as const;

/** Durable child session storage. */
export const SUBAGENT_SESSIONS_ROOT = path.join(homedir(), '.arsenal', 'subagent_sessions');
export const CHILD_SESSION_INDEX_FILE = 'index.json';

/** Session IDs are used as path segments, so they must never contain separators. */
export const SAFE_SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Identifier prefixes. */
export const INTERACTION_ID_PREFIX = 'mv-interaction';
export const RESULT_ENVELOPE_PREFIX = 'MV-RESULT';

/** Model-facing output bounds. Full output stays recoverable from the child session file. */
export const MAX_OUTPUT_LINES = 500;
export const MAX_OUTPUT_BYTES = 16 * 1024;

/** Tools whose arguments identify a file the child modified. */
export const FILE_MODIFYING_TOOL_NAMES = ['edit', 'write', 'multi_edit', 'apply_patch', 'notebook_edit'] as const;
