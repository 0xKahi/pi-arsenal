/** Selectable chronological block layer with height-bounded entry excerpts. */
import type { Theme } from '@earendil-works/pi-coding-agent';
import { matchesKey } from '@earendil-works/pi-tui';
import { BlockNavigator, layoutPreviewBlocks, type PreviewLayout } from './block-layout';
import { type CopyCallback, CopyStatus } from './copy-status';
import { BODY_INDENT, calculateViewport, fitLine, hintRow, spreadLine } from './text';
import type { Hint, ModalLayer, NavigationAction } from './types';

const MAX_EXCERPT_LINES = 20;
const MIN_EXCERPT_LINES = 2;

export interface BlockListLayerOptions<T> {
  /** Clipboard callback; copyText avoids copying rendered/wrapped excerpts. */
  readonly copy?: CopyCallback;
  readonly copyText?: (block: T) => string;
  readonly requestRender?: () => void;
  readonly emptyMessage?: string;
  readonly title: string | (() => string);
  readonly meta?: string | (() => string);
  readonly blocks: readonly T[];
  /** Caller owns styling, including any tone/isError treatment. */
  readonly header: (block: T) => string;
  readonly body: (block: T, width: number) => string[];
  readonly description?: (width: number, height: number | undefined) => string[];
  /** Called only for truncated blocks; may push a SearchablePreview via the tab context. */
  readonly onOpen: (block: T) => void;
}

interface RenderedBlock {
  readonly lines: readonly string[];
  readonly truncated: boolean;
}

export class BlockListLayer<T> implements ModalLayer {
  public readonly rendersHints = true;
  private readonly navigator = new BlockNavigator();
  private readonly status = new CopyStatus(() => this.options.requestRender?.());

  public get selected(): number {
    return this.navigator.selected;
  }
  public dispose(): void {
    this.status.dispose();
  }
  private blocks: readonly RenderedBlock[] = [];
  private layout: PreviewLayout = layoutPreviewBlocks([]);
  private cacheKey: string | undefined;

  public constructor(
    private readonly theme: Theme,
    private readonly options: BlockListLayerOptions<T>,
  ) {}

  private leadHints: Hint[] = [];
  private trailHints: Hint[] = [];

  public setShellHints(lead: Hint[], trail: Hint[]): void {
    this.leadHints = lead;
    this.trailHints = trail;
  }

  public hints(): Hint[] {
    const selected = this.blocks[this.navigator.selected];
    return [
      ...(selected?.truncated === true ? [['Enter', 'View Content'] as const] : []),
      ...(this.options.copy === undefined ? [] : [['y', 'Copy'] as const]),
    ];
  }

  /** Search stays unbound in the block stream; full-content previews own search. */
  public handleInput(data: string): void {
    if (matchesKey(data, 'y') && this.options.copy !== undefined) {
      const block = this.options.blocks[this.navigator.selected];
      if (block !== undefined) void this.status.copy(this.options.copy, this.options.copyText?.(block) ?? this.options.body(block, 80).join('\n'));
    }
  }

  public handleNavigation(action: NavigationAction): void {
    switch (action) {
      case 'step-back':
        this.navigator.stepBack();
        break;
      case 'step-forward':
        this.navigator.stepForward();
        break;
      case 'page-back':
        this.navigator.page(-1);
        break;
      case 'page-forward':
        this.navigator.page(1);
        break;
      case 'first':
        this.navigator.moveToFirst();
        break;
      case 'last':
        this.navigator.moveToLast();
        break;
      case 'confirm': {
        if (this.blocks[this.navigator.selected]?.truncated !== true) return;
        const entry = this.options.blocks[this.navigator.selected];
        if (entry !== undefined) this.options.onOpen(entry);
        break;
      }
    }
  }

  public render(width: number, height: number | undefined): string[] {
    const description = this.options.description?.(width, height) ?? [];
    // Reserve one row for the overflow counter whenever the stream needs it;
    // an unused row is preferable to clipping a pinned description.
    const fixedLineCount = 4 + (description.length > 0 ? description.length + 1 : 0);
    const available = Math.max(1, (height ?? 20) - fixedLineCount);
    const excerptCap = Math.max(MIN_EXCERPT_LINES, Math.min(MAX_EXCERPT_LINES, Math.floor((available - 3) / 2)));
    this.buildBlocks(width, excerptCap);

    const viewport = calculateViewport(this.layout.lines.length, height ?? this.layout.lines.length + fixedLineCount, fixedLineCount);
    this.navigator.setExtent(this.layout, viewport.visibleCount);
    const title = typeof this.options.title === 'function' ? this.options.title() : this.options.title;
    const metaOption = this.options.meta;
    const meta = typeof metaOption === 'function' ? metaOption() : (metaOption ?? '');
    const lines = [spreadLine(title, meta, width), ''];

    if (this.blocks.length === 0) {
      lines.push(fitLine(this.theme.fg('muted', `${BODY_INDENT}${this.options.emptyMessage ?? 'No content.'}`), width));
    } else {
      for (let index = this.navigator.offset; index < this.navigator.offset + viewport.visibleCount; index++) {
        const ref = this.layout.lines[index];
        if (ref === undefined) {
          lines.push('');
          continue;
        }
        const block = this.blocks[ref.blockIndex];
        const line = block?.lines[ref.lineIndex] ?? '';
        const cursor = ref.lineIndex === 0 && ref.blockIndex === this.navigator.selected ? this.theme.fg('accent', '→ ') : '  ';
        lines.push(fitLine(`${cursor}${line}`, width));
      }
    }
    if (viewport.showScroll) {
      lines.push(
        fitLine(
          this.theme.fg(
            'dim',
            `${BODY_INDENT}(${Math.min(this.layout.lines.length, this.navigator.offset + viewport.visibleCount)}/${this.layout.lines.length})`,
          ),
          width,
        ),
      );
    }
    lines.push(this.status.render(this.theme) || hintRow(this.theme, [...this.leadHints, ...this.hints(), ...this.trailHints]));
    if (description.length > 0) lines.push('', ...description);
    return height === undefined
      ? lines.map(line => fitLine(line, width))
      : Array.from({ length: Math.max(0, height) }, (_, index) => fitLine(lines[index] ?? '', width));
  }

  public invalidate(): void {
    this.cacheKey = undefined;
  }

  private buildBlocks(width: number, excerptCap: number): void {
    const bodyWidth = Math.max(10, width - 2);
    const key = `${bodyWidth}:${excerptCap}`;
    if (this.cacheKey === key) return;
    this.blocks = this.options.blocks.map(entry => {
      const body = this.options.body(entry, bodyWidth);
      const truncated = body.length > excerptCap;
      const visible = truncated ? body.slice(0, excerptCap) : body;
      const marker = truncated ? [`${BODY_INDENT}${this.theme.fg('dim', `… +${body.length - visible.length} lines`)}`] : [];
      return { lines: [this.options.header(entry), ...visible, ...marker], truncated };
    });
    this.layout = layoutPreviewBlocks(this.blocks.map(block => block.lines.length));
    this.cacheKey = key;
  }
}
