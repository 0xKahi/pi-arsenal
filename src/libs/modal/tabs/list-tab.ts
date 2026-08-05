/**
 * Generic selectable-list tab: the common "browse/filter/confirm a list"
 * modal content. Built on `ListNavigator`; callers supply item rendering and
 * the confirm action. Optional fuzzy filtering wires into the dialog's shared
 * filter input.
 */
import type { Theme } from '@earendil-works/pi-coding-agent';
import { fuzzyFilter } from '@earendil-works/pi-tui';
import { ListNavigator } from '../list-navigator';
import { BODY_INDENT, fitLine } from '../text';
import type { Hint, ModalTab, NavigationAction } from '../types';

/** Counts handed to dynamic labels so tab-strip text can track filtering. */
export interface ListTabCounts {
  items: number;
  filtered: number;
}

/** State handed to the footer hook after the list body has rendered. */
export interface ListTabFooterState<T> {
  filtered: readonly T[];
  selected: T | undefined;
  selectedIndex: number;
  width: number;
}

export interface ListTabOptions<T> {
  /** Static label, or a function of live item counts (re-read every render). */
  label: string | ((counts: ListTabCounts) => string);
  items: readonly T[];
  renderRow: (item: T, selected: boolean, width: number) => string;
  onConfirm: (item: T) => void;
  /** Per-item search text; enables `applyFilter` fuzzy filtering. */
  filterText?: (item: T) => string;
  /** Caption lines rendered above the dialog's shared filter input. */
  filterCaption?: () => string[];
  /** Lines below the list, for example a selection description or warnings. */
  footer?: (state: ListTabFooterState<T>) => string[];
  /** Shown when `items` is empty. */
  emptyMessage?: string | (() => string);
  /** Shown when items exist but the filter hides all of them. */
  noMatchMessage?: string | (() => string);
  /** Wrap selection at list boundaries (picker convention); default clamps. */
  wrap?: boolean;
  /** Fixed list window size; defaults to the render-provided height. */
  visibleCount?: number;
  /** Initially selected index, for example the current entry. */
  initialIndex?: number;
  /** Tab-specific hints; defaults to `[Enter, Select]`. */
  hints?: () => Hint[];
}

export class ListTab<T> implements ModalTab {
  private readonly navigator: ListNavigator;
  private filtered: T[];

  public constructor(
    private readonly theme: Theme,
    private readonly options: ListTabOptions<T>,
  ) {
    this.filtered = [...options.items];
    this.navigator = new ListNavigator(this.filtered.length, 1, this.filtered.length, { wrap: options.wrap });
    if (options.initialIndex !== undefined) this.navigator.moveTo(options.initialIndex);
  }

  public get label(): string {
    const label = this.options.label;
    return typeof label === 'function' ? label({ items: this.options.items.length, filtered: this.filtered.length }) : label;
  }

  public applyFilter(query: string): void {
    const filterText = this.options.filterText;
    const trimmed = query.trim();
    this.filtered = filterText !== undefined && trimmed !== '' ? fuzzyFilter([...this.options.items], trimmed, filterText) : [...this.options.items];
    this.navigator.setRowCount(this.filtered.length);
  }

  public filterCaption(): string[] {
    return this.options.filterCaption?.() ?? [];
  }

  public hints(): Hint[] {
    return this.options.hints?.() ?? [['Enter', 'Select']];
  }

  public handleInput(_data: string): void {
    // List content is driven by the dialog's filter input; nothing to do.
  }

  public handleNavigation(action: NavigationAction): void {
    switch (action) {
      case 'step-back':
        this.navigator.moveBy(-1);
        break;
      case 'step-forward':
        this.navigator.moveBy(1);
        break;
      case 'page-back':
        this.navigator.page(-1);
        break;
      case 'page-forward':
        this.navigator.page(1);
        break;
      case 'first':
        this.navigator.moveTo(0);
        break;
      case 'last':
        this.navigator.moveTo(this.filtered.length - 1);
        break;
      case 'confirm': {
        const item = this.filtered[this.navigator.selected];
        if (item !== undefined) this.options.onConfirm(item);
        break;
      }
    }
  }

  public render(width: number, height: number | undefined): string[] {
    if (this.options.items.length === 0) {
      return [this.message(this.options.emptyMessage ?? 'No items', width), ...this.renderFooter(width)];
    }
    if (this.filtered.length === 0) {
      return [this.message(this.options.noMatchMessage ?? 'No matching items', width), ...this.renderFooter(width)];
    }

    const visibleCount = Math.max(1, this.options.visibleCount ?? height ?? this.filtered.length);
    this.navigator.setVisibleCount(visibleCount);

    const lines: string[] = [];
    const start = this.navigator.offset;
    for (let index = start; index < start + this.navigator.windowSize; index++) {
      const item = this.filtered[index];
      if (item === undefined) break;
      lines.push(fitLine(this.options.renderRow(item, index === this.navigator.selected, width), width));
    }
    if (this.navigator.hasOverflow) {
      lines.push(fitLine(this.theme.fg('dim', `${BODY_INDENT}(${this.navigator.selected + 1}/${this.filtered.length})`), width));
    }

    lines.push(...this.renderFooter(width));
    return lines;
  }

  private renderFooter(width: number): string[] {
    return (
      this.options.footer?.({
        filtered: this.filtered,
        selected: this.filtered[this.navigator.selected],
        selectedIndex: this.navigator.selected,
        width,
      }) ?? []
    );
  }

  private message(message: string | (() => string), width: number): string {
    const text = typeof message === 'function' ? message() : message;
    return fitLine(this.theme.fg('muted', `${BODY_INDENT}${text}`), width);
  }
}
