import { describe, expect, it } from 'bun:test';
import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { PARENT_AGENT_CUSTOM_TYPE, ParentAgentState } from '../../../../src/extensions/multiverse/orchestrator/parent-agent.ts';

const selectionEntry = (id: string, data: unknown, parentId: string | null): SessionEntry => ({
  type: 'custom',
  id,
  parentId,
  timestamp: '2026-01-01T00:00:00.000Z',
  customType: PARENT_AGENT_CUSTOM_TYPE,
  data,
});

describe('parent-agent persistence', () => {
  it('uses the configured default when no recorded selection exists', () => {
    expect(new ParentAgentState().restore([], 'megamind')).toBe('megamind');
  });

  it('restores the last physically recorded valid selection across branches', () => {
    const entries = [
      selectionEntry('one', { version: 1, agent: 'megamind' }, 'branch-a'),
      selectionEntry('invalid', { version: 2, agent: 'default' }, 'branch-b'),
      selectionEntry('two', { version: 1, agent: 'default' }, 'abandoned-branch'),
      selectionEntry('malformed', { agent: 'megamind' }, 'active-branch'),
    ];

    expect(new ParentAgentState().restore(entries, 'megamind')).toBe('default');
  });

  it('appends every explicit switch and updates the in-memory preference', () => {
    const state = new ParentAgentState();
    const appended: Array<{ customType: string; data: unknown }> = [];
    const append = (customType: string, data: unknown) => appended.push({ customType, data });

    state.select('megamind', append);
    state.select('default', append);

    expect(appended).toEqual([
      { customType: PARENT_AGENT_CUSTOM_TYPE, data: { version: 1, agent: 'megamind' } },
      { customType: PARENT_AGENT_CUSTOM_TYPE, data: { version: 1, agent: 'default' } },
    ]);
    expect(state.getPreferred()).toBe('default');
  });
});
