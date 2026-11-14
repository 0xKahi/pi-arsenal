import { readFileSync } from 'node:fs';
import type { FileEntry, SessionEntry } from '@earendil-works/pi-coding-agent';
import { isChildInteraction, isSpawnToolDetails, latestChildInteraction } from '../results/child-interaction.ts';
import { buildChildSessionSummary, type ChildSessionSummary, type FindContextWindow } from './child-session-summary.ts';
import { buildTranscriptBlocks, type TranscriptBlock } from './transcript-blocks.ts';

interface ChildSessionIdentity {
  childSessionId: string;
  agent: string;
  childSessionFile: string;
  lastUsed: string | null;
}

export type ChildSessionSnapshot = ChildSessionIdentity &
  (
    | {
        status: 'available';
        summary: ChildSessionSummary;
        getTranscriptBlocks: () => TranscriptBlock[];
      }
    | { status: 'unavailable'; reason: string }
  );

export interface ChildSessionProjectionOptions {
  readEntries?: (file: string) => readonly FileEntry[];
  findContextWindow?: FindContextWindow;
}

// Pi's public loadEntriesFromFile repairs missing trailing newlines, so read JSONL without writing.
function readEntriesFromFile(file: string): FileEntry[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

export function buildChildSessionSnapshots(
  branchEntries: readonly SessionEntry[],
  options: ChildSessionProjectionOptions = {},
): ChildSessionSnapshot[] {
  const ids = new Set<string>();
  for (const entry of branchEntries) {
    if (entry.type !== 'message' || entry.message.role !== 'toolResult' || !isSpawnToolDetails(entry.message.details)) continue;
    for (const interaction of entry.message.details.interactions) {
      if (isChildInteraction(interaction)) ids.add(interaction.childSessionId);
    }
  }
  const snapshots: ChildSessionSnapshot[] = [];
  for (const id of ids) {
    const interaction = latestChildInteraction(branchEntries, id);
    if (!interaction?.checkpointAfter) continue;
    const identity: ChildSessionIdentity = {
      childSessionId: id,
      agent: interaction.agent,
      childSessionFile: interaction.childSessionFile,
      lastUsed: null,
    };
    try {
      const entries = (options.readEntries ?? readEntriesFromFile)(interaction.childSessionFile).filter(
        (entry): entry is SessionEntry => entry.type !== 'session',
      );
      const byId = new Map<string, SessionEntry>();
      for (const entry of entries) {
        if (!entry || typeof entry.id !== 'string' || !entry.id || !(entry.parentId === null || typeof entry.parentId === 'string'))
          throw new Error('Unsupported or corrupt session entries');
        if (byId.has(entry.id)) throw new Error('Duplicate session entry id');
        byId.set(entry.id, entry);
      }
      const checkpoint = byId.get(interaction.checkpointAfter);
      if (!checkpoint) throw new Error('Checkpoint missing from child session');
      identity.lastUsed = Number.isFinite(Date.parse(checkpoint.timestamp)) ? checkpoint.timestamp : null;
      const path: SessionEntry[] = [];
      const visited = new Set<string>();
      let current: string | null = interaction.checkpointAfter;
      while (current !== null) {
        if (visited.has(current)) throw new Error('Cycle in child session path');
        visited.add(current);
        const entry = byId.get(current);
        if (!entry) throw new Error('Missing ancestor in child session path');
        path.push(entry);
        current = entry.parentId;
      }
      path.reverse();
      let blocks: TranscriptBlock[] | undefined;
      snapshots.push({
        ...identity,
        status: 'available',
        summary: buildChildSessionSummary(path, options.findContextWindow),
        getTranscriptBlocks: () => (blocks ??= buildTranscriptBlocks(path)),
      });
    } catch (error) {
      snapshots.push({ ...identity, status: 'unavailable', reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return snapshots.sort(
    (a, b) =>
      (b.lastUsed ? Date.parse(b.lastUsed) : -Infinity) - (a.lastUsed ? Date.parse(a.lastUsed) : -Infinity) ||
      (a.childSessionId < b.childSessionId ? -1 : a.childSessionId > b.childSessionId ? 1 : 0),
  );
}
