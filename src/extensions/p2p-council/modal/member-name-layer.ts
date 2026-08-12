import type { Theme } from '@earendil-works/pi-coding-agent';
import { Input, Key, matchesKey, type TUI } from '@earendil-works/pi-tui';
import { fitLine, type Hint, type ModalLayer, type NavigationAction } from '../../../libs/modal';

/** Outcome of the connect action a member name was collected for. */
export type MemberNameSubmitResult = { success: true } | { success: false; error: string };

/**
 * Text-focused layer that collects the name this session registers under, shared by the
 * join and create flows. It owns only the prefill, validation, and busy/error rendering;
 * the caller supplies what to do with an accepted name.
 *
 * The prefill is always the session's resolved default name, never a name previously
 * assigned by a council, so deduplication suffixes cannot accumulate across connections.
 * Collisions are deliberately not checked here - the host deduplicates after registration.
 */
export class MemberNameLayer implements ModalLayer {
  public readonly inputPolicy = 'text-focused' as const;
  private readonly input = new Input();
  private busy = false;
  private error: string | undefined;
  private active = true;

  public constructor(
    private readonly theme: Theme,
    private readonly tui: TUI,
    defaultName: string,
    private readonly heading: string,
    private readonly onSubmit: (name: string) => Promise<MemberNameSubmitResult>,
    private readonly onAccepted: () => void | Promise<void>,
  ) {
    // Insert rather than setValue: setValue leaves the caret at index 0, which would make
    // typing prepend to the prefill. Feeding the text through handleInput advances the
    // caret to the end using only the public API, without depending on a remappable
    // end-of-line keybinding.
    this.input.handleInput(defaultName);
  }

  public get focused(): boolean {
    return this.input.focused;
  }

  public set focused(value: boolean) {
    this.input.focused = value;
  }

  public hints(): Hint[] {
    return this.busy ? [['...', 'Connecting']] : [['Enter', 'Confirm']];
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
    const lines = [this.theme.fg('mdHeading', this.heading), '', ...this.input.render(width)];
    if (this.busy) lines.push('', this.theme.fg('muted', 'Connecting...'));
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
    const name = this.input.getValue();
    if (name === '') {
      this.error = 'Member name is required.';
      this.tui.requestRender();
      return;
    }
    if (/\s/.test(name)) {
      this.error = 'Member name cannot contain spaces.';
      this.tui.requestRender();
      return;
    }

    this.busy = true;
    this.error = undefined;
    this.tui.requestRender();
    const result = await this.onSubmit(name);
    if (!this.active) return;
    this.busy = false;
    if (!result.success) {
      this.error = result.error;
      this.tui.requestRender();
      return;
    }
    await this.onAccepted();
    this.tui.requestRender();
  }
}
