import { expect, test } from 'bun:test';
import type { KeybindingsManager, Theme } from '@earendil-works/pi-coding-agent';
import type { TUI } from '@earendil-works/pi-tui';
import {
  CURRENT_MATCH_SGR,
  expandJsonSpan,
  findMatches,
  highlightLine,
  ModalDialog,
  type ModalTab,
  matchColumns,
  prettifyJson,
  SearchablePreview,
  shiftJsonSpan,
  VimNavigationScheme,
} from '../../../src/libs/modal';

const theme = { fg: (_tone: string, value: string) => value, bold: (value: string) => value } as Theme;
function preview(copy: (text: string) => void = () => {}) {
  return new SearchablePreview(theme, { title: 'Preview', body: () => ['alpha', 'beta', 'ALPHA'], copy, copyText: () => 'raw text' });
}

test('/ captures query keys; Enter releases ownership and n/N wrap matches', () => {
  const layer = preview();
  layer.render(60, 10);
  expect(layer.inputPolicy).toBe('navigation-first');
  layer.handleInput('/');
  expect(layer.inputPolicy).toBe('text-focused');
  layer.handleInput('alpha');
  expect(layer.render(60, 10).join('\n')).toContain('1/2');
  layer.handleInput('\r');
  expect(layer.inputPolicy).toBe('navigation-first');
  layer.handleInput('n');
  expect(layer.render(60, 10).join('\n')).toContain('2/2');
  layer.handleInput('N');
  expect(layer.render(60, 10).join('\n')).toContain('1/2');
  layer.handleInput('N');
  expect(layer.render(60, 10).join('\n')).toContain('2/2');
});

test('y copies raw text, not the query or highlighted rendered text', async () => {
  const copied: string[] = [];
  const layer = preview(text => {
    copied.push(text);
  });
  layer.render(60, 10);
  layer.handleInput('y');
  await Promise.resolve();
  expect(copied).toEqual(['raw text']);
  expect(layer.render(60, 10).join('\n')).toContain('Copied');
  layer.dispose();
});

test('Esc clears active query first; subsequent Esc pops through the real shell', () => {
  const layer = preview();
  const tab: ModalTab = {
    label: 'Test',
    render: () => ['underlying tab'],
    handleInput: () => {},
    handleNavigation: () => {},
    hints: () => [],
    attach: context => context.pushLayer(layer),
  };
  const dialog = new ModalDialog(
    { terminal: { rows: 30 }, requestRender: () => {} } as unknown as TUI,
    theme,
    { matches: () => false } as unknown as KeybindingsManager,
    { tabs: [tab], navigation: new VimNavigationScheme(), cancelValue: undefined, onComplete: () => {} },
  );
  dialog.render(60);
  dialog.handleInput('/');
  dialog.handleInput('alpha');
  expect(dialog.render(60).join('\n')).toContain('1/2');
  dialog.handleInput('\u001b');
  expect(layer.inputPolicy).toBe('navigation-first');
  expect(dialog.render(60).join('\n')).not.toContain('Search:');
  expect(dialog.render(60).join('\n')).toContain('Preview');
  dialog.handleInput('\u001b');
  expect(dialog.render(60).join('\n')).toContain('underlying tab');
});

test('shell hints surround own hints except while editing or showing copy status', async () => {
  const layer = preview();
  layer.setShellHints(
    [['j/k', 'Scroll']],
    [
      ['Tab', 'Switch'],
      ['Esc', 'Back'],
    ],
  );
  const row = layer.render(240, 10).find(line => line.includes('y Copy')) ?? '';
  expect(row).toContain('j/k Scroll · / Search · n/N Next/Previous · y Copy · Tab Switch · Esc Back');
  expect(layer.hints()).not.toContainEqual(['Esc', 'Back']);
  layer.handleInput('/');
  const editing = layer.render(240, 10).join('\n');
  expect(editing).toContain('Enter Confirm · Esc Clear');
  expect(editing).not.toContain('Tab Switch');
  expect(editing).not.toContain('j/k Scroll');
  layer.handleEscape();
  layer.handleInput('y');
  await Promise.resolve();
  const copied = layer.render(240, 10).join('\n');
  expect(copied).toContain('Copied 8 characters');
  expect(copied).not.toContain('Esc Back');
  layer.dispose();
});

test('confirmed-query Esc is not consumed', () => {
  const layer = preview();
  layer.render(60, 10);
  layer.handleInput('/');
  layer.handleInput('alpha');
  layer.handleInput('\r');
  expect(layer.handleEscape()).toBe(false);
});

test('search/highlight/JSON helpers retain upstream pure behavior', () => {
  expect(findMatches('a.b A.B', 'a.b')).toEqual([
    { start: 0, end: 3 },
    { start: 4, end: 7 },
  ]);
  expect(findMatches('x', ' ')).toEqual([]);
  expect(matchColumns('界a', { start: 1, end: 2 })).toEqual({ start: 2, end: 3 });
  expect(highlightLine('abc', [{ start: 0, end: 1, current: true }])).toContain(CURRENT_MATCH_SGR);
  expect(highlightLine('界', [{ start: 1, end: 2 }])).toBe('界');
  expect(prettifyJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  expect(expandJsonSpan('x{"a":1}', { start: 1, end: 8 })).toBe('x{\n  "a": 1\n}');
  expect(expandJsonSpan('broken', { start: 0, end: 6 })).toBe('broken');
  expect(shiftJsonSpan({ start: 3, end: 7 }, 2)).toEqual({ start: 1, end: 5 });
});
