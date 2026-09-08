import { describe, expect, it } from 'bun:test';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { SpawnOrchestratorDependencies } from '../../../../../src/extensions/multiverse/orchestrator/spawn-orchestrator.ts';
import { isSpawnToolDetails } from '../../../../../src/extensions/multiverse/results/child-interaction.ts';
import { createSpawnTool, type SpawnToolHost } from '../../../../../src/extensions/multiverse/tools/spawn/spawn.tool.ts';
import { SpawnProgress } from '../../../../../src/extensions/multiverse/tools/spawn/spawn-progress.ts';
import { childInteraction } from '../../interaction-fixture.ts';

const ctx = { cwd: '/tmp/project' } as unknown as ExtensionContext;
const dependencies = {} as SpawnOrchestratorDependencies;
const validInput = { context: 'shared context', tasks: [{ action: 'create', agent: 'fixer', task: 'implement' }] };

const host = (overrides: Partial<SpawnToolHost> = {}): SpawnToolHost => ({
  getExecutionContext: () => dependencies,
  availableAgents: () => ['fixer'],
  run: async () => ({ interactions: [childInteraction({ body: 'child output' })], progress: new SpawnProgress([]), aborted: false }),
  ...overrides,
});

describe('createSpawnTool', () => {
  it('publishes a model-facing definition with prompt guidance', () => {
    const tool = createSpawnTool(host());

    expect(tool.name).toBe('spawn');
    expect(tool.label).toBe('spawn');
    expect(tool.promptSnippet).toContain('spawn(');
    expect(tool.promptGuidelines?.length).toBeGreaterThan(0);
    expect(tool.description).toContain('subagent');
  });

  it('returns the enveloped body plus structured interaction details', async () => {
    const tool = createSpawnTool(host());

    const result = await tool.execute('call-1', validInput as never, undefined, undefined, ctx);

    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    expect(text).toContain('child output');
    expect(text).toMatch(/^Spawn results \(1\) · boundary [0-9a-f]{6}\n/);
    expect(text).toContain('--TASK_1_RESPONSE-');
    expect(text).not.toContain('Spawn dispatched');
    expect(isSpawnToolDetails(result.details)).toBe(true);
    expect(result.details.interactions).toHaveLength(1);
  });

  it('is unavailable outside an eligible Megamind parent session', async () => {
    const tool = createSpawnTool(host({ getExecutionContext: () => undefined }));

    await expect(tool.execute('call-1', validInput as never, undefined, undefined, ctx)).rejects.toThrow('eligible Megamind parent');
  });

  it('surfaces the reason when the roster became unusable', async () => {
    const tool = createSpawnTool(host({ getExecutionContext: () => ({ error: 'spawn is unavailable: Multiverse is disabled.' }) }));

    await expect(tool.execute('call-1', validInput as never, undefined, undefined, ctx)).rejects.toThrow('Multiverse is disabled');
  });

  it('rejects an invalid batch before dispatch and writes no manifest', async () => {
    const appended: string[] = [];
    let dispatched = false;
    const tool = createSpawnTool(
      host({
        appendManifest: type => appended.push(type),
        run: async () => {
          dispatched = true;
          return { interactions: [], progress: new SpawnProgress([]), aborted: false };
        },
      }),
    );

    await expect(tool.execute('call-1', { context: '', tasks: [] } as never, undefined, undefined, ctx)).rejects.toThrow('rejected before dispatch');
    expect(dispatched).toBe(false);
    expect(appended).toEqual([]);
  });

  it('appends exactly one manifest after dispatch', async () => {
    const appended: string[] = [];
    const tool = createSpawnTool(host({ appendManifest: type => appended.push(type) }));

    await tool.execute('call-1', validInput as never, undefined, undefined, ctx);

    expect(appended).toEqual(['arsenal-spawn-manifest']);
  });

  it('keeps live progress in details and only a fixed receipt in model-facing content', async () => {
    const updates: string[] = [];
    const detailUpdates: unknown[] = [];
    const tool = createSpawnTool(
      host({
        run: async (_input, _dependencies, options) => {
          const progress = new SpawnProgress([{ label: 'implement', agent: 'fixer', action: 'create' }]);
          progress.start(0);
          options?.onProgress?.(progress);
          return { interactions: [childInteraction({ body: 'secret child output' })], progress, aborted: false };
        },
      }),
    );

    const result = await tool.execute(
      'call-1',
      validInput as never,
      undefined,
      update => {
        const content = update.content?.[0];
        if (content?.type === 'text') updates.push(content.text);
        detailUpdates.push(update.details);
      },
      ctx,
    );

    // Partial content is fixed text: no task label, agent, tool name, or child prose.
    expect(updates).toEqual(['Spawn dispatched; waiting for every task to settle.']);
    expect(updates.join('\n')).not.toContain('implement');
    expect(updates.join('\n')).not.toContain('fixer');
    expect(updates.join('\n')).not.toContain('secret child output');

    const details = detailUpdates.at(-1) as { progress?: Array<{ index: number; label: string; agent: string; phase: string }> };
    expect(detailUpdates.at(-1)).toMatchObject({ boundaryNonce: result.details.boundaryNonce });
    expect(result.details.boundaryNonce).toBeString();
    const content = result.content[0];
    expect(content?.type === 'text' ? content.text : '').toContain(`boundary ${result.details.boundaryNonce}`);
    expect(content?.type === 'text' ? content.text : '').toContain(`--TASK_1_RESPONSE-${result.details.boundaryNonce}--`);
    expect(details.progress).toHaveLength(1);
    expect(details.progress?.[0]).toMatchObject({ index: 0, label: 'implement', agent: 'fixer', action: 'create', phase: 'waiting' });
  });
});
