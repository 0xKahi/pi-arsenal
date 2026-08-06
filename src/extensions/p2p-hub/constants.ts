import { piVimKeyEventId } from '../../constants';

export const COMMAND_NAME = 'p2p-hub';
export const PI_VIM_KEY_EVENT_ID = piVimKeyEventId('p2p_hub');

export const STATUS_WIDGET_KEY = 'p2p-hub-status';

/** No agent activity from a remote prompt target within this window → p2p_ask times out. */
export const PROMPT_INACTIVITY_MS = 90_000;
/** Absolute ceiling regardless of activity, backstop against a stuck keepalive contract. */
export const PROMPT_HARD_CEILING_MS = 1_800_000;
export const KEEPALIVE_INTERVAL_MS = 30_000;
/** Idle-gated inbox flush delay after a triggerTurn message arrives. */
export const FLUSH_DELAY_MS = 200;
/** Retry delay when the recipient is not yet idle for inbox flush. */
export const IDLE_RETRY_MS = 500;
export const BATCH_MAX_ITEMS = 20;
export const BATCH_MAX_CHARS = 16_000;
/** Jitter window before a client attempts promotion after host death. */
export const PROMOTION_BASE_DELAY_MS = 500;
export const PROMOTION_JITTER_MS = 1500;
export const RECONNECT_RETRY_MS = 2000;
export const PEEK_TIMEOUT_MS = 3000;
/** Maximum time an open client transport may wait for an authoritative welcome. */
export const WELCOME_TIMEOUT_MS = 3000;
/** Maximum time a process-scoped connection may remain without a runtime binding. */
export const RUNTIME_HANDOFF_TIMEOUT_MS = 5000;
