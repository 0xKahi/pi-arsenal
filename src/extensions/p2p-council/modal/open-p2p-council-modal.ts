import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import type { ModalComponentFactory, ModalLayout, ModalTab, ModalTabContext } from '../../../libs/modal';
import { ListTab, ModalDialog, presentModal, VimNavigationScheme } from '../../../libs/modal';
import type { P2pCouncilState } from '../p2p-council-state';
import { type CouncilRegistry, type CouncilRegistryEntry, listLiveCouncils } from '../registry.util';
import { CouncilDetailLayer } from './council-detail-layer';
import { CreateCouncilLayer } from './create-council-layer';

export type CouncilListItem = { kind: 'council'; entry: CouncilRegistryEntry } | { kind: 'create' };

export type P2pCouncilModalResult = { action: 'close' };

/**
 * Build the (pure, host-independent) dialog factory for the council list view.
 * Council details and council creation are pushed layers, so the configured modal
 * presentation remains mounted for the full interaction.
 */
export function buildCouncilModalFactory(
  state: P2pCouncilState,
  liveCouncils: readonly CouncilRegistryEntry[],
  onConnectionChange?: (connected: boolean) => void,
): ModalComponentFactory<P2pCouncilModalResult> {
  return (tui, theme, keybindings, done, frame) => {
    let tabContext: ModalTabContext | undefined;
    const closeModal = () => done({ action: 'close' });
    const items: CouncilListItem[] = [...liveCouncils.map(entry => ({ kind: 'council' as const, entry })), { kind: 'create' as const }];

    const listTab = new ListTab<CouncilListItem>(theme, {
      label: 'Councils',
      items,
      renderRow: (item, selected) => renderRow(item, selected, state, theme),
      emptyMessage: 'No councils registered yet - select "create new"',
      onConfirm: item => {
        if (item.kind === 'create') {
          tabContext?.pushLayer(new CreateCouncilLayer(theme, tui, state, closeModal, onConnectionChange));
          return;
        }
        tabContext?.pushLayer(
          new CouncilDetailLayer(
            theme,
            tui,
            item.entry,
            state,
            () => tui.requestRender(),
            connected => {
              onConnectionChange?.(connected);
              closeModal();
            },
          ),
        );
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

    return new ModalDialog<P2pCouncilModalResult>(tui, theme, keybindings, {
      tabs: [tab],
      navigation: new VimNavigationScheme(),
      frame,
      height: 'auto',
      title: () => {
        const councilName = state.getCouncilName();
        return councilName ? `Current Council: ${councilName} (connected)` : 'Current Council: (none)';
      },
      cancelValue: { action: 'close' },
      onComplete: done,
    });
  };
}

function renderRow(item: CouncilListItem, selected: boolean, state: P2pCouncilState, theme: Theme): string {
  const prefix = selected ? theme.fg('accent', '> ') : '  ';
  const label = item.kind === 'create' ? 'create new' : item.entry.name;
  const styledLabel = selected ? theme.fg('accent', label) : label;
  if (item.kind === 'create') return `${prefix}${styledLabel}`;
  const isCurrent = state.getCouncilName() === item.entry.name && state.isConnected();
  const marker = isCurrent ? theme.fg('success', ' (connected)') : '';
  return `${prefix}${styledLabel}${marker}`;
}

/** Host-facing entry point: lists live councils, then presents the modal. */
export async function openP2pCouncilModal(
  ctx: ExtensionContext,
  state: P2pCouncilState,
  registry: CouncilRegistry,
  layout: ModalLayout,
  onConnectionChange?: (connected: boolean) => void,
): Promise<P2pCouncilModalResult> {
  const liveCouncils = await listLiveCouncils(registry);
  return presentModal(ctx.ui, layout, buildCouncilModalFactory(state, liveCouncils, onConnectionChange));
}
