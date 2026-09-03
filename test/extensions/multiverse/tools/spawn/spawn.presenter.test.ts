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

  it('renders expanded output, checkpoint, truncation size, and user-only telemetry', () => {
    const expanded = renderSpawnPresentation({
      expanded: true,
      tasks: [
        {
          status: 'success',
          label: 'implement',
          agent: 'fixer',
          interaction: childInteraction({ body: 'child output', truncation: { totalBytes: 99, totalLines: 9 } }),
        },
        { status: 'aborted', label: 'inspect', agent: 'explorer' },
      ],
    });

    expect(expanded).toContain('✓ 1. implement (fixer)');
    expect(expanded).toContain('child=child-1');
    expect(expanded).toContain('checkpoint=leaf');
    // No file-touch account exists anywhere, and truncation never points at a session file.
    expect(expanded).not.toContain('paths=');
    expect(expanded).toContain('truncated from 9 lines / 99 bytes');
    expect(expanded).not.toContain('.jsonl');
    expect(expanded).toContain('child output');
    expect(expanded).toContain('anthropic/model');
    expect(expanded).toContain('⚠ 2. inspect (explorer)');
    expect(expanded).not.toContain('MV-RESULT');
  });
});
