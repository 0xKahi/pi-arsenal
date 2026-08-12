import { describe, expect, test } from 'bun:test';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { MemberNameLayer, type MemberNameSubmitResult } from '../../../../src/extensions/p2p-council/modal/member-name-layer';

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

function makeTui() {
  let renders = 0;
  return {
    terminal: { rows: 24 },
    requestRender: () => renders++,
    get renders() {
      return renders;
    },
  };
}

const ENTER = '\r';

function makeLayer(
  defaultName: string,
  onSubmit: (name: string) => Promise<MemberNameSubmitResult> = async () => ({ success: true }),
): { layer: MemberNameLayer; accepted: () => number } {
  let acceptedCount = 0;
  const layer = new MemberNameLayer(theme, makeTui() as never, defaultName, 'Your Member Name', onSubmit, () => {
    acceptedCount++;
  });
  return { layer, accepted: () => acceptedCount };
}

describe('MemberNameLayer', () => {
  test('prefills the input with the supplied default name', () => {
    const { layer } = makeLayer('fixer');
    expect(layer.render(40, undefined).join('\n')).toContain('fixer');
  });

  test('places the caret at the end of the prefill so typing appends', async () => {
    const submitted: string[] = [];
    const { layer } = makeLayer('fixer', async name => {
      submitted.push(name);
      return { success: true };
    });

    layer.handleInput('-');
    layer.handleInput('u');
    layer.handleInput('i');
    layer.handleInput(ENTER);
    await Bun.sleep(0);

    // The regression this guards: setValue() leaves the caret at 0, which would
    // produce '-uifixer' instead of 'fixer-ui'.
    expect(submitted).toEqual(['fixer-ui']);
  });

  test('submits the unmodified default when Enter is pressed immediately', async () => {
    const submitted: string[] = [];
    const { layer, accepted } = makeLayer('fixer', async name => {
      submitted.push(name);
      return { success: true };
    });

    layer.handleInput(ENTER);
    await Bun.sleep(0);

    expect(submitted).toEqual(['fixer']);
    expect(accepted()).toBe(1);
  });

  test('rejects an empty name without submitting', async () => {
    let calls = 0;
    const { layer, accepted } = makeLayer('ab', async () => {
      calls++;
      return { success: true };
    });

    layer.handleInput('\x7f');
    layer.handleInput('\x7f');
    layer.handleInput(ENTER);
    await Bun.sleep(0);

    expect(calls).toBe(0);
    expect(accepted()).toBe(0);
    expect(layer.render(40, undefined).join('\n')).toContain('Member name is required.');
  });

  test('rejects a name containing whitespace without submitting', async () => {
    let calls = 0;
    const { layer, accepted } = makeLayer('fix', async () => {
      calls++;
      return { success: true };
    });

    layer.handleInput(' ');
    layer.handleInput('e');
    layer.handleInput('r');
    layer.handleInput(ENTER);
    await Bun.sleep(0);

    expect(calls).toBe(0);
    expect(accepted()).toBe(0);
    expect(layer.render(40, undefined).join('\n')).toContain('Member name cannot contain spaces.');
  });

  test('accepts a colliding name without warning - the host deduplicates', async () => {
    const submitted: string[] = [];
    const { layer, accepted } = makeLayer('fixer', async name => {
      submitted.push(name);
      return { success: true };
    });

    layer.handleInput(ENTER);
    await Bun.sleep(0);

    expect(submitted).toEqual(['fixer']);
    expect(accepted()).toBe(1);
    expect(layer.render(40, undefined).join('\n')).not.toContain('taken');
  });

  test('surfaces a submit failure and does not report acceptance', async () => {
    const { layer, accepted } = makeLayer('fixer', async () => ({ success: false, error: 'connection failed' }));

    layer.handleInput(ENTER);
    await Bun.sleep(0);

    expect(accepted()).toBe(0);
    expect(layer.render(40, undefined).join('\n')).toContain('connection failed');
  });

  test('treats vim navigation letters as text input', async () => {
    const submitted: string[] = [];
    const { layer } = makeLayer('a', async name => {
      submitted.push(name);
      return { success: true };
    });

    for (const char of ['j', 'k', 'g', 'q']) layer.handleInput(char);
    layer.handleInput(ENTER);
    await Bun.sleep(0);

    expect(submitted).toEqual(['ajkgq']);
  });
});
