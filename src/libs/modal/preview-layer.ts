/**
 * Scrollable text preview layer. Renders a title line with right-aligned
 * metadata, a scrolling body window, an overflow counter, and optional fixed
 * description lines. Dismissal is owned by the dialog shell: it pops this
 * layer before the dialog itself can close.
 */
import type { Theme } from '@earendil-works/pi-coding-agent';
import { PreviewScroller } from './list-navigator';
import { BODY_INDENT, calculateViewport, fitLine, spreadLine } from './text';
import type { Hint, ModalLayer, NavigationAction } from './types';

export interface PreviewLayerOptions {
  /** Styled title rendered on the left of the header line. */
  title: string | (() => string);
  /** Muted metadata rendered right-aligned beside the title. */
  meta?: string | (() => string);
  /** Body lines for the given width; wrapping is the caller's concern. */
  body: (width: number) => string[];
  /** Optional fixed description lines pinned below the body. */
  description?: (width: number) => string[];
  /** Layer-specific hints appended after the navigation scheme's hints. */
  hints?: () => Hint[];
}

export class PreviewLayer implements ModalLayer {
  private readonly scroller = new PreviewScroller();

  public constructor(
    private readonly theme: Theme,
    private readonly options: PreviewLayerOptions,
  ) {}

  public hints(): Hint[] {
    return this.options.hints?.() ?? [];
  }

  public handleInput(_data: string): void {
    // Previews are scroll-only; dismissal is handled by the shell.
  }

  public handleNavigation(action: NavigationAction): void {
    switch (action) {
      case 'step-back':
        this.scroller.scrollBy(-1);
        break;
      case 'step-forward':
        this.scroller.scrollBy(1);
        break;
      case 'page-back':
        this.scroller.page(-1);
        break;
      case 'page-forward':
        this.scroller.page(1);
        break;
      case 'first':
        this.scroller.scrollTo(0);
        break;
      case 'last':
        this.scroller.scrollTo(this.scroller.maxOffset);
        break;
    }
  }

  public render(width: number, height: number | undefined): string[] {
    const body = this.options.body(width);
    const description = this.options.description?.(width) ?? [];
    // title + blank, plus blank + description when present
    const fixedLineCount = 2 + (description.length > 0 ? description.length + 1 : 0);
    const viewport = calculateViewport(body.length, height ?? body.length + fixedLineCount, fixedLineCount);
    this.scroller.setExtent(body.length, viewport.visibleCount);

    const title = typeof this.options.title === 'function' ? this.options.title() : this.options.title;
    const metaOption = this.options.meta;
    const meta = typeof metaOption === 'function' ? metaOption() : (metaOption ?? '');

    const lines: string[] = [spreadLine(title, meta, width), ''];
    const start = this.scroller.offset;
    for (let index = start; index < start + viewport.visibleCount; index++) {
      lines.push(body[index] ?? '');
    }
    if (viewport.showScroll) {
      lines.push(fitLine(this.theme.fg('dim', `${BODY_INDENT}(${this.scroller.visibleEnd}/${body.length})`), width));
    }
    if (description.length > 0) lines.push('', ...description);
    return lines;
  }
}
