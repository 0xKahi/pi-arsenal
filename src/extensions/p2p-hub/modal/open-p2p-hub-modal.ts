import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import type { ModalComponentFactory, ModalTab, ModalTabContext } from '../../../libs/modal';
import { ListTab, ModalDialog, presentModal, VimNavigationScheme } from '../../../libs/modal';
import type { P2pHubState } from '../p2p-hub-state';
import { type HubRegistry, type HubRegistryEntry, listLiveHubs } from '../registry.util';
import { HubDetailLayer } from './hub-detail-layer';

export type HubListItem = { kind: 'hub'; entry: HubRegistryEntry } | { kind: 'create' };

export type P2pHubModalResult = { action: 'close' } | { action: 'create' };

/**
 * Build the (pure, host-independent) dialog factory for the hub list view.
 * Selecting a hub pushes a detail layer (peek snapshot for unjoined hubs,
 * live state for the current one) with connect/disconnect on Enter.
 * Selecting "create new" closes the dialog with `{action: 'create'}` -
 * the caller opens a native text input outside this VimNavigationScheme
 * dialog (see design.md D7 for why: the vim scheme intercepts letters
 * before a pushed layer could ever see them as text).
 */
export function buildHubModalFactory(state: P2pHubState, liveHubs: readonly HubRegistryEntry[]): ModalComponentFactory<P2pHubModalResult> {
  return (tui, theme, keybindings, done, frame) => {
    let tabContext: ModalTabContext | undefined;
    const items: HubListItem[] = [...liveHubs.map(entry => ({ kind: 'hub' as const, entry })), { kind: 'create' as const }];

    const listTab = new ListTab<HubListItem>(theme, {
      label: 'Hubs',
      items,
      renderRow: item => renderRow(item, state, theme),
      emptyMessage: 'No hubs registered yet - select "create new"',
      onConfirm: item => {
        if (item.kind === 'create') {
          done({ action: 'create' });
          return;
        }
        tabContext?.pushLayer(new HubDetailLayer(theme, tui, item.entry, state, () => tui.requestRender()));
      },
      hints: () => [['Enter', 'Open']],
    });

    const tab: ModalTab = {
      get label() {
        return listTab.label;
      },
      render: (width, height) => listTab.render(width, height),
      handleInput: data => listTab.handleInput(data),
      handleNavigation: action => listTab.handleNavigation(action),
      hints: () => listTab.hints(),
      attach: context => {
        tabContext = context;
      },
    };

    return new ModalDialog<P2pHubModalResult>(tui, theme, keybindings, {
      tabs: [tab],
      navigation: new VimNavigationScheme(),
      frame,
      height: 'half',
      title: () => {
        const hubName = state.getHubName();
        return hubName ? `Current Hub: ${hubName} (connected)` : 'Current Hub: (none)';
      },
      cancelValue: { action: 'close' },
      onComplete: done,
    });
  };
}

function renderRow(item: HubListItem, state: P2pHubState, theme: Theme): string {
  if (item.kind === 'create') return theme.fg('accent', '> create new');
  const isCurrent = state.getHubName() === item.entry.name && state.isConnected();
  const marker = isCurrent ? theme.fg('success', ' (connected)') : '';
  return `> ${item.entry.name}${marker}`;
}

/** Host-facing entry point: lists live hubs, then presents the modal. */
export async function openP2pHubModal(ctx: ExtensionContext, state: P2pHubState, registry: HubRegistry): Promise<P2pHubModalResult> {
  const liveHubs = await listLiveHubs(registry);
  return presentModal(ctx.ui, 'overlay', buildHubModalFactory(state, liveHubs));
}
