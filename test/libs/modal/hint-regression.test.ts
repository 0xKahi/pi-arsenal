import { expect, test } from 'bun:test';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import { BlockListLayer } from '../../../src/libs/modal';

const theme = { fg: (_tone: string, text: string) => text } as Theme;

test('copy hint requires a callback', () => {
  const options = {
    title: 'Long transcript title',
    blocks: ['body'],
    header: () => 'Header',
    body: (block: string) => [block],
    description: () => ['A description longer than twelve columns'],
    onOpen: () => {},
  };
  const layer = new BlockListLayer(theme, options);
  expect(layer.hints()).not.toContainEqual(['y', 'Copy']);
  expect(new BlockListLayer(theme, { ...options, copy: () => {} }).hints()).toContainEqual(['y', 'Copy']);
});

test('unbounded lines fit narrow widths including long descriptions', () => {
  const layer = new BlockListLayer(theme, {
    title: 'Long transcript title',
    blocks: ['body'],
    header: () => 'Header',
    body: block => [block],
    description: () => ['A description longer than twelve columns'],
    onOpen: () => {},
  });
  expect(layer.render(12, undefined).every(line => visibleWidth(line) <= 12)).toBe(true);
});
