import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { FILE_MODIFYING_TOOL_NAMES } from '../constants.ts';

/**
 * Records paths a child modified, observed only from tool-execution events.
 *
 * Child prose is never parsed, and shell writes are intentionally not observed:
 * V1 reports what the runtime saw rather than claiming complete change detection.
 */
export class TouchLedger {
  private readonly paths = new Set<string>();
  private readonly modifyingTools: Set<string>;

  constructor(modifyingTools: Iterable<string> = FILE_MODIFYING_TOOL_NAMES) {
    this.modifyingTools = new Set(modifyingTools);
  }

  observe(event: AgentSessionEvent): void {
    // Only start/update carry call arguments; tool_execution_end reports rendered output.
    if (event.type !== 'tool_execution_start' && event.type !== 'tool_execution_update') return;
    if (!this.modifyingTools.has(event.toolName)) return;
    const path = extractPath(event.args);
    if (path) this.paths.add(path);
  }

  list(): string[] {
    return [...this.paths];
  }
}

function extractPath(value: unknown): string | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const candidate = value as { path?: unknown; filePath?: unknown; file?: unknown; notebookPath?: unknown };
  return [candidate.path, candidate.filePath, candidate.file, candidate.notebookPath].find(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0,
  );
}
