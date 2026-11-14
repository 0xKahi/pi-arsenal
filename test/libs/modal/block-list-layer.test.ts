import { expect, test } from 'bun:test';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { BlockListLayer, type ModalLayer, type ModalTabContext, SearchablePreview } from '../../../src/libs/modal';

const theme = { fg: (_tone: string, value: string) => value } as Theme;
const blocks = [
  { id: 'short', title: 'Short', body: ['one'] },
  { id: 'long', title: 'Long', body: Array.from({ length: 30 }, (_, i) => `line ${i}`), isError: true },
];

test('caps excerpts and marks only the selected header', () => {
  const layer = new BlockListLayer(theme, { title: 'Transcript', blocks, header: b => b.title, body: b => b.body, onOpen: () => {} });
  const lines = layer.render(60, 16);
  expect(lines).toHaveLength(16);
  expect(lines.join('\n')).toContain('→ Short');
  expect(lines.join('\n')).toContain('… +26 lines');
  expect(lines.join('\n')).not.toContain('line 29');
  layer.handleNavigation('step-forward');
  expect(layer.render(60, 16).join('\n')).toContain('→ Long');
});

test('Enter opens only truncated content through pushLayer, retaining selection on return', () => {
  const stack: ModalLayer[] = [];
  const context: ModalTabContext = {
    pushLayer: layer => {
      stack.push(layer);
    },
    popLayer: () => {
      stack.pop()?.dispose?.();
    },
  };
  const opened: string[] = [];
  const layer = new BlockListLayer(theme, {
    title: 'Transcript',
    blocks,
    header: b => b.title,
    body: b => b.body,
    onOpen: block => {
      opened.push(block.id);
      context.pushLayer(
        new SearchablePreview(theme, { title: block.title, body: () => block.body, copy: () => {}, copyText: () => block.body.join('\n') }),
      );
    },
  });
  layer.render(60, 16);
  layer.handleNavigation('confirm');
  expect(opened).toEqual([]);
  layer.handleNavigation('step-forward');
  layer.render(60, 16);
  layer.handleNavigation('confirm');
  expect(opened).toEqual(['long']);
  expect(stack[0]).toBeInstanceOf(SearchablePreview);
  context.popLayer();
  layer.invalidate();
  expect(layer.render(60, 16).join('\n')).toContain('→ Long');
  expect(layer.selected).toBe(1);
});

test('copy uses the supplied raw callback and displays an in-layer status', async () => {
  const copied: string[] = [];
  const layer = new BlockListLayer(theme, {
    title: 'Transcript',
    blocks,
    header: b => b.title,
    body: b => b.body,
    onOpen: () => {},
    copy: text => {
      copied.push(text);
    },
    copyText: b => b.body.join('\n'),
  });
  layer.render(60, 16);
  layer.handleInput('y');
  await Promise.resolve();
  expect(copied).toEqual(['one']);
  expect(layer.render(60, 16).join('\n')).toContain('Copied');
  layer.dispose();
});

test('adaptive excerpts retain at least two body lines and indent the overflow marker', () => {
  const layer = new BlockListLayer(theme, {
    title: 'Transcript',
    blocks: blocks.slice(1),
    header: b => b.title,
    body: b => b.body,
    onOpen: () => {},
  });
  const lines = layer.render(60, 9);
  expect(lines).toContain('  line 0');
  expect(lines).toContain('  line 1');
  expect(lines).toContain('    … +28 lines');
  expect(lines.join('\n')).toContain('Enter View Content');
  expect(layer.hints()).not.toContainEqual(['y', 'Copy']);
});

test('small heights stay bounded and empty lists do not open', () => {
  const layer = new BlockListLayer(theme, {
    title: 'Empty',
    blocks: [],
    header: () => '',
    body: () => [],
    onOpen: () => {
      throw new Error('empty');
    },
  });
  expect(layer.render(8, 2)).toHaveLength(2);
  layer.handleNavigation('confirm');
});
