import { describe, expect, it } from 'bun:test';
import type { Api, Model } from '@earendil-works/pi-ai';
import { resolveChildReasoning } from '../../../../src/extensions/multiverse/runtime/child-reasoning.ts';

const model = (reasoning: boolean, thinkingLevelMap?: Model<Api>['thinkingLevelMap']) => ({ reasoning, thinkingLevelMap }) as Model<Api>;

describe('resolveChildReasoning', () => {
  it('prefers configured reasoning over the parent level', () => {
    expect(resolveChildReasoning(model(true), 'low', 'high')).toBe('low');
  });

  it('inherits the parent level when no subagent reasoning is configured', () => {
    expect(resolveChildReasoning(model(true), undefined, 'high')).toBe('high');
  });

  it('clamps an unsupported high request instead of failing', () => {
    const selected = model(true, { high: null, xhigh: null, max: null });
    expect(resolveChildReasoning(selected, 'max', undefined)).toBe('medium');
  });

  it('uses off for a model without reasoning support', () => {
    expect(resolveChildReasoning(model(false), 'max', 'high')).toBe('off');
  });
});
