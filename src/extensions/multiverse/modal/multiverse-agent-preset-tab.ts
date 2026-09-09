import type { Theme } from '@earendil-works/pi-coding-agent';
import type { Hint, ModalTab, NavigationAction } from '../../../libs/modal';
import { fitLine } from '../../../libs/modal';
import type { ModelConfig, ReasoningLevel } from '../../../schemas/shared-config.schema.ts';
import type { PresetSelection } from '../agents/subagent-model-resolver.ts';

export interface MultiverseAgentPresetTabState {
  selection: PresetSelection;
  options: readonly {
    selection: PresetSelection;
    agents: readonly { name: string; model: Partial<ModelConfig> }[];
  }[];
  parentModel?: { provider: string; id: string };
  parentReasoning?: ReasoningLevel;
}

type PresetOption = MultiverseAgentPresetTabState['options'][number];

export class PresetsTab implements ModalTab {
  public readonly label = 'Presets';
  private readonly options: readonly PresetOption[];
  private selected: number;
  private scrollOffset = 0;
  private lastHeight = 1;
  private preserveHeadingContext = false;

  public constructor(
    private readonly theme: Theme,
    private readonly state: MultiverseAgentPresetTabState,
    private readonly disabled: boolean,
    private readonly onConfirm: (selection: PresetSelection) => void,
  ) {
    this.options = state.options;
    this.selected = Math.max(
      0,
      this.options.findIndex(option => sameSelection(option.selection, state.selection)),
    );
  }

  public handleInput(_data: string): void {}

  public handleNavigation(action: NavigationAction): void {
    if (action === 'confirm') {
      const selected = this.options[this.selected];
      if (selected !== undefined && !this.disabled) this.onConfirm(selected.selection);
      return;
    }
    if (this.options.length === 1) {
      const option = this.options[0];
      if (option === undefined) return;
      const { bodyHeight, maxOffset } = this.singlePresetViewport(this.lastHeight, this.agentLines(option).length);
      if (action === 'step-back') this.scrollOffset = Math.max(0, this.scrollOffset - 1);
      if (action === 'step-forward') this.scrollOffset = Math.min(maxOffset, this.scrollOffset + 1);
      if (action === 'page-back') this.scrollOffset = Math.max(0, this.scrollOffset - bodyHeight);
      if (action === 'page-forward') this.scrollOffset = Math.min(maxOffset, this.scrollOffset + bodyHeight);
      if (action === 'first') this.scrollOffset = 0;
      if (action === 'last') this.scrollOffset = maxOffset;
      return;
    }
    const previous = this.selected;
    switch (action) {
      case 'step-back':
        this.selected = Math.max(0, this.selected - 1);
        break;
      case 'step-forward':
        this.selected = Math.min(this.options.length - 1, this.selected + 1);
        break;
      case 'page-back':
        this.selected = Math.max(0, this.selected - Math.max(1, this.lastHeight - 1));
        break;
      case 'page-forward':
        this.selected = Math.min(this.options.length - 1, this.selected + Math.max(1, this.lastHeight - 1));
        break;
      case 'first':
        this.selected = 0;
        break;
      case 'last':
        this.selected = this.options.length - 1;
        break;
    }
    if (this.selected !== previous) {
      this.scrollOffset = 0;
      this.preserveHeadingContext = false;
    } else {
      this.preserveHeadingContext = true;
      const maxOffset = Math.max(0, this.allLines(1).length - Math.max(1, this.lastHeight - 1));
      if (action === 'step-back' || action === 'page-back' || action === 'first')
        this.scrollOffset = Math.max(0, action === 'page-back' ? this.scrollOffset - Math.max(1, this.lastHeight - 1) : 0);
      if (action === 'step-forward' || action === 'page-forward' || action === 'last')
        this.scrollOffset = Math.min(maxOffset, action === 'page-forward' ? this.scrollOffset + Math.max(1, this.lastHeight - 1) : maxOffset);
    }
  }

  public hints(): Hint[] {
    return this.disabled ? [['Enter', 'Disabled']] : [['Enter', 'Switch']];
  }

  public render(width: number, height: number | undefined): string[] {
    const viewport = Math.max(1, height ?? this.allLines(width).length);
    this.lastHeight = viewport;
    if (this.options.length === 1) return this.renderSinglePreset(width, viewport);
    const lines = this.allLines(width);
    const showOverflow = lines.length > viewport;
    const listHeight = showOverflow ? Math.max(1, viewport - 1) : viewport;
    const selectedHeading = this.headingLineIndex(this.selected);
    if (!this.preserveHeadingContext) this.keepHeadingVisible(selectedHeading, listHeight, lines.length);
    const visible = lines.slice(this.scrollOffset, this.scrollOffset + listHeight);
    if (showOverflow) {
      visible.push(this.theme.fg('dim', `  (${this.scrollOffset + 1}-${Math.min(lines.length, this.scrollOffset + listHeight)}/${lines.length})`));
    }
    return visible.map(line => fitLine(line, width));
  }

  private renderSinglePreset(width: number, height: number): string[] {
    const option = this.options[0];
    if (option === undefined) return [];
    const body = this.agentLines(option);
    const { bodyHeight, maxOffset, showOverflow } = this.singlePresetViewport(height, body.length);
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
    const lines = [this.renderHeading(option, true), ...body.slice(this.scrollOffset, this.scrollOffset + bodyHeight)];
    if (showOverflow && height > 1) {
      lines.push(this.theme.fg('dim', `  (${this.scrollOffset + 1}-${Math.min(body.length, this.scrollOffset + bodyHeight)}/${body.length})`));
    }
    return lines.map(line => fitLine(line, width));
  }

  private singlePresetViewport(height: number, bodyLength: number): { bodyHeight: number; maxOffset: number; showOverflow: boolean } {
    const showOverflow = bodyLength > Math.max(0, height - 1);
    const bodyHeight = Math.max(0, height - 1 - (showOverflow ? 1 : 0));
    return { bodyHeight, maxOffset: Math.max(0, bodyLength - bodyHeight), showOverflow };
  }

  private allLines(width: number): string[] {
    const lines: string[] = [];
    for (let index = 0; index < this.options.length; index++) {
      const option = this.options[index];
      if (option === undefined) continue;
      lines.push(this.renderHeading(option, index === this.selected));
      lines.push(...this.agentLines(option));
    }
    return lines.map(line => fitLine(line, width));
  }

  private agentLines(option: PresetOption): string[] {
    if (option.agents.length === 0) return [this.theme.fg('muted', '    No available agents.')];
    return option.agents.map(agent => {
      const modelId = agent.model.modelId ?? this.state.parentModel?.id ?? 'inherits parent model';
      const provider = agent.model.provider ?? this.state.parentModel?.provider ?? 'inherits parent provider';
      const reasoning = agent.model.reasoning ?? this.state.parentReasoning ?? 'inherits parent reasoning';
      return this.theme.fg(
        'muted',
        `    ${safeText(agent.name)}: ${safeText(modelId)} (${safeText(provider)}) / requested reasoning: ${safeText(reasoning)}`,
      );
    });
  }

  private headingLineIndex(optionIndex: number): number {
    let index = 0;
    for (let i = 0; i < optionIndex; i++) index += 1 + Math.max(1, this.options[i]?.agents.length ?? 0);
    return index;
  }

  private keepHeadingVisible(heading: number, height: number, lineCount: number): void {
    if (heading < this.scrollOffset) this.scrollOffset = heading;
    if (heading >= this.scrollOffset + height) this.scrollOffset = heading - height + 1;
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, Math.max(0, lineCount - height)));
  }

  private renderHeading(option: PresetOption, selected: boolean): string {
    const prefix = selected ? this.theme.fg('accent', '> ') : '  ';
    const active = sameSelection(option.selection, this.state.selection);
    const label =
      option.selection.kind === 'baseline'
        ? this.options.some(candidate => candidate.selection.kind === 'named' && candidate.selection.name === 'default')
          ? '[default] (built-in)'
          : '[default]'
        : option.selection.name === 'default'
          ? '[default] (configured)'
          : `[${safeText(option.selection.name)}]`;
    const styledLabel = selected ? this.theme.fg('accent', label) : label;
    const activeMarker = active ? this.theme.fg('success', ' (active)') : '';
    const disabledMarker = this.disabled ? this.theme.fg('dim', ' (disabled)') : '';
    return `${prefix}${styledLabel}${activeMarker}${disabledMarker}`;
  }
}

function sameSelection(left: PresetSelection, right: PresetSelection): boolean {
  return left.kind === right.kind && (left.kind !== 'named' || right.kind !== 'named' || left.name === right.name);
}

function safeText(value: string): string {
  let output = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    output += code < 0x20 || code === 0x7f ? ' ' : character;
  }
  return output;
}
