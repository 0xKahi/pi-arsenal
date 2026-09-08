import type { ChildInteraction } from '../../../src/extensions/multiverse/results/child-interaction.ts';

/** Minimal valid interaction used across Multiverse result tests. */
export function childInteraction(overrides: Partial<ChildInteraction> = {}): ChildInteraction {
  return {
    version: 1,
    interactionId: 'mv-interaction-0',
    taskIndex: 0,
    agent: 'fixer',
    status: 'success',
    childSessionId: 'child-1',
    childSessionFile: '/sessions/child-1.jsonl',
    checkpointBefore: null,
    checkpointAfter: 'leaf',
    body: '',
    telemetry: { model: 'anthropic/model', durationMs: 5, requests: 1, tokensInput: 10, tokensOutput: 5, cost: 0.01 },
    ...overrides,
  };
}
