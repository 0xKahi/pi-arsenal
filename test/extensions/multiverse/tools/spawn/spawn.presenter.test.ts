import { describe, expect, it } from 'bun:test';
import { renderSpawnPresentation } from '../../../../../src/extensions/multiverse/tools/spawn/spawn.presenter.ts';
import { childInteraction } from '../../interaction-fixture.ts';

describe('renderSpawnPresentation', () => {
  it('renders compact task state without child or envelope detail', () => {
    const compact = renderSpawnPresentation({
      tasks: [
        { status: 'running', label: 'implement', agent: 'fixer', currentTool: 'write' },
        { status: 'pending', label: 'inspect', agent: 'explorer' },
      ],
    });

    expect(compact).toContain('… 1. implement (fixer) tool=write');
    expect(compact).toContain('○ 2. inspect (explorer)');
    expect(compact).not.toContain('child=');
    expect(compact).not.toContain('MV-RESULT');
  });

  it('renders expanded output, checkpoint, paths, truncation link, and user-only telemetry', () => {
    const expanded = renderSpawnPresentation({
      expanded: true,
      tasks: [
        {
          status: 'success',
          label: 'implement',
          agent: 'fixer',
          interaction: childInteraction({
            observedPaths: ['src/a.ts'],
            body: 'child output',
            truncation: { sessionFile: '/sessions/child-1.jsonl', checkpoint: 'leaf', totalBytes: 99, totalLines: 9 },
          }),
        },
        { status: 'aborted', label: 'inspect', agent: 'explorer' },
      ],
    });

    expect(expanded).toContain('✓ 1. implement (fixer)');
    expect(expanded).toContain('child=child-1');
    expect(expanded).toContain('checkpoint=leaf');
    expect(expanded).toContain('paths=src/a.ts');
    expect(expanded).toContain('full output: /sessions/child-1.jsonl');
    expect(expanded).toContain('child output');
    expect(expanded).toContain('anthropic/model');
    expect(expanded).toContain('⚠ 2. inspect (explorer)');
    expect(expanded).not.toContain('MV-RESULT');
  });
});
