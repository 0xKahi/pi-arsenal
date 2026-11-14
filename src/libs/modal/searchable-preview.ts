import type { Theme } from '@earendil-works/pi-coding-agent';
import { Input, Key, matchesKey, stripTerminalSequences } from '@earendil-works/pi-tui';
import { type CopyCallback, CopyStatus } from './copy-status';
import { highlightLine, matchColumns } from './highlight';
import { PreviewScroller } from './list-navigator';
import { findMatches, type MatchRange, normalizeSearchText } from './search';
import { BODY_INDENT, fitLine, hintRow, spreadLine } from './text';
import type { Hint, ModalLayer, NavigationAction } from './types';

export interface SearchablePreviewOptions {
  title: string | (() => string);
  meta?: string | (() => string);
  body: (width: number) => string[];
  description?: (width: number, height: number | undefined) => string[];
  hints?: () => Hint[];
  copy: CopyCallback;
  requestRender?: () => void;
  /** Full raw content, not the rendered or searched lines. */
  copyText: () => string;
}

interface LineMatch extends MatchRange {
  readonly line: number;
}

/** Scroll-only preview with captured query editing and search on rendered lines. */
export class SearchablePreview implements ModalLayer {
  public readonly rendersHints = true;
  private readonly scroller = new PreviewScroller();
  private readonly status = new CopyStatus(() => this.options.requestRender?.());
  private hasFocus = true;

  public get inputPolicy(): 'text-focused' | 'navigation-first' {
    return this.editing ? 'text-focused' : 'navigation-first';
  }

  public get focused(): boolean {
    return this.hasFocus;
  }
  public set focused(value: boolean) {
    this.hasFocus = value;
    this.input.focused = value && this.editing;
  }

  public handleEscape(): boolean {
    if (!this.editing) return false;
    this.handleInput('\u001b');
    return true;
  }

  public dispose(): void {
    this.status.dispose();
  }
  private readonly input = new Input({ prompt: '' });
  private editing = false;
  private query = '';
  private body: string[] = [];
  private matches: LineMatch[] = [];
  private current = -1;
  private width: number | undefined;

  public constructor(
    private readonly theme: Theme,
    private readonly options: SearchablePreviewOptions,
  ) {}

  private leadHints: Hint[] = [];
  private trailHints: Hint[] = [];

  public setShellHints(lead: Hint[], trail: Hint[]): void {
    this.leadHints = lead;
    this.trailHints = trail;
  }

  public hints(): Hint[] {
    return this.editing
      ? [
          ['Enter', 'Confirm'],
          ['Esc', 'Clear'],
        ]
      : [...(this.options.hints?.() ?? []), ['/', 'Search'], ['n/N', 'Next/Previous'], ['y', 'Copy']];
  }

  public handleInput(data: string): void {
    if (this.editing) {
      if (matchesKey(data, Key.escape)) {
        this.editing = false;
        this.input.focused = false;
        this.query = '';
        this.input.setValue('');
        this.rebuildMatches(false);
      } else if (matchesKey(data, Key.enter)) {
        this.editing = false;
        this.input.focused = false;
      } else {
        this.input.handleInput(data);
        this.query = this.input.getValue();
        this.rebuildMatches(false);
      }
      return;
    }
    if (data === '/') {
      this.editing = true;
      this.input.focused = this.hasFocus;
      this.input.setValue(this.query);
    } else if ((data === 'n' || data === 'N') && this.matches.length > 0) {
      this.current = (this.current + (data === 'n' ? 1 : -1) + this.matches.length) % this.matches.length;
      this.revealCurrent();
    } else if (data === 'y') {
      void this.status.copy(this.options.copy, this.options.copyText());
    }
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
    const rows = Math.max(0, height ?? 24);
    this.body = this.options.body(width);
    const description = this.options.description?.(width, height) ?? [];
    // Always reserve search and scroll rows, even when inactive, so typing or
    // reaching the end never changes the viewport height or scroll position.
    const footer = description.length > 0 ? ['', ...description] : [];
    const visible = Math.max(0, rows - 5 - footer.length);
    this.scroller.setExtent(this.body.length, visible);
    if (width !== this.width) {
      const preserve = this.width !== undefined;
      this.width = width;
      this.rebuildMatches(preserve);
    } else {
      this.rebuildMatches(true, false);
    }
    const title = typeof this.options.title === 'function' ? this.options.title() : this.options.title;
    const meta = typeof this.options.meta === 'function' ? this.options.meta() : (this.options.meta ?? '');
    const lines = [spreadLine(title, meta, width), ''];
    for (let index = this.scroller.offset; index < this.scroller.offset + visible; index++) {
      const lineMatches = this.matches.map((match, matchIndex) => ({ match, matchIndex })).filter(({ match }) => match.line === index);
      lines.push(
        highlightLine(
          this.body[index] ?? '',
          lineMatches.map(({ match, matchIndex }) => ({
            ...matchColumns(stripTerminalSequences(this.body[index] ?? ''), match),
            current: matchIndex === this.current,
          })),
        ),
      );
    }
    lines.push(this.scroller.hasOverflow ? this.theme.fg('dim', `${BODY_INDENT}(${this.scroller.visibleEnd}/${this.body.length})`) : '');
    const active = this.editing || normalizeSearchText(this.query) !== '';
    const count = this.matches.length === 0 ? 'no matches' : `${this.current + 1}/${this.matches.length}`;
    const prefix = `Search: `;
    const suffix = ` · ${count}`;
    lines.push(
      active
        ? `${prefix}${this.editing ? (this.input.render(Math.max(1, width - prefix.length - suffix.length))[0] ?? '') : this.query}${suffix}`
        : '',
    );
    lines.push(
      this.status.render(this.theme) || hintRow(this.theme, this.editing ? this.hints() : [...this.leadHints, ...this.hints(), ...this.trailHints]),
      ...footer,
    );
    return Array.from({ length: rows }, (_, index) => fitLine(lines[index] ?? '', width));
  }

  private rebuildMatches(preserve: boolean, reveal = true): void {
    const previous = this.current;
    this.matches = this.body.flatMap((line, index) =>
      findMatches(stripTerminalSequences(line), this.query).map(match => ({ ...match, line: index })),
    );
    this.current =
      this.matches.length === 0
        ? -1
        : preserve
          ? Math.min(Math.max(0, previous), this.matches.length - 1)
          : this.matches.findIndex(match => match.line >= this.scroller.offset);
    if (this.current === -1 && this.matches.length > 0) this.current = 0;
    if (reveal) this.revealCurrent();
  }

  private revealCurrent(): void {
    const match = this.matches[this.current];
    if (match !== undefined) this.scroller.scrollTo(match.line);
  }
}
