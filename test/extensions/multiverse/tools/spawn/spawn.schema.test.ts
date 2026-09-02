import { describe, expect, it } from 'bun:test';
import {
  buildChildPrompt,
  describeTask,
  spawnParameters,
  validateSpawnInput,
} from '../../../../../src/extensions/multiverse/tools/spawn/spawn.schema.ts';

const options = { availableAgents: ['fixer'] };

describe('spawn input validation', () => {
  it('accepts ordered create and continue variants', () => {
    const parsed = validateSpawnInput(
      {
        context: 'shared context',
        tasks: [
          { action: 'create', agent: 'fixer', task: 'implement', name: 'implementation' },
          { action: 'continue', childSessionId: 'child-1', task: 'follow up' },
        ],
      },
      options,
    );

    expect(parsed.tasks.map(task => task.action)).toEqual(['create', 'continue']);
    expect(parsed.tasks[1]).toMatchObject({ action: 'continue', childSessionId: 'child-1' });
    expect(spawnParameters.type).toBe('object');
  });

  it.each([
    ['empty array', { context: 'x', tasks: [] }],
    ['ambiguous variant', { context: 'x', tasks: [{ action: 'create', agent: 'fixer', childSessionId: 'x', task: 'x' }] }],
    ['unknown agent', { context: 'x', tasks: [{ action: 'create', agent: 'unknown', task: 'x' }] }],
    [
      'duplicate continue',
      {
        context: 'x',
        tasks: [
          { action: 'continue', childSessionId: 'same', task: 'x' },
          { action: 'continue', childSessionId: 'same', task: 'x' },
        ],
      },
    ],
    ['unknown field', { context: 'x', tasks: [{ action: 'create', agent: 'fixer', task: 'x', extra: true }] }],
  ])('rejects %s before dispatch', (_label, input) => {
    expect(() => validateSpawnInput(input, options)).toThrow('rejected before dispatch');
  });
});

describe('buildChildPrompt', () => {
  it('passes shared context and task-specific text to an interaction', () => {
    const prompt = buildChildPrompt(' shared context ', { action: 'create', agent: 'fixer', task: 'implement narrowly' });

    expect(prompt).toBe('shared context\n\nimplement narrowly');
  });

  it('labels tasks by explicit name, agent, or continuation target', () => {
    expect(describeTask({ action: 'create', agent: 'fixer', task: 'x', name: 'label' }, 0)).toBe('label');
    expect(describeTask({ action: 'create', agent: 'fixer', task: 'x' }, 0)).toBe('fixer task 1');
    expect(describeTask({ action: 'continue', childSessionId: 'child-1', task: 'x' }, 1)).toBe('continue child-1');
  });
});
