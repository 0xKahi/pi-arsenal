import { describe, expect, test } from 'bun:test';
import { BlockNavigator, layoutPreviewBlocks } from '../../../src/libs/modal';

describe('block layout', () => {
  test('stacks blocks with separator rows', () => {
    const layout = layoutPreviewBlocks([2, 1]);
    expect(layout.extents).toEqual([
      { start: 0, height: 2 },
      { start: 3, height: 1 },
    ]);
    expect(layout.lines[2]).toBeUndefined();
  });

  test('scrolls oversized selection before advancing, and back before leaving', () => {
    const nav = new BlockNavigator();
    nav.setExtent(layoutPreviewBlocks([8, 2]), 4);
    for (let i = 0; i < 4; i++) expect(nav.stepForward()).toBe(true);
    expect(nav.selected).toBe(0);
    expect(nav.offset).toBe(4);
    nav.stepForward();
    expect(nav.selected).toBe(1);
    nav.stepBack();
    expect(nav.selected).toBe(0);
    const offset = nav.offset;
    nav.stepBack();
    expect(nav.offset).toBe(offset - 1);
    expect(nav.selected).toBe(0);
  });

  test('first/last (gg/G) and half-page movement', () => {
    const nav = new BlockNavigator();
    nav.setExtent(layoutPreviewBlocks([20, 2]), 6);
    nav.page(1);
    expect(nav.offset).toBe(3);
    expect(nav.selected).toBe(0);
    nav.page(-1);
    expect(nav.offset).toBe(0);
    expect(nav.selected).toBe(0);
    nav.moveToLast();
    expect(nav.selected).toBe(1);
    expect(nav.offset).toBe(nav.maxOffset);
    nav.moveToFirst();
    expect(nav.selected).toBe(0);
    expect(nav.offset).toBe(0);
  });

  test('half-pages preserve selection direction and intersection', () => {
    const layout = layoutPreviewBlocks(Array.from({ length: 20 }, () => 2));
    const nav = new BlockNavigator();
    nav.setExtent(layout, 10);
    while (nav.selected < 3) nav.stepForward();
    expect(nav.offset).toBe(1);
    nav.page(1);
    expect(nav.offset).toBe(6);
    expect(nav.selected).toBe(3);
    nav.page(-1);
    expect(nav.offset).toBe(1);
    expect(nav.selected).toBe(3);
    nav.page(-1);
    expect(nav.selected).toBe(2);
    for (const direction of [1, -1] as const) {
      for (let i = 0; i < 20; i++) {
        const previous = nav.selected;
        nav.page(direction);
        expect(direction * (nav.selected - previous)).toBeGreaterThanOrEqual(0);
        const block = layout.extents[nav.selected];
        if (block === undefined) throw new Error('Selection has no block');
        expect(block.start).toBeLessThan(nav.offset + 10);
        expect(block.start + block.height).toBeGreaterThan(nav.offset);
      }
    }
  });

  test('empty geometry is safe', () => {
    const nav = new BlockNavigator();
    nav.setExtent(layoutPreviewBlocks([]), 0);
    expect(nav.stepForward()).toBe(false);
    expect(nav.stepBack()).toBe(false);
    expect(nav.page(1)).toBe(false);
    expect(nav.offset).toBe(0);
  });
});
