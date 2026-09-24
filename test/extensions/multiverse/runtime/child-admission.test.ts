import { describe, expect, it } from 'bun:test';
import { ChildAdmissionRegistry } from '../../../../src/extensions/multiverse/runtime/child-admission.ts';

describe('ChildAdmissionRegistry', () => {
  it('allows one managed writer and releases admission once', () => {
    const registry = new ChildAdmissionRegistry();
    const release = registry.acquire('child-1');

    expect(() => registry.acquire('child-1')).toThrow('already has an active');
    release();
    release();
    expect(registry.acquire('child-1')).toBeDefined();
  });
});
