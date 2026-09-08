import { describe, expect, it } from 'bun:test';
import type { KeybindingsManager, Theme } from '@earendil-works/pi-coding-agent';
import {
  buildMultiverseModalFactory,
  openMultiverseModal,
  type MultiverseModalResult,
} from '../../../../src/extensions/multiverse/modal/open-multiverse-modal.ts';
import type { ModalDialog } from '../../../../src/libs/modal';

const theme = {
  fg: (color: string, text: string) => `[${color}]${text}[/${color}]`,
  bold: (text: string) => text,
} as Theme;

const keybindings = {
  matches: (data: string, action: string) =>
    ({ tab: 'tui.input.tab', up: 'tui.select.up', down: 'tui.select.down', enter: 'tui.select.confirm', esc: 'tui.select.cancel' })[data] === action,
} as unknown as KeybindingsManager;

const tui = { terminal: { rows: 24 }, requestRender: () => undefined };

const parentRole = { kind: 'parent' } as const;
const childRole = {
  kind: 'child',
  identity: { version: 1 as const, agent: 'fixer', parentSessionId: 'parent' },
} as const;

function dialog(
  state: Parameters<typeof buildMultiverseModalFactory>[0],
  results: MultiverseModalResult[] = [],
): ModalDialog<MultiverseModalResult> {
  return buildMultiverseModalFactory(state)(tui as never, theme, keybindings, result => results.push(result), 'inline') as ModalDialog<MultiverseModalResult>;
}

describe('Multiverse modal', () => {
  it('shows both tabs and initially selects the active persona', () => {
    const modal = dialog({ activeAgent: 'megamind', role: parentRole, megamindAvailable: true });
    const rendered = modal.render(160).join('\n');

    expect(rendered).toContain('[accent]Switch Agent[/accent]');
    expect(rendered).toContain('[muted]Child Sessions[/muted]');
    expect(rendered).toContain('[accent]> [/accent][accent]Megamind[/accent][success] (active)[/success]');
  });

  it('switches tabs with Tab and renders the child-session placeholder', () => {
    const modal = dialog({ activeAgent: 'default', role: parentRole, megamindAvailable: true });
    modal.handleInput('\t');
    expect(modal.render(60).join('\n')).toContain('Coming soon.');
  });

  it('uses Vim navigation and returns the selected parent persona', () => {
    const results: MultiverseModalResult[] = [];
    const modal = dialog({ activeAgent: 'default', role: parentRole, megamindAvailable: true }, results);
    modal.handleInput('j');
    modal.handleInput('\r');
    expect(results).toEqual([{ action: 'select', agent: 'megamind' }]);
  });

  it('marks both options disabled in a child and confirmation has no effect', () => {
    const results: MultiverseModalResult[] = [];
    const modal = dialog({ activeAgent: 'default', role: childRole, megamindAvailable: true }, results);
    const rendered = modal.render(160).join('\n');
    expect(rendered.match(/\(disabled\)/g)).toHaveLength(2);

    modal.handleInput('\r');
    modal.handleInput('j');
    modal.handleInput('\r');
    expect(results).toEqual([]);
  });

  it('keeps Megamind disabled when no subagent is available', () => {
    const results: MultiverseModalResult[] = [];
    const modal = dialog({ activeAgent: 'default', role: parentRole, megamindAvailable: false }, results);
    modal.handleInput('j');
    expect(modal.render(160).join('\n')).toContain('[dim]Megamind[/dim][dim] (disabled)[/dim]');
    modal.handleInput('\r');
    expect(results).toEqual([]);
  });

  it('presents with the shared inline modal host', async () => {
    const options: unknown[] = [];
    const ctx = {
      ui: {
        custom: (_factory: unknown, value: unknown) => {
          options.push(value);
          return Promise.resolve({ action: 'close' });
        },
      },
    };
    await openMultiverseModal(ctx as never, { activeAgent: 'default', role: parentRole, megamindAvailable: true });
    expect(options).toEqual([undefined]);
  });
});
