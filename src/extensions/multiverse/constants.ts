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

/** Bytes of randomness behind a result envelope's per-call boundary nonce. */
export const RESULT_BOUNDARY_NONCE_BYTES = 3;

/**
 * Circuit breaker for runaway child output, not a budget for routine reports.
 *
 * Sized well above an ordinary subagent final message (a verbose report runs a few
 * hundred lines and single-digit kilobytes) so the common path never trips it; it exists
 * only to stop a looping or file-dumping child from consuming the parent's context.
 * Declared here once: `results/output-cap.ts` re-exports these rather than redeclaring.
 */
export const MAX_OUTPUT_LINES = 2_000;
export const MAX_OUTPUT_BYTES = 64 * 1024;
