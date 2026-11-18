import { describe, expect, it } from 'bun:test';
import { SubAgentModelResolver } from '../../../../src/extensions/multiverse/agents/subagent-model-resolver.ts';
import type { MultiverseConfig } from '../../../../src/schemas/multiverse.config.schema.ts';

const config = (overrides: Record<string, unknown> = {}) =>
  ({
    enabled: true,
    defaultAgent: 'default',
    maxConcurrency: 5,
    subagents: {
      fixer: { enabled: true, model: { provider: 'base-provider', modelId: 'base-model', reasoning: 'low' } },
      explorer: { enabled: true },
    },
    ...overrides,
  }) as MultiverseConfig;

describe('SubAgentModelResolver', () => {
  it('uses a valid configured default and distinguishes named default from baseline', () => {
    const settings = config({ defaultPreset: 'default', presets: { default: {} } });
    const resolver = new SubAgentModelResolver(settings);
    expect(resolver.currentSelection()).toEqual({ kind: 'named', name: 'default' });
    resolver.select({ kind: 'baseline' });
    expect(resolver.currentSelection()).toEqual({ kind: 'baseline' });
  });

  describe('presetOverride', () => {
    const named = (megamind: unknown, extra: Record<string, unknown> = {}) =>
      new SubAgentModelResolver(config({ presets: { smart: { megamind, ...extra } } }));
    const smart = { kind: 'named', name: 'smart' } as const;

    it('returns sparse model-only, provider-only, and reasoning-only fields unfilled', () => {
      expect(named({ modelId: 'm2' }).presetOverride('megamind', smart)).toEqual({ modelId: 'm2' });
      expect(named({ provider: 'p2' }).presetOverride('megamind', smart)).toEqual({ provider: 'p2' });
      const reasoning = named({ reasoning: 'high' }).presetOverride('megamind', smart);
      expect(reasoning).toEqual({ reasoning: 'high' });
      expect(reasoning && 'modelId' in reasoning).toBe(false);
    });

    it('returns undefined for empty, missing, baseline, and removed entries', () => {
      expect(named({}).presetOverride('megamind', smart)).toBeUndefined();
      expect(named(undefined).presetOverride('megamind', smart)).toBeUndefined();
      expect(new SubAgentModelResolver(config({ presets: { smart: { fixer: {} } } })).presetOverride('megamind', smart)).toBeUndefined();
      expect(named({ modelId: 'm2' }).presetOverride('megamind', { kind: 'baseline' })).toBeUndefined();
      expect(named({ modelId: 'm2' }).presetOverride('megamind', { kind: 'named', name: 'removed' })).toBeUndefined();
    });

    it('distinguishes a configured preset named default from the baseline', () => {
      const r = new SubAgentModelResolver(config({ presets: { default: { megamind: { reasoning: 'low' } } } }));
      expect(r.presetOverride('megamind', { kind: 'named', name: 'default' })).toEqual({ reasoning: 'low' });
      expect(r.presetOverride('megamind', { kind: 'baseline' })).toBeUndefined();
    });

    it('ignores subagent settings, uses the current selection by default, and does not mutate', () => {
      const settings = config({
        subagents: { megamind: { enabled: true, model: { modelId: 'child' } } },
        presets: { smart: { megamind: { modelId: 'm2' } } },
      });
      const r = new SubAgentModelResolver(settings);
      const before = JSON.stringify(settings);
      expect(r.presetOverride('megamind', smart)).toEqual({ modelId: 'm2' });
      expect(r.presetOverride('megamind')).toBeUndefined();
      expect(r.currentSelection()).toEqual({ kind: 'baseline' });
      expect(JSON.stringify(settings)).toBe(before);
      // Child resolution of the same key still layers the entry over subagent settings.
      expect(r.resolveModel('megamind', smart)).toEqual({ modelId: 'm2' });
    });
  });

  it('normalizes missing defaults and removed named selections', () => {
    const resolver = new SubAgentModelResolver(config({ defaultPreset: 'missing', presets: { smart: {} } }));
    expect(resolver.currentSelection()).toEqual({ kind: 'baseline' });
    resolver.select({ kind: 'named', name: 'removed' });
    expect(resolver.currentSelection()).toEqual({ kind: 'baseline' });
  });

  it('composes every field over subagent settings without mutating source configuration', () => {
    const settings = config({
      presets: { smart: { fixer: { provider: 'preset-provider', modelId: 'preset-model', reasoning: 'high' }, explorer: {} } },
    });
    const resolver = new SubAgentModelResolver(settings);
    const before = JSON.stringify(settings);
    expect(resolver.resolveModel('fixer', { kind: 'named', name: 'smart' })).toEqual({
      provider: 'preset-provider',
      modelId: 'preset-model',
      reasoning: 'high',
    });
    expect(resolver.resolveModel('explorer', { kind: 'named', name: 'smart' })).toEqual({});
    expect(resolver.resolveModel('unknown', { kind: 'named', name: 'smart' })).toEqual({});
    expect(JSON.stringify(settings)).toBe(before);
  });

  it('safely handles prototype-like preset and agent names', () => {
    const settings = config({ presets: { constructor: { fixer: { reasoning: 'max' }, constructor: { modelId: 'constructor-model' } } } });
    const resolver = new SubAgentModelResolver(settings);
    resolver.select({ kind: 'named', name: 'constructor' });
    expect(resolver.resolveModel('fixer')).toEqual({ provider: 'base-provider', modelId: 'base-model', reasoning: 'max' });
    expect(resolver.resolveModel('constructor')).toEqual({ modelId: 'constructor-model' });
  });

  it('refreshes configuration without losing explicit selection and resets on session initialization', () => {
    const resolver = new SubAgentModelResolver(config({ defaultPreset: 'smart', presets: { smart: {}, fast: {} } }));
    expect(resolver.currentSelection()).toEqual({ kind: 'named', name: 'smart' });
    resolver.select({ kind: 'named', name: 'fast' });
    resolver.updateConfig(config({ defaultPreset: 'smart', presets: { smart: {}, fast: {} } }));
    expect(resolver.currentSelection()).toEqual({ kind: 'named', name: 'fast' });
    resolver.reset(config({ defaultPreset: 'smart', presets: { smart: {}, fast: {} } }));
    expect(resolver.currentSelection()).toEqual({ kind: 'named', name: 'smart' });
    resolver.reset(config({ defaultPreset: 'missing', presets: {} }));
    expect(resolver.currentSelection()).toEqual({ kind: 'baseline' });
  });

  it('refreshes the settings model a discovered user agent resolves from', () => {
    const resolver = new SubAgentModelResolver(
      config({ subagents: { explorer: { enabled: true, model: { provider: 'user-provider', modelId: 'user-model', reasoning: 'high' } } } }),
    );
    expect(resolver.resolveModel('explorer')).toEqual({ provider: 'user-provider', modelId: 'user-model', reasoning: 'high' });
    resolver.updateConfig(
      config({ subagents: { explorer: { enabled: true, model: { provider: 'next-provider', modelId: 'next-model', reasoning: 'low' } } } }),
    );
    expect(resolver.resolveModel('explorer')).toEqual({ provider: 'next-provider', modelId: 'next-model', reasoning: 'low' });
  });

  it('lets an active preset override a discovered user agent settings model field by field', () => {
    const resolver = new SubAgentModelResolver(
      config({
        presets: { smart: { explorer: { provider: 'preset-provider', reasoning: 'max' } } },
        subagents: { explorer: { enabled: true, model: { provider: 'user-provider', modelId: 'user-model', reasoning: 'medium' } } },
      }),
    );
    expect(resolver.resolveModel('explorer', { kind: 'named', name: 'smart' })).toEqual({
      provider: 'preset-provider',
      modelId: 'user-model',
      reasoning: 'max',
    });
  });
});
