import type { Theme } from '@earendil-works/pi-coding-agent';
import { type TUI, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import { fitLine, type Hint, type ModalLayer, type ModalTabContext, type NavigationAction } from '../../../libs/modal';
import { FormatUtil } from '../format.util';
import type { P2pCouncilState, P2pRosterEntry } from '../p2p-council-state';
import type { P2pIdentity, P2pStatus } from '../protocol.types';
import type { CouncilRegistryEntry } from '../registry.util';
import { MemberNameLayer } from './member-name-layer';

/**
 * Detail view for one council. For the currently connected council, renders the live
 * local roster; for any other council, peeks it for a read-only snapshot without
 * joining. `Enter` connects or disconnects depending on current state.
 *
 * Connecting first pushes the member-name step and joins only once a valid name is
 * submitted; disconnecting takes effect immediately with no member-name step.
 */
export class CouncilDetailLayer implements ModalLayer {
  private lines: string[] = ['Loading...'];
  private connectedToThis = false;
  private busy = false;
  private readonly unsubscribe: () => void;

  public constructor(
    private readonly theme: Theme,
    private readonly tui: TUI,
    private readonly entry: CouncilRegistryEntry,
    private readonly state: P2pCouncilState,
    private readonly onStateChange: () => void,
    private readonly onConnectionChange?: (connected: boolean) => void,
    private readonly tabContext?: ModalTabContext,
  ) {
    this.unsubscribe = state.subscribe(() => tui.requestRender());
    void this.load();
  }

  private async load(): Promise<void> {
    this.connectedToThis = this.state.getCouncilName() === this.entry.name && this.state.isConnected();
    if (!this.connectedToThis) {
      const snapshot = await this.state.peek(this.entry);
      if (!snapshot) {
        this.lines = [this.theme.fg('error', 'Council is unreachable.')];
      } else {
        const roster: P2pRosterEntry[] = [];
        if (snapshot.host) {
          roster.push({ identity: snapshot.host, status: snapshot.statuses[snapshot.host.name], connectionType: 'host', isSelf: false });
        }
        for (const client of snapshot.clients) {
          roster.push({ identity: client, status: snapshot.statuses[client.name], connectionType: 'client', isSelf: false });
        }
        this.lines = this.rosterLines(roster);
      }
    }
    this.tui.requestRender();
  }

  private rosterLines(roster: P2pRosterEntry[]): string[] {
    const lines: string[] = [];
    const host = roster.find(r => r.connectionType === 'host');
    const clients = roster.filter(r => r !== host);

    lines.push(this.theme.fg('accent', `Council: ${this.entry.name}`), '');
    lines.push(this.theme.fg('toolTitle', 'Host:'));
    if (host) lines.push(...this.renderMember(host.identity, host.status));
    else lines.push('  (unknown)');
    lines.push('');
    lines.push(this.theme.fg('toolTitle', `Clients (${clients.length}):`));
    if (clients.length === 0) lines.push('(none)');
    for (const client of clients) lines.push(...this.renderMember(client.identity, client.status));

    return lines;
  }

  private renderMember(identity: P2pIdentity, status: P2pStatus | undefined): string[] {
    const model = identity.model ? `${identity.model}` : '';
    const statusStr = status ? `${FormatUtil.formatStatus(status)}` : '';
    const lines: string[] = [];
    lines.push(`${this.theme.fg('mdHeading', `[${identity.name}]`)} ${this.theme.fg('dim', statusStr)}`);
    lines.push(`model: ${this.theme.fg('syntaxString', model)}`);
    if (identity.description) lines.push(`description: ${this.theme.fg('syntaxString', identity.description)}`);
    if (identity.cwd) lines.push(`cwd: ${this.theme.fg('mdLinkUrl', identity.cwd)}`);
    return lines;
  }

  public hints(): Hint[] {
    if (this.busy) return [['...', 'Working']];
    return [['Enter', this.isConnectedToThis() ? this.theme.fg('error', 'Disconnect') : this.theme.fg('accent', 'Connect')]];
  }

  public handleInput(_data: string): void {
    // No raw text input in this layer; actions are driven by navigation.
  }

  public handleNavigation(action: NavigationAction): void {
    if (action !== 'confirm' || this.busy) return;

    if (!this.isConnectedToThis()) {
      this.pushMemberNameStep();
      return;
    }

    this.busy = true;
    void this.disconnectFromThis().finally(() => {
      this.busy = false;
      this.tui.requestRender();
    });
  }

  private pushMemberNameStep(): void {
    this.tabContext?.pushLayer(
      new MemberNameLayer(
        this.theme,
        this.tui,
        this.state.getDefaultName(),
        `Join "${this.entry.name}" as`,
        name => this.state.joinCouncil(this.entry, name),
        async () => {
          this.tabContext?.popLayer();
          this.onConnectionChange?.(true);
          this.onStateChange();
          await this.load();
        },
      ),
    );
  }

  private async disconnectFromThis(): Promise<void> {
    this.state.disconnect('manual');
    this.onConnectionChange?.(false);
    this.onStateChange();
    await this.load();
  }

  public render(width: number, height: number | undefined): string[] {
    const lines = this.isConnectedToThis() ? this.rosterLines(this.state.getRoster()) : this.lines;
    const lineWidth = Math.max(1, width);
    const rendered = lines.flatMap(line => wrapTextWithAnsi(line, lineWidth).map(wrapped => fitLine(wrapped, lineWidth)));
    if (height === undefined) return rendered;
    const bounded = rendered.slice(0, height);
    while (bounded.length < height) bounded.push('');
    return bounded;
  }

  public dispose(): void {
    this.unsubscribe();
  }

  private isConnectedToThis(): boolean {
    return this.state.getCouncilName() === this.entry.name && this.state.isConnected();
  }
}
