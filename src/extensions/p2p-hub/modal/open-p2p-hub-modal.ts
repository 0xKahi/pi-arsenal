import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import type { ModalComponentFactory, ModalLayout, ModalTab, ModalTabContext } from '../../../libs/modal';
import { ListTab, ModalDialog, presentModal, VimNavigationScheme } from '../../../libs/modal';
import type { P2pHubState } from '../p2p-hub-state';
import { type HubRegistry, type HubRegistryEntry, listLiveHubs } from '../registry.util';
import { CreateHubLayer } from './create-hub-layer';
import { HubDetailLayer } from './hub-detail-layer';

export type HubListItem = { kind: 'hub'; entry: HubRegistryEntry } | { kind: 'create' };

export type P2pHubModalResult = { action: 'close' };

/**
 * Build the (pure, host-independent) dialog factory for the hub list view.
 * Hub details and hub creation are pushed layers, so the configured modal
 * presentation remains mounted for the full interaction.
 */
export function buildHubModalFactory(
  state: P2pHubState,
  liveHubs: readonly HubRegistryEntry[],
  refreshHubs: () => Promise<readonly HubRegistryEntry[]> = async () => liveHubs,
): ModalComponentFactory<P2pHubModalResult> {
  return (tui, theme, keybindings, done, frame) => {
    let tabContext: ModalTabContext | undefined;
    const items: HubListItem[] = [...liveHubs.map(entry => ({ kind: 'hub' as const, entry })), { kind: 'create' as const }];

    const listTab = new ListTab<HubListItem>(theme, {
      label: 'Hubs',
      items,
      renderRow: (item, selected) => renderRow(item, selected, state, theme),
      emptyMessage: 'No hubs registered yet - select "create new"',
      onConfirm: item => {
        if (item.kind === 'create') {
          tabContext?.pushLayer(
            new CreateHubLayer(theme, tui, state, async () => {
              const refreshed = await refreshHubs();
              items.splice(0, items.length, ...refreshed.map(entry => ({ kind: 'hub' as const, entry })), { kind: 'create' });
              listTab.applyFilter('');
              tabContext?.popLayer();
            }),
          );
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

function renderRow(item: HubListItem, selected: boolean, state: P2pHubState, theme: Theme): string {
  const prefix = selected ? theme.fg('accent', '> ') : '  ';
  const label = item.kind === 'create' ? 'create new' : item.entry.name;
  const styledLabel = selected ? theme.fg('accent', label) : label;
  if (item.kind === 'create') return `${prefix}${styledLabel}`;
  const isCurrent = state.getHubName() === item.entry.name && state.isConnected();
  const marker = isCurrent ? theme.fg('success', ' (connected)') : '';
  return `${prefix}${styledLabel}${marker}`;
}

/** Host-facing entry point: lists live hubs, then presents the modal. */
export async function openP2pHubModal(
  ctx: ExtensionContext,
  state: P2pHubState,
  registry: HubRegistry,
  layout: ModalLayout,
): Promise<P2pHubModalResult> {
  const liveHubs = await listLiveHubs(registry);
  return presentModal(
    ctx.ui,
    layout,
    buildHubModalFactory(state, liveHubs, () => listLiveHubs(registry)),
  );
}
