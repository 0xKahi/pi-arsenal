import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';

export const PARENT_AGENT_CUSTOM_TYPE = 'arsenal-parent-agent';
export const PARENT_AGENT_VERSION = 1 as const;
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
  private preferred: ParentAgent = 'default';
  private active: ParentAgent = 'default';

  restore(entries: readonly SessionEntry[], configuredDefault: ParentAgent): ParentAgent {
    this.preferred = restoreParentAgent(entries, configuredDefault);
    this.active = this.preferred;
    return this.preferred;
  }

  select(agent: ParentAgent, append: (customType: string, data: ParentAgentSelection) => void): void {
    const selection = SelectionSchema.parse({ version: PARENT_AGENT_VERSION, agent });
    append(PARENT_AGENT_CUSTOM_TYPE, selection);
    this.preferred = agent;
  }

  setActive(agent: ParentAgent): void {
    this.active = agent;
  }

  getPreferred(): ParentAgent {
    return this.preferred;
  }

  getActive(): ParentAgent {
    return this.active;
  }
}
