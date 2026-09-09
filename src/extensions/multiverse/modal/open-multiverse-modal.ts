import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import type { ModalComponentFactory, ModalTab } from '../../../libs/modal';
import { fitLine, ListTab, ModalDialog, presentModal, VimNavigationScheme } from '../../../libs/modal';
import type { SessionRole } from '../agents/session-role-state.ts';
import type { PresetSelection } from '../agents/subagent-model-resolver.ts';
import type { ParentAgent } from '../orchestrator/parent-agent.ts';
import { type MultiverseAgentPresetTabState, PresetsTab } from './multiverse-agent-preset-tab.ts';

const PARENT_AGENTS: readonly ParentAgent[] = ['default', 'megamind'];

export type MultiverseModalResult =
  | { action: 'close' }
  | { action: 'select'; agent: ParentAgent }
  | { action: 'select-preset'; selection: PresetSelection };

export interface MultiverseModalState {
  activeAgent: ParentAgent;
  role: SessionRole;
  megamindAvailable: boolean;
  presets?: MultiverseAgentPresetTabState;
}

export function buildMultiverseModalFactory(state: MultiverseModalState): ModalComponentFactory<MultiverseModalResult> {
  return (tui, theme, keybindings, done, frame) => {
    const disabled = (agent: ParentAgent) => state.role.kind !== 'parent' || (agent === 'megamind' && !state.megamindAvailable);
    const switchTab = new ListTab<ParentAgent>(theme, {
      label: 'Switch Agents',
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

    const tabs: ModalTab[] =
      state.presets === undefined
        ? [switchTab, childSessionsTab]
        : [
            switchTab,
            new PresetsTab(theme, state.presets, state.role.kind !== 'parent', selection => done({ action: 'select-preset', selection })),
            childSessionsTab,
          ];

    return new ModalDialog(tui, theme, keybindings, {
      tabs,
      navigation: new VimNavigationScheme(),
      frame,
      height: state.presets === undefined ? 'auto' : 'fit',
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
