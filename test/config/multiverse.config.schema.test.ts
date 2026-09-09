import { describe, expect, it } from 'bun:test';
import { MultiverseConfigPartialSchema, MultiverseConfigSchema } from '../../src/schemas/multiverse.config.schema';

describe('Multiverse preset configuration schema', () => {
  it('keeps presets and defaultPreset optional', () => {
    const config = MultiverseConfigSchema.parse({});
    expect(config).not.toHaveProperty('presets');
    expect(config).not.toHaveProperty('defaultPreset');
  });

  it('accepts empty maps, entries, sparse fields, and arbitrary non-empty names', () => {
    const config = MultiverseConfigSchema.parse({
      defaultPreset: 'missing',
      presets: {
        empty: {},
        sparse: { fixer: { reasoning: 'high' } },
        constructor: { constructor: {}, agent: {} },
      },
    });

    expect(config.defaultPreset).toBe('missing');
    expect(config.presets?.empty).toEqual({});
    expect(config.presets?.sparse?.fixer).toEqual({ reasoning: 'high' });
    expect(Object.hasOwn(config.presets ?? {}, 'constructor')).toBe(true);
    expect(Object.hasOwn(config.presets?.constructor ?? {}, 'constructor')).toBe(true);
  });

  it('drops __proto__ names instead of polluting prototypes', () => {
    const config = MultiverseConfigSchema.parse(JSON.parse('{"presets":{"__proto__":{"fixer":{"modelId":"x"}},"smart":{}}}'));

    expect(Object.hasOwn(config.presets ?? {}, '__proto__')).toBe(false);
    expect(Object.hasOwn(config.presets ?? {}, 'smart')).toBe(true);
    expect(Object.getPrototypeOf(config.presets ?? {})).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).fixer).toBeUndefined();
  });

  it.each([
    [{ presets: { smart: { fixer: { provider: 1 } } } }],
    [{ presets: { smart: { fixer: { unsupported: 'value' } } } }],
    [{ presets: { smart: { fixer: { reasoning: 'extreme' } } } }],
    [{ presets: { '': {} } }],
    [{ presets: { smart: { '': {} } } }],
  ])('rejects invalid preset entries: %p', value => {
    expect(() => MultiverseConfigPartialSchema.parse(value)).toThrow();
  });
});
