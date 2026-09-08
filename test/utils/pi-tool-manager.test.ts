import { describe, expect, it } from 'bun:test';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { PiToolManager } from '../../src/utils/pi-tool-manager.util.ts';

const setup = () => {
  let active = ['read', 'external'];
  const selections: string[][] = [];
  const pi = {
    getActiveTools: () => active,
    getAllTools: () => ['read', 'external', 'spawn'].map(name => ({ name })),
    setActiveTools: (names: string[]) => {
      active = names;
      selections.push(names);
    },
  } as unknown as ExtensionAPI;
  return { pi, selections, active: () => active };
};

describe('PiToolManager', () => {
  it('adds once while preserving unrelated tools', () => {
    const { pi, active, selections } = setup();
    PiToolManager.addActive(pi, ['spawn', 'spawn', 'read']);
    PiToolManager.addActive(pi, ['spawn']);
    expect(active()).toEqual(['read', 'external', 'spawn']);
    expect(selections).toHaveLength(1);
  });

  it('removes only requested tools and does not set on a no-op', () => {
    const { pi, active, selections } = setup();
    PiToolManager.removeActive(pi, ['spawn']);
    expect(selections).toEqual([]);
    PiToolManager.removeActive(pi, ['read']);
    expect(active()).toEqual(['external']);
  });

  it('overrides with only the registered subset', () => {
    const { pi, active } = setup();
    PiToolManager.overrideActive(pi, ['spawn', 'missing', 'spawn']);
    expect(active()).toEqual(['spawn']);
    PiToolManager.overrideActive(pi, []);
    expect(active()).toEqual([]);
  });
});
