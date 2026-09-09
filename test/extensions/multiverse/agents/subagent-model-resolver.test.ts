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
});
