import type { Theme } from '@earendil-works/pi-coding-agent';

/** Host-provided clipboard access; no platform dependency or modal notice API. */
export type CopyCallback = (text: string) => void | Promise<void>;

/** Shared transient status, rendered inside the owning layer. */
export class CopyStatus {
  public message = '';
  private tone: 'success' | 'warning' | 'error' = 'success';

  public render(theme: Theme): string {
    return this.message ? theme.fg(this.tone, `  ${this.message}`) : '';
  }

  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private generation = 0;

  public constructor(private readonly requestRender: () => void) {}

  public async copy(callback: CopyCallback, text: string): Promise<void> {
    const generation = ++this.generation;
    const normalized = text.replace(/\r\n/g, '\n').replace(/^\n+/, '').trimEnd();
    let message: string;
    let tone: 'success' | 'warning' | 'error';
    if (normalized.length === 0) {
      message = 'Nothing to copy';
      tone = 'warning';
    } else {
      try {
        await callback(normalized);
        message = `Copied ${normalized.length} characters`;
        tone = 'success';
      } catch (error) {
        message = `Copy failed: ${error instanceof Error ? error.message : String(error)}`;
        tone = 'error';
      }
    }
    if (this.disposed || generation !== this.generation) return;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.message = message;
    this.tone = tone;
    this.requestRender();
    this.timer = setTimeout(() => {
      this.message = '';
      this.timer = undefined;
      this.requestRender();
    }, 2000);
  }

  public dispose(): void {
    this.disposed = true;
    if (this.timer !== undefined) clearTimeout(this.timer);
  }
}
