import { describe, expect, it } from 'bun:test';
import { ChildAdmissionRegistry, validateDistinctContinueTargets } from '../../../../src/extensions/multiverse/runtime/child-admission.ts';

describe('ChildAdmissionRegistry', () => {
  it('allows one managed writer and releases admission once', () => {
    const registry = new ChildAdmissionRegistry();
    const release = registry.acquire('child-1');

    expect(() => registry.acquire('child-1')).toThrow('already has an active');
    release();
    release();
    expect(registry.acquire('child-1')).toBeDefined();
  });

  it('rejects duplicate batch continuation targets before writers open', () => {
    expect(() => validateDistinctContinueTargets([{ childSessionId: 'one' }, { childSessionId: 'one' }])).toThrow('Duplicate continuation target');
    expect(() => validateDistinctContinueTargets([{ childSessionId: 'one' }, { childSessionId: 'two' }])).not.toThrow();
  });
});
