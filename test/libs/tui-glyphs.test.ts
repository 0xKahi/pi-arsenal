import { describe, expect, it } from 'bun:test';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { buildSpawnRows, SpawnResultComponent } from '../../src/extensions/multiverse/tools/spawn/spawn-result.component.ts';
import { P2pAskBatchResultComponent } from '../../src/extensions/p2p-council/tools/p2p-ask.tool.ts';
import { SPINNER_FRAMES, SPINNER_INTERVAL_MS, spinnerFrame, STATUS_SYMBOLS, treeConnector, treeContinuation } from '../../src/libs/tui-glyphs.ts';

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text };

describe('shared TUI glyphs', () => {
  it('is the one source both tools render their symbols from', () => {
    const ask = new P2pAskBatchResultComponent(theme as unknown as Theme, () => {});
    ask.update({ kind: 'batch', entries: [{ to: 'alpha', state: 'success', from: 'alpha', reply: 'ok' }] }, [{ to: 'alpha', prompt: 'x' }], false);
    const spawn = new SpawnResultComponent(theme, () => {});
    spawn.update(
      buildSpawnRows({ args: { context: 'c', tasks: [{ action: 'create', agent: 'fixer', task: 'x' }] }, details: undefined }),
      false,
    );

    const askOutput = ask.render(80).join('\n');
    const spawnOutput = spawn.render(80).join('\n');
    spawn.dispose();

    expect(askOutput).toContain(treeConnector(true));
    expect(spawnOutput).toContain(treeConnector(true));
    expect(askOutput).toContain(STATUS_SYMBOLS.success);
    expect(askOutput).toContain(STATUS_SYMBOLS.replied);
    expect(spawnOutput).toContain(STATUS_SYMBOLS.replied);
    expect(spawnOutput).toContain(STATUS_SYMBOLS.pending);
    // Neither tool declares its own frames or cadence any more.
    expect(SPINNER_INTERVAL_MS).toBe(80);
    expect(SPINNER_FRAMES).toHaveLength(10);
  });

  it('uses plain Unicode only, with no Nerd Font private-use glyphs', () => {
    const glyphs = [
      ...SPINNER_FRAMES,
      ...Object.values(STATUS_SYMBOLS),
      ...[true, false].flatMap(last => [treeConnector(last), treeContinuation(last)]),
    ];

    for (const glyph of glyphs.join('')) {
      const code = glyph.codePointAt(0) ?? 0;
      expect(code).toBeLessThan(0xe000);
    }
  });

  it('wraps spinner frames safely for any tick', () => {
    expect(spinnerFrame(0)).toBe(SPINNER_FRAMES[0] as string);
    expect(spinnerFrame(SPINNER_FRAMES.length)).toBe(SPINNER_FRAMES[0] as string);
    expect(spinnerFrame(-1)).toBe(SPINNER_FRAMES.at(-1) as string);
  });
});
