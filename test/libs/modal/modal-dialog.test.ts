import { describe, expect, test } from 'bun:test';
import type { KeybindingsManager, Theme } from '@earendil-works/pi-coding-agent';
import type { TUI } from '@earendil-works/pi-tui';
import {
  ModalDialog,
  type ModalLayer,
  type ModalTab,
  type ModalTabContext,
  type NavigationAction,
  VimNavigationScheme,
} from '../../../src/libs/modal';

const theme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

const keybindings = { matches: () => false } as unknown as KeybindingsManager;
const tui = { terminal: { rows: 24 }, requestRender: () => undefined } as unknown as TUI;

function makeTab(actions: NavigationAction[], inputs: string[], onAttach?: (context: ModalTabContext) => void): ModalTab {
  return {
    label: 'Test',
    render: () => ['tab'],
    handleInput: data => inputs.push(data),
    handleNavigation: action => actions.push(action),
    hints: () => [],
    attach: onAttach,
  };
}

class RecordingLayer implements ModalLayer {
  public readonly inputPolicy = 'text-focused' as const;
  public focused = false;
  public readonly inputs: string[] = [];
  public readonly actions: NavigationAction[] = [];

  public render(): string[] {
    return ['layer'];
  }

  public handleInput(data: string): void {
    this.inputs.push(data);
  }

  public handleNavigation(action: NavigationAction): void {
    this.actions.push(action);
  }

  public hints() {
    return [];
  }
}

describe('ModalDialog height policies', () => {
  test('fit keeps short inline content natural while half pads to its budget', () => {
    const makeDialog = (height: 'auto' | 'half' | 'fit') =>
      new ModalDialog(tui, theme, keybindings, {
        tabs: [makeTab([], [])],
        height,
        cancelValue: undefined,
        onComplete: () => undefined,
      });

    const autoLines = makeDialog('auto').render(30);
    const fitLines = makeDialog('fit').render(30);
    const halfLines = makeDialog('half').render(30);

    expect(fitLines.length).toBe(autoLines.length);
    expect(halfLines.length).toBe(12);
    expect(fitLines.length).toBeLessThan(halfLines.length);
  });

  test('fit passes the bounded content height and clips long content', () => {
    let receivedHeight: number | undefined;
    const dialog = new ModalDialog(tui, theme, keybindings, {
      tabs: [
        {
          ...makeTab([], []),
          render: (_width, height) => {
            receivedHeight = height;
            return Array.from({ length: 20 }, (_, index) => `line-${index}`);
          },
        },
      ],
      height: 'fit',
      cancelValue: undefined,
      onComplete: () => undefined,
    });

    const lines = dialog.render(30);
    expect(receivedHeight).toBe(6);
    expect(lines.length).toBe(12);
    expect(lines.at(-1)).toBe('─'.repeat(30));

    (tui.terminal as { rows: number }).rows = 10;
    expect(dialog.render(30).length).toBe(5);
    (tui.terminal as { rows: number }).rows = 24;
  });

  test('fit preserves natural height and bounds bordered dialogs', () => {
    const short = new ModalDialog(tui, theme, keybindings, {
      tabs: [makeTab([], [])],
      frame: 'bordered',
      height: 'fit',
      cancelValue: undefined,
      onComplete: () => undefined,
    });
    expect(short.render(30).length).toBe(7);

    const long = new ModalDialog(tui, theme, keybindings, {
      tabs: [{ ...makeTab([], []), render: () => Array.from({ length: 20 }, () => 'long') }],
      frame: 'bordered',
      height: 'fit',
      cancelValue: undefined,
      onComplete: () => undefined,
    });
    const lines = long.render(30);
    expect(lines.length).toBe(12);
    expect(lines[0]).toContain('╭');
    expect(lines.at(-1)).toContain('╰');
  });
});

describe('ModalDialog layer input routing', () => {
  test('normal layers retain Vim navigation-first behavior', () => {
    const actions: NavigationAction[] = [];
    const inputs: string[] = [];
    const completed: string[] = [];
    const dialog = new ModalDialog(tui, theme, keybindings, {
      tabs: [makeTab(actions, inputs)],
      navigation: new VimNavigationScheme(),
      cancelValue: 'closed',
      onComplete: result => completed.push(result),
    });

    dialog.handleInput('j');
    dialog.handleInput('k');
    dialog.handleInput('g');
    dialog.handleInput('g');
    dialog.handleInput('q');

    expect(actions).toEqual(['step-forward', 'step-back', 'first']);
    expect(inputs).toEqual([]);
    expect(completed).toEqual(['closed']);
  });

  test('text-focused layers receive Vim letters and Enter raw while Esc pops', () => {
    let context: ModalTabContext | undefined;
    const completed: string[] = [];
    const layer = new RecordingLayer();
    const dialog = new ModalDialog(tui, theme, keybindings, {
      tabs: [makeTab([], [], value => (context = value))],
      navigation: new VimNavigationScheme(),
      cancelValue: 'closed',
      onComplete: result => completed.push(result),
    });

    context?.pushLayer(layer);
    for (const key of ['j', 'k', 'g', 'q', '\r']) dialog.handleInput(key);
    expect(layer.inputs).toEqual(['j', 'k', 'g', 'q', '\r']);
    expect(layer.actions).toEqual([]);
    expect(completed).toEqual([]);

    dialog.handleInput('\x1b');
    expect(dialog.render(30).join('\n')).toContain('tab');
    expect(completed).toEqual([]);
  });

  test('focus follows active focusable layers across pushes and pops', () => {
    let context: ModalTabContext | undefined;
    const first = new RecordingLayer();
    const second = new RecordingLayer();
    const dialog = new ModalDialog(tui, theme, keybindings, {
      tabs: [makeTab([], [], value => (context = value))],
      navigation: new VimNavigationScheme(),
      cancelValue: undefined,
      onComplete: () => undefined,
    });

    dialog.focused = true;
    context?.pushLayer(first);
    expect(first.focused).toBe(true);

    context?.pushLayer(second);
    expect(first.focused).toBe(false);
    expect(second.focused).toBe(true);

    dialog.handleInput('\x1b');
    expect(second.focused).toBe(false);
    expect(first.focused).toBe(true);

    dialog.focused = false;
    expect(first.focused).toBe(false);
  });
});
