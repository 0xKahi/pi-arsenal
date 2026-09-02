import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { type ChildInteraction, isChildInteraction, isSpawnToolDetails } from './child-interaction.types.ts';

/**
 * Resolve the newest interaction for a child on the active parent branch.
 *
 * Continuation is deliberately branch-scoped: a child created only on an abandoned
 * branch is not reachable, so no implicit cross-branch import can occur.
 */
export function latestChildInteraction(entries: readonly SessionEntry[], childSessionId: string): ChildInteraction | undefined {
  for (let entryIndex = entries.length - 1; entryIndex >= 0; entryIndex--) {
    const entry = entries[entryIndex];
    if (entry?.type !== 'message' || entry.message.role !== 'toolResult') continue;
    const details = 'details' in entry.message ? entry.message.details : undefined;
    if (!isSpawnToolDetails(details)) continue;

    for (let index = details.interactions.length - 1; index >= 0; index--) {
      const candidate = details.interactions[index];
      if (isChildInteraction(candidate) && candidate.childSessionId === childSessionId) return candidate;
    }
  }
  return undefined;
}
