/** Forked from dimk90/pi-context-view at f6f007b867212bcf81a61519c8e40ce209cdd608 (MIT). */
/**
 * Selection and scroll-window state over fixed rows, plus scroll-only preview
 * state. Pure logic — no pi or TUI access.
 */

/** Options controlling list selection behavior. */
export interface ListNavigatorOptions {
  /** Wrap around list boundaries instead of clamping (picker convention). */
  wrap?: boolean;
}

/**
 * Selection and scroll-window state over fixed rows. A trailing summary can
 * participate in scrolling without being included in selection navigation.
 * Selection clamps at boundaries unless `wrap` is enabled.
 */
export class ListNavigator {
  private rowCount: number;
  private selectableRowCount: number;
  private visibleCount: number;
  private readonly wrap: boolean;
  private selectedIndex = 0;
  private scrollOffset = 0;

  public constructor(rowCount: number, visibleCount: number, selectableRowCount = rowCount, options: ListNavigatorOptions = {}) {
    this.rowCount = Math.max(0, rowCount);
    this.selectableRowCount = Math.min(this.rowCount, Math.max(0, selectableRowCount));
    this.visibleCount = Math.max(1, visibleCount);
    this.wrap = options.wrap === true;
  }

  public get selected(): number {
    return this.selectedIndex;
  }

  public get selectedOrdinal(): number {
    return this.selectedIndex;
  }

  public get selectableCount(): number {
    return this.selectableRowCount;
  }

  public get offset(): number {
    return this.scrollOffset;
  }

  public get windowSize(): number {
    return Math.min(this.visibleCount, this.rowCount);
  }

  /** One-based final row currently visible, suitable for a scroll counter. */
  public get visibleEnd(): number {
    return Math.min(this.rowCount, this.scrollOffset + this.windowSize);
  }

  public get hasOverflow(): boolean {
    return this.rowCount > this.visibleCount;
  }

  public setVisibleCount(count: number): void {
    this.visibleCount = Math.max(1, count);
    this.ensureVisible();
  }

  /** Replace the row extent, clamping selection and scroll into range. */
  public setRowCount(rowCount: number, selectableRowCount = rowCount): void {
    this.rowCount = Math.max(0, rowCount);
    this.selectableRowCount = Math.min(this.rowCount, Math.max(0, selectableRowCount));
    this.selectedIndex = Math.min(Math.max(0, this.selectableRowCount - 1), this.selectedIndex);
    this.ensureVisible();
  }

  public moveBy(delta: number): boolean {
    if (this.wrap && this.selectableRowCount > 0) {
      const count = this.selectableRowCount;
      const next = (((this.selectedIndex + delta) % count) + count) % count;
      return this.moveTo(next);
    }
    return this.moveTo(this.selectedIndex + delta);
  }

  public moveTo(index: number): boolean {
    if (this.selectableRowCount === 0) return false;
    const next = Math.min(this.selectableRowCount - 1, Math.max(0, index));
    if (next === this.selectedIndex) return false;
    this.selectedIndex = next;
    this.ensureVisible();
    return true;
  }

  public page(direction: -1 | 1): boolean {
    return this.moveBy(direction * Math.max(1, this.visibleCount - 1));
  }

  private ensureVisible(): void {
    const maxOffset = Math.max(0, this.rowCount - this.visibleCount);
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    } else if (this.selectedIndex >= this.scrollOffset + this.visibleCount) {
      this.scrollOffset = this.selectedIndex - this.visibleCount + 1;
    }

    const trailingRows = this.rowCount - this.selectedIndex - 1;
    if (this.selectedIndex === this.selectableRowCount - 1 && trailingRows < this.visibleCount) {
      this.scrollOffset = maxOffset;
    }
    this.scrollOffset = Math.min(maxOffset, Math.max(0, this.scrollOffset));
  }
}

/**
 * Scroll-only window over wrapped preview lines. Extent is re-declared each
 * render (wrapping depends on width); the offset is clamped to stay valid.
 */
export class PreviewScroller {
  private lineCount = 0;
  private visibleCount = 1;
  private offsetValue = 0;

  public get offset(): number {
    return this.offsetValue;
  }

  public get windowSize(): number {
    return Math.min(this.visibleCount, this.lineCount);
  }

  /** One-based final line currently visible, suitable for a progress counter. */
  public get visibleEnd(): number {
    return Math.min(this.lineCount, this.offsetValue + this.windowSize);
  }

  public get hasOverflow(): boolean {
    return this.lineCount > this.visibleCount;
  }

  public get maxOffset(): number {
    return Math.max(0, this.lineCount - this.visibleCount);
  }

  public setExtent(lineCount: number, visibleCount: number): void {
    this.lineCount = Math.max(0, lineCount);
    this.visibleCount = Math.max(1, visibleCount);
    this.offsetValue = Math.min(this.maxOffset, this.offsetValue);
  }

  public scrollBy(delta: number): boolean {
    return this.scrollTo(this.offsetValue + delta);
  }

  public scrollTo(offset: number): boolean {
    const next = Math.min(this.maxOffset, Math.max(0, offset));
    if (next === this.offsetValue) return false;
    this.offsetValue = next;
    return true;
  }

  public page(direction: -1 | 1): boolean {
    return this.scrollBy(direction * Math.max(1, this.visibleCount - 1));
  }

  public reset(): void {
    this.offsetValue = 0;
  }
}
