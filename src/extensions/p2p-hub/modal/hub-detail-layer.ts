import type { Theme } from '@earendil-works/pi-coding-agent';
import type { TUI } from '@earendil-works/pi-tui';
import { fitLine, type Hint, type ModalLayer, type NavigationAction } from '../../../libs/modal';
import { FormatUtil } from '../format.util';
import type { P2pHubState, P2pRosterEntry } from '../p2p-hub-state';
import type { P2pIdentity, P2pStatus } from '../protocol.types';
import type { HubRegistryEntry } from '../registry.util';

/**
 * Detail view for one hub. For the currently connected hub, renders the live
 * local roster; for any other hub, peeks it for a read-only snapshot without
 * joining. `Enter` connects or disconnects depending on current state.
 */
export class HubDetailLayer implements ModalLayer {
  private lines: string[] = ['Loading...'];
  private connectedToThis = false;
  private busy = false;
  private readonly unsubscribe: () => void;

  public constructor(
    private readonly theme: Theme,
    private readonly tui: TUI,
    private readonly entry: HubRegistryEntry,
    private readonly state: P2pHubState,
    private readonly onStateChange: () => void,
  ) {
    this.unsubscribe = state.subscribe(() => tui.requestRender());
    void this.load();
  }

  private async load(): Promise<void> {
    this.connectedToThis = this.state.getHubName() === this.entry.name && this.state.isConnected();
    if (!this.connectedToThis) {
      const snapshot = await this.state.peek(this.entry);
      if (!snapshot) {
        this.lines = [this.theme.fg('error', 'Hub is unreachable.')];
      } else {
        const roster: P2pRosterEntry[] = [];
        if (snapshot.host) roster.push({ identity: snapshot.host, status: snapshot.statuses[snapshot.host.name], role: 'host', isSelf: false });
        for (const client of snapshot.clients) {
          roster.push({ identity: client, status: snapshot.statuses[client.name], role: 'client', isSelf: false });
        }
        this.lines = this.rosterLines(roster);
      }
    }
    this.tui.requestRender();
  }

  private rosterLines(roster: P2pRosterEntry[]): string[] {
    const lines: string[] = [];
    const host = roster.find(r => r.role === 'host');
    const clients = roster.filter(r => r !== host);

    lines.push(this.theme.fg('accent', `Hub: ${this.entry.name}`), '');
    lines.push(this.theme.fg('toolTitle', 'Host:'));
    if (host) lines.push(...this.renderMember(host.identity, host.status));
    else lines.push('  (unknown)');
    lines.push('');
    lines.push(this.theme.fg('toolTitle', `Clients (${clients.length}):`));
    if (clients.length === 0) lines.push('  (none)');
    for (const client of clients) lines.push(...this.renderMember(client.identity, client.status));

    return lines;
  }

  private renderMember(identity: P2pIdentity, status: P2pStatus | undefined): string[] {
    const model = identity.model ? `  ${identity.model}` : '';
    const statusStr = status ? `  ${FormatUtil.formatStatus(status)}` : '';
    const context = identity.context ? `  ${FormatUtil.formatContextNumeric(identity.context)} ${FormatUtil.formatContextBar(identity.context)}` : '';
    const lines = [`  agent: ${identity.name}${model}${statusStr}${context}`];
    if (identity.description) lines.push(`  description: ${identity.description}`);
    if (identity.cwd) lines.push(`  cwd: ${identity.cwd}`);
    return lines;
  }

  public hints(): Hint[] {
    if (this.busy) return [['...', 'Working']];
    return [['Enter', this.isConnectedToThis() ? 'Disconnect' : 'Connect']];
  }

  public handleInput(_data: string): void {
    // No raw text input in this layer; actions are driven by navigation.
  }

  public handleNavigation(action: NavigationAction): void {
    if (action !== 'confirm' || this.busy) return;
    this.busy = true;
    void this.toggleConnection().finally(() => {
      this.busy = false;
      this.tui.requestRender();
    });
  }

  private async toggleConnection(): Promise<void> {
    if (this.isConnectedToThis()) {
      this.state.disconnect('manual');
    } else {
      await this.state.joinHub(this.entry);
    }
    this.onStateChange();
    await this.load();
  }

  public render(width: number, height: number | undefined): string[] {
    const lines = this.isConnectedToThis() ? this.rosterLines(this.state.getRoster()) : this.lines;
    const rendered = lines.map(line => fitLine(line, width));
    if (height === undefined) return rendered;
    const bounded = rendered.slice(0, height);
    while (bounded.length < height) bounded.push('');
    return bounded;
  }

  public dispose(): void {
    this.unsubscribe();
  }

  private isConnectedToThis(): boolean {
    return this.state.getHubName() === this.entry.name && this.state.isConnected();
  }
}
