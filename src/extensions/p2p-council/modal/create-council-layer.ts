import type { Theme } from '@earendil-works/pi-coding-agent';
import { Input, Key, matchesKey, type TUI } from '@earendil-works/pi-tui';
import { fitLine, type Hint, type ModalLayer, type NavigationAction } from '../../../libs/modal';
import type { P2pCouncilState } from '../p2p-council-state';

/** Text-focused layer that creates a council without leaving the custom modal. */
export class CreateCouncilLayer implements ModalLayer {
  public readonly inputPolicy = 'text-focused' as const;
  private readonly input = new Input();
  private busy = false;
  private error: string | undefined;
  private active = true;

  public constructor(
    private readonly theme: Theme,
    private readonly tui: TUI,
    private readonly state: P2pCouncilState,
    private readonly onCreated: () => void | Promise<void>,
    private readonly onConnectionChange?: (connected: boolean) => void,
  ) {}

  public get focused(): boolean {
    return this.input.focused;
  }

  public set focused(value: boolean) {
    this.input.focused = value;
  }

  public hints(): Hint[] {
    return this.busy ? [['...', 'Creating']] : [['Enter', 'Create']];
  }

  public handleInput(data: string): void {
    if (this.busy) return;
    if (matchesKey(data, Key.enter)) {
      void this.submit();
      return;
    }
    this.error = undefined;
    this.input.handleInput(data);
  }

  public handleNavigation(_action: NavigationAction): void {
    // Text-focused routing sends Enter and editing keys through handleInput.
  }

  public render(width: number, height: number | undefined): string[] {
    const lines = [this.theme.fg('mdHeading', 'Register Council Name'), '', ...this.input.render(width)];
    if (this.busy) lines.push('', this.theme.fg('muted', 'Creating council...'));
    else if (this.error) lines.push('', this.theme.fg('error', this.error));
    const rendered = lines.map(line => fitLine(line, width));
    if (height === undefined) return rendered;
    const bounded = rendered.slice(0, height);
    while (bounded.length < height) bounded.push('');
    return bounded;
  }

  public invalidate(): void {
    this.input.invalidate();
  }

  public dispose(): void {
    this.active = false;
    this.input.focused = false;
  }

  private async submit(): Promise<void> {
    const name = this.input.getValue().trim();
    if (!name) {
      this.error = 'Council name is required.';
      this.tui.requestRender();
      return;
    }
    if (name.includes('/') || name.includes('\\') || name.includes('\0')) {
      this.error = 'Council name cannot contain path separators.';
      this.tui.requestRender();
      return;
    }

    this.busy = true;
    this.error = undefined;
    this.tui.requestRender();
    const result = await this.state.createCouncil(name);
    if (result.success) this.onConnectionChange?.(true);
    if (!this.active) return;
    this.busy = false;
    if (!result.success) {
      this.error = result.error;
      this.tui.requestRender();
      return;
    }
    await this.onCreated();
    this.tui.requestRender();
  }
}
