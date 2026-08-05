/**
 * Width/height-keyed cache for one rendered frame. Views that re-render only
 * on input, theme, or viewport changes can skip layout work when the host
 * re-requests the same frame.
 */
export class RenderCache {
  private cachedWidth: number | undefined;
  private cachedHeight: number | undefined;
  private cachedLines: string[] | undefined;

  /** The cached frame when it matches the requested viewport, else undefined. */
  public read(width: number, height: number | undefined): string[] | undefined {
    if (this.cachedLines !== undefined && this.cachedWidth === width && this.cachedHeight === height) {
      return this.cachedLines;
    }
    return undefined;
  }

  /** Store one rendered frame for the requested viewport. */
  public write(width: number, height: number | undefined, lines: string[]): string[] {
    this.cachedWidth = width;
    this.cachedHeight = height;
    this.cachedLines = lines;
    return lines;
  }

  /** Drop the cached frame after data, theme, or input changes. */
  public clear(): void {
    this.cachedWidth = undefined;
    this.cachedHeight = undefined;
    this.cachedLines = undefined;
  }
}
