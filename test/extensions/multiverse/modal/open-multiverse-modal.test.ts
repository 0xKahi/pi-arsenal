import { describe, expect, it } from 'bun:test';
import type { KeybindingsManager, Theme } from '@earendil-works/pi-coding-agent';
import {
  buildMultiverseModalFactory,
  type MultiverseModalResult,
  openMultiverseModal,
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

function presetOptions() {
  return [
    {
      selection: { kind: 'baseline' as const },
      agents: [
        { name: 'explorer', model: { provider: 'base-provider', modelId: 'base-model', reasoning: 'low' as const } },
        { name: 'fixer', model: {} },
      ],
    },
    {
      selection: { kind: 'named' as const, name: 'smart' },
      agents: [
        { name: 'explorer', model: { provider: 'base-provider', modelId: 'base-model', reasoning: 'high' as const } },
        { name: 'fixer', model: {} },
      ],
    },
  ];
}

function dialog(state: Parameters<typeof buildMultiverseModalFactory>[0], results: MultiverseModalResult[] = []): ModalDialog<MultiverseModalResult> {
  return buildMultiverseModalFactory(state)(
    tui as never,
    theme,
    keybindings,
    result => results.push(result),
    'inline',
  ) as ModalDialog<MultiverseModalResult>;
}

describe('Multiverse modal', () => {
  it('shows both tabs and initially selects the active persona', () => {
    const modal = dialog({ activeAgent: 'megamind', role: parentRole, megamindAvailable: true });
    const rendered = modal.render(160).join('\n');

    expect(rendered).toContain('[accent]Switch Agents[/accent]');
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

  it('renders grouped preset previews in a third tab and selects a named preset', () => {
    const results: MultiverseModalResult[] = [];
    const modal = dialog(
      {
        activeAgent: 'default',
        role: parentRole,
        megamindAvailable: true,
        presets: {
          selection: { kind: 'named', name: 'smart' },
          options: presetOptions(),
          parentModel: { provider: 'parent-provider', id: 'parent-model' },
          parentReasoning: 'medium',
        },
      },
      results,
    );

    modal.handleInput('\t');
    const initial = modal.render(120).join('\n');
    expect(initial).toContain('[default]');
    expect(initial).toContain('[smart]');
    expect(initial).toContain('(active)');
    modal.handleInput('j');
    const rendered = modal.render(120).join('\n');
    expect(rendered).toContain('Presets');
    expect(rendered).toContain('explorer: base-model (base-provider) / requested reasoning: high');
    expect(rendered).toContain('fixer: parent-model (parent-provider) / requested reasoning: medium');

    modal.handleInput('k');
    modal.handleInput('\r');
    expect(results).toEqual([{ action: 'select-preset', selection: { kind: 'baseline' } }]);
  });

  it('disambiguates a configured default and disables preset confirmation in children', () => {
    const results: MultiverseModalResult[] = [];
    const modal = dialog(
      {
        activeAgent: 'default',
        role: childRole,
        megamindAvailable: true,
        presets: {
          selection: { kind: 'baseline' },
          options: [
            { selection: { kind: 'baseline' as const }, agents: [] },
            { selection: { kind: 'named' as const, name: 'default' }, agents: [] },
          ],
        },
      },
      results,
    );
    modal.handleInput('\t');
    const rendered = modal.render(80).join('\n');
    expect(rendered).toContain('(built-in)');
    expect(rendered).toContain('(configured)');
    expect(rendered).toContain('No available agents.');
    expect(rendered).toContain('(disabled)');
    modal.handleInput('\r');
    expect(results).toEqual([]);
  });

  it('bounds and scrolls an oversized single preset roster with safe text', () => {
    const modal = dialog({
      activeAgent: 'default',
      role: parentRole,
      megamindAvailable: true,
      presets: {
        selection: { kind: 'baseline' },
        options: [
          {
            selection: { kind: 'baseline' as const },
            agents: Array.from({ length: 30 }, (_, index) => ({ name: `agent-${index}\u001b[31m`, model: {} })),
          },
        ],
      },
    });
    modal.handleInput('\t');
    modal.handleInput('\u0004');
    const lines = modal.render(24);
    expect(lines.length <= 12).toBe(true);
    expect(lines.join('\n')).not.toContain('\u001b[31m');
    expect(lines.join('\n')).toContain('(');
  });

  it('keeps short tabs compact and cycles Presets before Child Sessions', () => {
    const modal = dialog({
      activeAgent: 'default',
      role: parentRole,
      megamindAvailable: true,
      presets: {
        selection: { kind: 'baseline' },
        options: [{ selection: { kind: 'baseline' as const }, agents: [] }],
        parentModel: { provider: 'parent-provider', id: 'parent-model' },
        parentReasoning: 'medium',
      },
    });

    expect(modal.render(100).length).toBeLessThan(12);
    modal.handleInput('\t');
    expect(modal.render(100).join('\n')).toContain('Presets');
    expect(modal.render(100).length).toBeLessThan(12);
    modal.handleInput('\t');
    expect(modal.render(100).join('\n')).toContain('Coming soon.');
    expect(modal.render(100).length).toBeLessThan(12);
    modal.handleInput('\u001b[Z');
    expect(modal.render(100).join('\n')).toContain('Presets');
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
