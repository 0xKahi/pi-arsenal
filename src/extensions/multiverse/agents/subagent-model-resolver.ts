import type { MultiverseConfig } from '../../../schemas/multiverse.config.schema.ts';
import type { ModelConfig } from '../../../schemas/shared-config.schema.ts';

/** The built-in baseline is distinct from a configured preset named "default". */
export type PresetSelection = { kind: 'baseline' } | { kind: 'named'; name: string };

const baseline = (): PresetSelection => ({ kind: 'baseline' });

/** Owns the session-local preset choice and pure field-level model composition. */
export class SubAgentModelResolver {
  private config: MultiverseConfig;
  private selection: PresetSelection;

  constructor(config: MultiverseConfig) {
    this.config = config;
    this.selection = this.initialSelection(config);
  }

  /** Refresh configuration while retaining the user's explicit selection when possible. */
  updateConfig(config: MultiverseConfig): void {
    this.config = config;
  }

  /** Reinitialize the session-local choice from the newly loaded configuration. */
  reset(config: MultiverseConfig): void {
    this.config = config;
    this.selection = this.initialSelection(config);
  }

  select(selection: PresetSelection): void {
    this.selection = selection;
  }

  currentSelection(): PresetSelection {
    return this.normalize(this.selection);
  }

  resolveModel(agent: string, selection: PresetSelection = this.currentSelection()): Partial<ModelConfig> {
    const subagent = Object.hasOwn(this.config.subagents, agent) ? this.config.subagents[agent]?.model : undefined;
    const effective = this.normalize(selection);
    const preset = effective.kind === 'named' ? this.config.presets?.[effective.name] : undefined;
    const override = preset && Object.hasOwn(preset, agent) ? preset[agent] : undefined;
    // Both spreads create a fresh object and never mutate loaded configuration.
    return { ...subagent, ...override };
  }

  private initialSelection(config: MultiverseConfig): PresetSelection {
    const name = config.defaultPreset;
    if (name !== undefined && Object.hasOwn(config.presets ?? {}, name)) return { kind: 'named', name };
    return baseline();
  }

  private normalize(selection: PresetSelection): PresetSelection {
    if (selection.kind === 'named' && Object.hasOwn(this.config.presets ?? {}, selection.name)) {
      return { kind: 'named', name: selection.name };
    }
    return baseline();
  }
}
