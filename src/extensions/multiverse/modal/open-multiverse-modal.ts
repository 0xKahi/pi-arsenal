import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import type { ModalComponentFactory, ModalTab } from '../../../libs/modal';
import { fitLine, ListTab, ModalDialog, presentModal, VimNavigationScheme } from '../../../libs/modal';
import type { SessionRole } from '../agents/session-role-state.ts';
import type { ParentAgent } from '../orchestrator/parent-agent.ts';

const PARENT_AGENTS: readonly ParentAgent[] = ['default', 'megamind'];

export type MultiverseModalResult = { action: 'close' } | { action: 'select'; agent: ParentAgent };

export interface MultiverseModalState {
  activeAgent: ParentAgent;
  role: SessionRole;
  megamindAvailable: boolean;
}

export function buildMultiverseModalFactory(state: MultiverseModalState): ModalComponentFactory<MultiverseModalResult> {
  return (tui, theme, keybindings, done, frame) => {
    const disabled = (agent: ParentAgent) => state.role.kind !== 'parent' || (agent === 'megamind' && !state.megamindAvailable);
    const switchTab = new ListTab<ParentAgent>(theme, {
      label: 'Switch Agent',
      items: PARENT_AGENTS,
      initialIndex: Math.max(0, PARENT_AGENTS.indexOf(state.activeAgent)),
      renderRow: (agent, selected) => renderAgentRow(agent, selected, state.activeAgent, disabled(agent), theme),
      onConfirm: agent => {
        if (!disabled(agent)) done({ action: 'select', agent });
      },
      hints: () => [['Enter', 'Switch']],
    });

    const childSessionsTab: ModalTab = {
      label: 'Child Sessions',
      render: width => [fitLine(theme.fg('muted', '  Coming soon.'), width)],
      handleInput: () => {},
      handleNavigation: () => {},
      hints: () => [],
    };

    return new ModalDialog(tui, theme, keybindings, {
      tabs: [switchTab, childSessionsTab],
      navigation: new VimNavigationScheme(),
      frame,
      height: 'auto',
      title: 'Multiverse',
      cancelValue: { action: 'close' },
      onComplete: done,
    });
  };
}

function renderAgentRow(agent: ParentAgent, selected: boolean, active: ParentAgent, disabled: boolean, theme: Theme): string {
  const prefix = selected ? theme.fg('accent', '> ') : '  ';
  const label = agent === 'default' ? 'Default' : 'Megamind';
  const styledLabel = disabled ? theme.fg('dim', label) : selected ? theme.fg('accent', label) : label;
  const activeMarker = agent === active ? theme.fg('success', ' (active)') : '';
  const disabledMarker = disabled ? theme.fg('dim', ' (disabled)') : '';
  return `${prefix}${styledLabel}${activeMarker}${disabledMarker}`;
}

export function openMultiverseModal(ctx: ExtensionContext, state: MultiverseModalState): Promise<MultiverseModalResult> {
  return presentModal(ctx.ui, 'inline', buildMultiverseModalFactory(state));
}
