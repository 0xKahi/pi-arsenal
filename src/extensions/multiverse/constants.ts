import { homedir } from 'node:os';
import path from 'node:path';
import { piVimKeyEventId } from '../../constants';

/** Public tool name exposed to the model. */
export const SPAWN_TOOL_NAME = 'spawn';

export const COMMAND_NAME = 'multiverse';
export const PI_VIM_KEY_EVENT_ID = piVimKeyEventId(COMMAND_NAME);

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
 * Sized so no legitimate final message can reach it: a verbose subagent survey runs a few
 * hundred lines and single-digit kilobytes, so this sits an order of magnitude above the
 * plausible honest maximum. It exists only to stop a looping or file-dumping child from
 * evicting the parent's context, which the parent cannot recover from.
 *
 * Because it only ever fires on pathological output, there is no remedy to offer: the
 * body is cut, marked, and that is the end of it. Nothing instructs the parent to
 * continue the child for the remainder — a child that ignored its conciseness
 * instructions once has no new reason to obey them on a retry.
 *
 * Declared here once: `results/child-interaction.ts` re-exports these rather than redeclaring.
 */
export const MAX_OUTPUT_LINES = 20_000;
export const MAX_OUTPUT_BYTES = 256 * 1024;

export const AGENT_COLORS = {
  megamind: '#548be3',
};
