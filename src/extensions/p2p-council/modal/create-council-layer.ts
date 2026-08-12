import type { Theme } from '@earendil-works/pi-coding-agent';
import { Input, Key, matchesKey, type TUI } from '@earendil-works/pi-tui';
import { fitLine, type Hint, type ModalLayer, type ModalTabContext, type NavigationAction } from '../../../libs/modal';
import type { P2pCouncilState } from '../p2p-council-state';
import { MemberNameLayer } from './member-name-layer';

/**
 * Text-focused layer that creates a council without leaving the custom modal.
 *
 * Submitting a valid council name pushes the member-name step rather than creating the
 * council, so nothing is created until the creating session's own name is confirmed. This
 * layer stays on the stack with its entered value, which is what lets Esc from the
 * member-name step return to a populated council-name field.
 */
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
    private readonly tabContext?: ModalTabContext,
  ) {}

  public get focused(): boolean {
    return this.input.focused;
  }

  public set focused(value: boolean) {
    this.input.focused = value;
  }

  public hints(): Hint[] {
    return this.busy ? [['...', 'Checking']] : [['Enter', 'Next']];
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
    if (this.busy) lines.push('', this.theme.fg('muted', 'Checking council name...'));
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
    // Reject a name that cannot be created before asking for a member name, so the user is
    // never prompted for a council that will fail anyway.
    const conflict = await this.state.findLiveCouncilConflict(name);
    if (!this.active) return;
    this.busy = false;
    if (conflict) {
      this.error = conflict;
      this.tui.requestRender();
      return;
    }

    this.tabContext?.pushLayer(
      new MemberNameLayer(
        this.theme,
        this.tui,
        this.state.getDefaultName(),
        `Create "${name}" as`,
        memberName => this.state.createCouncil(name, memberName),
        async () => {
          this.tabContext?.popLayer();
          this.onConnectionChange?.(true);
          await this.onCreated();
        },
      ),
    );
    this.tui.requestRender();
  }
}
