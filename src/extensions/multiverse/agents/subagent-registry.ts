import type { MultiverseConfig } from '../../../schemas/multiverse.config.schema.ts';
import { loadSubagentDefinition, type SubagentDefinition } from './subagent-definition.ts';

export class SubAgentRegistry {
  private readonly subAgents = new Map<string, SubagentDefinition>();
  private readonly availability = new Map<string, boolean>();
  private readonly registeredPaths = new Set<string>();

  /** Each path is read once per registry. A conflicting name never overwrites its first registration. */
  register(paths: readonly string[]): string[] {
    const errors: string[] = [];
    for (const filePath of paths) {
      if (this.registeredPaths.has(filePath)) continue;
      this.registeredPaths.add(filePath);
      const result = loadSubagentDefinition(filePath);
      if (result.status === 'error') {
        errors.push(result.error);
        continue;
      }
      const existing = this.subAgents.get(result.data.name);
      if (existing) {
        errors.push(`${filePath}: duplicate subagent "${result.data.name}" already registered from ${existing.filePath}.`);
        continue;
      }
      this.subAgents.set(result.data.name, result.data);
      this.availability.set(result.data.name, false);
    }
    return errors;
  }

  resolveAvailability(config: MultiverseConfig): void {
    for (const name of this.subAgents.keys()) {
      const settings = Object.hasOwn(config.subagents, name) ? config.subagents[name] : undefined;
      this.availability.set(name, settings?.enabled ?? true);
    }
  }

  get availableSubAgents(): SubagentDefinition[] {
    return [...this.subAgents.values()].filter(agent => this.availability.get(agent.name));
  }

  getSubAgent(name: string): { agent: SubagentDefinition; enabled: boolean } | null {
    const agent = this.subAgents.get(name);
    return agent ? { agent, enabled: this.availability.get(name) === true } : null;
  }
}
