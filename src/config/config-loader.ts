import { readFileSync } from 'node:fs';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { type Config, type ConfigPartial, ConfigPartialSchema, ConfigSchema } from '../schemas/config.schema';
import { MultiverseConfigPartialSchema } from '../schemas/multiverse.config.schema';
import { PathUtil } from '../utils/path.util';
import { RawDataParser } from '../utils/raw-data-parser.util';

export type ConfigLoadResult = { success: true; config: Config; warnings: string[] } | { success: false; error: string };

type PartialConfigLoadResult = { success: true; config: ConfigPartial; warnings: string[] } | { success: false; error: string };

export interface ConfigResolver {
  findExtensionConfig(input: { type: 'global' } | { type: 'project'; cwd: string }): { exists: boolean; path: string };
}

export class DefaultConfigResolver implements ConfigResolver {
  findExtensionConfig(input: { type: 'global' } | { type: 'project'; cwd: string }) {
    return PathUtil.findExtensionConfig(input);
  }
}

export interface ConfigProvider {
  getP2pCouncil(): Config['p2p_council'];
  getTmuxPopup(): Config['tmux_popup'];
  getMultiverse(): Config['multiverse'];
}

export class ConfigLoader implements ConfigProvider {
  private config: Config = ConfigSchema.parse({});

  public initializeConfig(
    ctx: Pick<ExtensionContext, 'cwd' | 'isProjectTrusted'>,
    resolver: ConfigResolver = new DefaultConfigResolver(),
  ): ConfigLoadResult {
    this.config = ConfigSchema.parse({});
    const result = ConfigLoader.load(ctx, resolver);
    if (result.success) this.config = result.config;
    return result;
  }

  public getP2pCouncil(): Config['p2p_council'] {
    return this.config.p2p_council;
  }

  public getTmuxPopup(): Config['tmux_popup'] {
    return this.config.tmux_popup;
  }

  public getMultiverse(): Config['multiverse'] {
    return this.config.multiverse;
  }

  static load(ctx: Pick<ExtensionContext, 'cwd' | 'isProjectTrusted'>, resolver: ConfigResolver = new DefaultConfigResolver()): ConfigLoadResult {
    let config: Config = ConfigSchema.parse({});
    const warnings: string[] = [];

    const globalResult = ConfigLoader.loadPartialConfig({ type: 'global' }, resolver);
    if (globalResult) {
      if (!globalResult.success) return globalResult;
      config = ConfigLoader.mergeConfig(config, globalResult.config);
      warnings.push(...globalResult.warnings);
    }

    if (ctx.isProjectTrusted()) {
      const projectResult = ConfigLoader.loadPartialConfig({ type: 'project', cwd: ctx.cwd }, resolver);
      if (projectResult) {
        if (!projectResult.success) return projectResult;
        config = ConfigLoader.mergeConfig(config, projectResult.config);
        warnings.push(...projectResult.warnings);
      }
    }

    try {
      config = ConfigSchema.parse(config);
      return { success: true, config, warnings };
    } catch (error) {
      return { success: false, error: `Final configuration validation failed: ${ConfigLoader.formatError(error)}` };
    }
  }

  private static loadPartialConfig(
    input: { type: 'global' } | { type: 'project'; cwd: string },
    resolver: ConfigResolver,
  ): PartialConfigLoadResult | undefined {
    const found = resolver.findExtensionConfig(input);
    if (!found.exists) return undefined;

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(found.path, 'utf8'));
    } catch (error) {
      return { success: false, error: `Failed to parse ${found.path}: ${ConfigLoader.formatError(error)}` };
    }

    const record = RawDataParser.asRecord(raw);
    if (!record) {
      return { success: false, error: `Configuration file ${found.path} must contain a JSON object.` };
    }

    const { multiverse: rawMultiverse, ...rawBase } = record;
    let config: ConfigPartial;
    try {
      config = ConfigPartialSchema.omit({ multiverse: true }).parse(rawBase);
    } catch (error) {
      return { success: false, error: `Invalid configuration in ${found.path}: ${ConfigLoader.formatError(error)}` };
    }

    const warnings: string[] = [];
    if (rawMultiverse !== undefined) {
      const result = MultiverseConfigPartialSchema.safeParse(rawMultiverse);
      if (result.success) {
        config.multiverse = result.data;
      } else {
        config.multiverse = ConfigSchema.parse({}).multiverse;
        warnings.push(
          `Invalid Multiverse configuration ${JSON.stringify(rawMultiverse)} in ${found.path}; Multiverse was disabled: ${ConfigLoader.formatError(result.error)}`,
        );
      }
    }
    return { success: true, config, warnings };
  }

  private static mergeConfig(base: Config, override: ConfigPartial): Config {
    return {
      ...base,
      tmux_popup: {
        ...base.tmux_popup,
        ...override.tmux_popup,
      },
      p2p_council: {
        ...base.p2p_council,
        ...override.p2p_council,
      },
      multiverse: {
        ...base.multiverse,
        ...override.multiverse,
        subagents: Object.fromEntries(
          [...new Set([...Object.keys(base.multiverse.subagents), ...Object.keys(override.multiverse?.subagents ?? {})])].map(name => {
            const current = Object.hasOwn(base.multiverse.subagents, name) ? base.multiverse.subagents[name] : undefined;
            const patch =
              override.multiverse?.subagents && Object.hasOwn(override.multiverse.subagents, name) ? override.multiverse.subagents[name] : undefined;
            return [
              name,
              {
                enabled: true,
                ...current,
                ...patch,
                model: ConfigLoader.mergeOptionalModel(current?.model, patch?.model),
              },
            ];
          }),
        ),
      },
    };
  }

  private static mergeOptionalModel<T extends Record<string, unknown>>(base: T | undefined, override: Partial<T> | undefined): T | undefined {
    if (!base && !override) return undefined;
    return { ...base, ...override } as T;
  }

  private static formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
