/**
 * Modal dialog shell. Owns everything about being a modal — framing, tab
 * strip, tab cycling, per-tab input layers, optional shared filter input,
 * notices, focus plumbing, and the help footer — so tab strategies only
 * implement content. See `types.ts` for the tab/layer/scheme contracts.
 *
 * Input routing order:
 *   1. A text-focused top layer receives every raw key except shell-reserved
 *      Esc, which pops the layer.
 *   2. Tab/Shift+Tab cycles tabs (wrapping, scheme reset).
 *   3. The navigation scheme maps a key to a semantic action; `dismiss` pops
 *      the active tab's top layer, or completes the dialog with the cancel
 *      value when no layer is open. Other actions go to the top layer, or the
 *      active tab when no layer is open.
 *   4. Unhandled raw keys go to the top layer, else the filter input, else
 *      the active tab.
 */
import type { KeybindingsManager, Theme } from '@earendil-works/pi-coding-agent';
import { type Component, type Focusable, Input, Key, matchesKey, type TUI } from '@earendil-works/pi-tui';
import { PiKeybindingsScheme } from './navigation/pi-scheme';
import { renderTabStrip } from './tab-strip';
import { fitToTerminalHeight, hintRow, normalizeTerminalRows, padLine, singleLine } from './text';
import type { Hint, ModalLayer, ModalTab, NavigationScheme } from './types';

/** Framing style: inline rules, or a rounded border for host-centered overlays. */
export type ModalFrame = 'inline' | 'bordered';

/** Height policy: natural content height, or bounded to half the terminal. */
export type ModalHeight = 'auto' | 'half';

export interface ModalDialogFilterOptions {
  /** Query seeded into the filter input and applied to tabs on open. */
  initialQuery?: string;
}

export interface ModalDialogOptions<TResult> {
  tabs: ModalTab[];
  initialTabIndex?: number;
  /** Navigation scheme; defaults to the host keybindings scheme. */
  navigation?: NavigationScheme;
  frame?: ModalFrame;
  height?: ModalHeight;
  /** Optional title line rendered above the tab strip. */
  title?: string | (() => string);
  /** Warning-styled notice lines rendered below the tab strip. */
  notices?: readonly string[] | (() => readonly string[]);
  /** Cap on rendered notice lines; overflow is summarized. Defaults to unlimited. */
  maxNoticeLines?: number;
  /** Optional shared text filter between the tab strip and content. */
  filter?: ModalDialogFilterOptions;
  /** Value passed to `onComplete` when the dialog is dismissed. */
  cancelValue: TResult;
  onComplete: (result: TResult) => void;
}

export class ModalDialog<TResult> implements Component, Focusable {
  private readonly scheme: NavigationScheme;
  private readonly frame: ModalFrame;
  private readonly height: ModalHeight;
  private readonly filterInput: Input | undefined;
  private readonly layerStacks = new Map<ModalTab, ModalLayer[]>();
  private activeTabIndex: number;
  private _focused = false;

  public constructor(
    private readonly tui: TUI,
    private readonly theme: Theme,
    private readonly keybindings: KeybindingsManager,
    private readonly options: ModalDialogOptions<TResult>,
  ) {
    if (options.tabs.length === 0) throw new Error('ModalDialog requires at least one tab');
    this.scheme = options.navigation ?? new PiKeybindingsScheme(keybindings);
    this.frame = options.frame ?? 'inline';
    this.height = options.height ?? 'auto';
    this.activeTabIndex = Math.min(Math.max(0, options.initialTabIndex ?? 0), options.tabs.length - 1);

    for (const tab of options.tabs) {
      tab.attach?.({
        pushLayer: layer => this.pushLayer(tab, layer),
        popLayer: () => this.popLayer(tab),
      });
    }

    if (options.filter !== undefined) {
      this.filterInput = new Input();
      this.filterInput.setValue(options.filter.initialQuery ?? '');
      this.filterInput.focused = this._focused;
      this.applyQuery(this.filterInput.getValue());
    }
  }

  public get focused(): boolean {
    return this._focused;
  }

  public set focused(value: boolean) {
    this._focused = value;
    if (this.filterInput) this.filterInput.focused = value;
    this.syncLayerFocus();
  }

  public get activeTab(): ModalTab {
    const tab = this.options.tabs[this.activeTabIndex];
    if (tab === undefined) throw new Error('ModalDialog requires at least one tab');
    return tab;
  }

  public get activeIndex(): number {
    return this.activeTabIndex;
  }

  public invalidate(): void {
    this.filterInput?.invalidate();
    for (const tab of this.options.tabs) tab.invalidate?.();
    for (const stack of this.layerStacks.values()) {
      for (const layer of stack) layer.invalidate?.();
    }
  }

  /** Complete the dialog with an explicit result (for example a selection). */
  public complete(result: TResult): void {
    this.options.onComplete(result);
  }

  public handleInput(data: string): void {
    const layer = this.topLayer();
    if (layer?.inputPolicy === 'text-focused') {
      if (matchesKey(data, Key.escape)) this.dismiss();
      else layer.handleInput(data);
      this.tui.requestRender();
      return;
    }

    if (this.options.tabs.length > 1) {
      if (matchesKey(data, Key.shift('tab'))) {
        this.switchTab(-1);
        return;
      }
      if (this.keybindings.matches(data, 'tui.input.tab') || matchesKey(data, Key.tab)) {
        this.switchTab(1);
        return;
      }
    }

    const navigation = this.scheme.consume(data);
    if (navigation.action === 'dismiss') {
      this.dismiss();
    } else if (navigation.action !== undefined) {
      this.content().handleNavigation(navigation.action);
    } else if (!navigation.handled) {
      const layer = this.topLayer();
      if (layer !== undefined) {
        layer.handleInput(data);
      } else if (this.filterInput !== undefined) {
        this.filterInput.handleInput(data);
        this.applyQuery(this.filterInput.getValue());
      } else {
        this.activeTab.handleInput(data);
      }
    }
    this.tui.requestRender();
  }

  public render(width: number): string[] {
    const safeWidth = Math.max(3, width);
    if (this.frame === 'bordered') {
      const inner = safeWidth - 2;
      const lines = this.buildContentLines(inner, this.contentHeight());
      const borderColor = (str: string) => this.theme.fg('border', str);
      const horizontal = '─'.repeat(inner);
      const side = borderColor('│');
      return [borderColor(`╭${horizontal}╮`), ...lines.map(line => `${side}${padLine(line, inner)}${side}`), borderColor(`╰${horizontal}╯`)];
    }

    const rule = this.theme.fg('border', '─'.repeat(safeWidth));
    const lines = [rule, ...this.buildContentLines(safeWidth, this.contentHeight()), rule];
    const budget = this.heightBudget();
    return budget === undefined ? lines : fitToTerminalHeight(lines, budget, rule);
  }

  // === Input routing internals ===

  private switchTab(direction: -1 | 1): void {
    const previousLayer = this.topLayer();
    const count = this.options.tabs.length;
    this.activeTabIndex = (((this.activeTabIndex + direction) % count) + count) % count;
    if (previousLayer?.focused !== undefined) previousLayer.focused = false;
    this.syncLayerFocus();
    this.scheme.reset();
    this.tui.requestRender();
  }

  private dismiss(): void {
    if (this.popLayer(this.activeTab)) return;
    this.options.onComplete(this.options.cancelValue);
  }

  private popLayer(tab: ModalTab): boolean {
    const stack = this.layerStacks.get(tab);
    if (stack === undefined || stack.length === 0) return false;
    const popped = stack.pop();
    if (popped?.focused !== undefined) popped.focused = false;
    popped?.dispose?.();
    this.syncLayerFocus();
    this.scheme.reset();
    return true;
  }

  private pushLayer(tab: ModalTab, layer: ModalLayer): void {
    const stack = this.layerStacks.get(tab) ?? [];
    const previous = stack.at(-1);
    if (previous?.focused !== undefined) previous.focused = false;
    stack.push(layer);
    this.layerStacks.set(tab, stack);
    this.syncLayerFocus();
    this.scheme.reset();
  }

  private syncLayerFocus(): void {
    const layer = this.topLayer();
    if (layer?.focused !== undefined) layer.focused = this._focused;
  }

  private topLayer(): ModalLayer | undefined {
    const stack = this.layerStacks.get(this.activeTab);
    return stack === undefined || stack.length === 0 ? undefined : stack[stack.length - 1];
  }

  /** The input target for navigation actions: top layer, else active tab. */
  private content(): ModalLayer | ModalTab {
    return this.topLayer() ?? this.activeTab;
  }

  private applyQuery(query: string): void {
    for (const tab of this.options.tabs) tab.applyFilter?.(query);
  }

  // === Rendering internals ===

  /** Total framed-line budget for bounded dialogs; undefined when natural. */
  private heightBudget(): number | undefined {
    if (this.height !== 'half') return undefined;
    return Math.max(3, Math.floor(normalizeTerminalRows(this.tui.terminal.rows) / 2));
  }

  /**
   * Exact content-region height handed to the active tab or layer, computed
   * from the budget minus chrome (frame, strip, notices, filter, footer).
   */
  private contentHeight(): number | undefined {
    const budget = this.heightBudget();
    if (budget === undefined) return undefined;
    const titleLines = this.titleText() === undefined ? 0 : 1;
    const noticeLines = this.renderedNoticeCount();
    const captionLines = this.filterInput === undefined ? 0 : (this.activeTab.filterCaption?.().length ?? 0);
    // frame rules (2) + strip (1) + blanks around content (2) + footer (1) + filter input row (1 when present)
    const chrome = 2 + 1 + 2 + 1 + titleLines + noticeLines + captionLines + (this.filterInput === undefined ? 0 : 1);
    return Math.max(1, budget - chrome);
  }

  private buildContentLines(width: number, contentHeight: number | undefined): string[] {
    const lines: string[] = [];
    const title = this.titleText();
    if (title !== undefined) lines.push(singleLine(title, width));

    const labels = this.options.tabs.map(tab => tab.label);
    lines.push(renderTabStrip(this.theme, labels, this.activeTabIndex, width));
    lines.push(...this.noticeLines(width));

    lines.push('');
    if (this.filterInput !== undefined) {
      for (const caption of this.activeTab.filterCaption?.() ?? []) {
        lines.push(singleLine(caption, width));
      }
      lines.push(...this.filterInput.render(width), '');
    }

    const content = this.content().render(width, contentHeight);
    if (contentHeight !== undefined) {
      while (content.length < contentHeight) content.push('');
      content.length = Math.min(content.length, contentHeight);
    }
    lines.push(...content, '');

    lines.push(singleLine(hintRow(this.theme, this.footerHints()), width));
    return lines;
  }

  private titleText(): string | undefined {
    const title = this.options.title;
    if (title === undefined) return undefined;
    return typeof title === 'function' ? title() : title;
  }

  private noticeLines(width: number): string[] {
    const all = this.allNotices();
    const shown = all.slice(0, this.options.maxNoticeLines ?? all.length);
    const lines = shown.map(notice => singleLine(this.theme.fg('warning', `⚠ ${notice}`), width));
    if (all.length > shown.length) {
      lines.push(singleLine(this.theme.fg('warning', `⚠ ${all.length - shown.length} more warning(s)`), width));
    }
    return lines;
  }

  /** Notice count as rendered, including the overflow summary line. */
  private renderedNoticeCount(): number {
    const all = this.allNotices();
    const cap = this.options.maxNoticeLines ?? all.length;
    return Math.min(all.length, cap) + (all.length > cap ? 1 : 0);
  }

  private allNotices(): readonly string[] {
    const notices = this.options.notices;
    if (notices === undefined) return [];
    return typeof notices === 'function' ? notices() : notices;
  }

  private footerHints(): Hint[] {
    const layer = this.topLayer();
    const target = layer ?? this.activeTab;
    const hints: Hint[] = [...this.scheme.hints(layer === undefined ? 'Navigate' : 'Scroll'), ...target.hints()];
    if (this.options.tabs.length > 1) hints.push(['Tab', 'Switch']);
    hints.push(['Esc', layer === undefined ? 'Close' : 'Back']);
    return hints;
  }
}
