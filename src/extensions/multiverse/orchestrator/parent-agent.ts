import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { PARENT_AGENT_CUSTOM_TYPE, PARENT_AGENT_VERSION } from '../constants.ts';

// Re-exported, never redeclared: durable entry types have one declared source in constants.ts.
export { PARENT_AGENT_CUSTOM_TYPE, PARENT_AGENT_VERSION };
export const PARENT_AGENTS = ['default', 'megamind'] as const;
export type ParentAgent = (typeof PARENT_AGENTS)[number];

export interface ParentAgentSelection {
  version: typeof PARENT_AGENT_VERSION;
  agent: ParentAgent;
}

const SelectionSchema = z.strictObject({
  version: z.literal(PARENT_AGENT_VERSION),
  agent: z.enum(PARENT_AGENTS),
});

/** Restore from physical append order, deliberately ignoring active tree branch. */
function restoreParentAgent(entries: readonly SessionEntry[], configuredDefault: ParentAgent): ParentAgent {
  let selected = configuredDefault;
  for (const entry of entries) {
    if (entry.type !== 'custom' || entry.customType !== PARENT_AGENT_CUSTOM_TYPE) continue;
    const parsed = SelectionSchema.safeParse(entry.data);
    if (parsed.success) selected = parsed.data.agent;
  }
  return selected;
}

export class ParentAgentState {
  private active: ParentAgent = 'default';

  /** Returns the saved preference; the caller decides whether it is eligible to become active. */
  restore(entries: readonly SessionEntry[], configuredDefault: ParentAgent): ParentAgent {
    const preferred = restoreParentAgent(entries, configuredDefault);
    this.active = preferred;
    return preferred;
  }

  /** Persists an explicit switch; the durable entry is the only record of the preference. */
  select(agent: ParentAgent, append: (customType: string, data: ParentAgentSelection) => void): void {
    const selection = SelectionSchema.parse({ version: PARENT_AGENT_VERSION, agent });
    append(PARENT_AGENT_CUSTOM_TYPE, selection);
  }

  setActive(agent: ParentAgent): void {
    this.active = agent;
  }

  getActive(): ParentAgent {
    return this.active;
  }
}
