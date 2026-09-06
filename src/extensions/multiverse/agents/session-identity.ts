import type { SessionEntry, SessionManager } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';

export const SUBAGENT_IDENTITY_CUSTOM_TYPE = 'arsenal-subagent';
export const SUBAGENT_IDENTITY_VERSION = 1 as const;

export interface SubagentIdentity {
  version: typeof SUBAGENT_IDENTITY_VERSION;
  agent: string;
  parentSessionId: string;
}

export type SubagentIdentityResult =
  | { kind: 'none' }
  | { kind: 'child'; identity: SubagentIdentity; entryId: string }
  | { kind: 'invalid'; error: string };

const IdentitySchema = z.strictObject({
  version: z.literal(SUBAGENT_IDENTITY_VERSION),
  agent: z.string().trim().min(1),
  parentSessionId: z.string().min(1),
});

export class SubagentIdentityHandler {
  private constructor() {}

  /** Scan every physical session entry so identity is independent of the active branch. */
  static parse(entries: readonly SessionEntry[]): SubagentIdentityResult {
    const markers = entries.filter(
      (entry): entry is Extract<SessionEntry, { type: 'custom' }> => entry.type === 'custom' && entry.customType === SUBAGENT_IDENTITY_CUSTOM_TYPE,
    );

    const marker = markers[0];
    if (!marker) return { kind: 'none' };
    if (markers.length > 1) {
      return {
        kind: 'invalid',
        error: `Expected exactly one ${SUBAGENT_IDENTITY_CUSTOM_TYPE} entry, found ${markers.length}.`,
      };
    }

    const parsed = IdentitySchema.safeParse(marker.data);
    if (!parsed.success) {
      return {
        kind: 'invalid',
        error: `Invalid ${SUBAGENT_IDENTITY_CUSTOM_TYPE} entry ${marker.id}: ${parsed.error.message}`,
      };
    }

    return { kind: 'child', identity: parsed.data, entryId: marker.id };
  }

  static create(agent: string, parentSessionId: string): SubagentIdentity {
    return IdentitySchema.parse({ version: SUBAGENT_IDENTITY_VERSION, agent, parentSessionId });
  }

  /** Mark a newly created child through its own SessionManager before any prompt is appended. */
  static markSession(sessionManager: SessionManager, agent: string, parentSessionId: string): string {
    const existing = SubagentIdentityHandler.parse(sessionManager.getEntries());
    if (existing.kind !== 'none') {
      throw new Error(
        existing.kind === 'invalid'
          ? `Cannot mark child session: ${existing.error}`
          : `Cannot mark child session ${sessionManager.getSessionId()}: identity already exists.`,
      );
    }

    const identity = SubagentIdentityHandler.create(agent, parentSessionId);
    return sessionManager.appendCustomEntry(SUBAGENT_IDENTITY_CUSTOM_TYPE, identity);
  }
}
