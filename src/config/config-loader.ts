import { readFileSync } from 'node:fs';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { type Config, type ConfigPartial, ConfigPartialSchema, ConfigSchema } from '../schemas/config.schema';
import { PathUtil } from '../utils/path.util';
import { RawDataParser } from '../utils/raw-data-parser.util';

export type ConfigLoadResult = { success: true; config: Config } | { success: false; error: string };

type PartialConfigLoadResult = { success: true; config: ConfigPartial } | { success: false; error: string };

export interface ConfigResolver {
  findExtensionConfig(input: { type: 'global' } | { type: 'project'; cwd: string }): { exists: boolean; path: string };
}

export class DefaultConfigResolver implements ConfigResolver {
  findExtensionConfig(input: { type: 'global' } | { type: 'project'; cwd: string }) {
    return PathUtil.findExtensionConfig(input);
  }
}

export interface ConfigProvider {
  getP2pHub(): Config['p2p_hub'];
  getTmuxPopup(): Config['tmux_popup'];
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

  public getP2pHub(): Config['p2p_hub'] {
    return this.config.p2p_hub;
  }

  public getTmuxPopup(): Config['tmux_popup'] {
    return this.config.tmux_popup;
  }

  static load(ctx: Pick<ExtensionContext, 'cwd' | 'isProjectTrusted'>, resolver: ConfigResolver = new DefaultConfigResolver()): ConfigLoadResult {
    let config: Config = ConfigSchema.parse({});

    const globalResult = ConfigLoader.loadPartialConfig({ type: 'global' }, resolver);
    if (globalResult) {
      if (!globalResult.success) return globalResult;
      config = ConfigLoader.mergeConfig(config, globalResult.config);
    }

    if (ctx.isProjectTrusted()) {
      const projectResult = ConfigLoader.loadPartialConfig({ type: 'project', cwd: ctx.cwd }, resolver);
      if (projectResult) {
        if (!projectResult.success) return projectResult;
        config = ConfigLoader.mergeConfig(config, projectResult.config);
      }
    }

    try {
      config = ConfigSchema.parse(config);
      return { success: true, config };
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

    try {
      const config = ConfigPartialSchema.parse(record);
      return { success: true, config };
    } catch (error) {
      return { success: false, error: `Invalid configuration in ${found.path}: ${ConfigLoader.formatError(error)}` };
    }
  }

  private static mergeConfig(base: Config, override: ConfigPartial): Config {
    return {
      ...base,
      tmux_popup: {
        ...base.tmux_popup,
        ...override.tmux_popup,
      },
      p2p_hub: {
        ...base.p2p_hub,
        ...override.p2p_hub,
      },
    };
  }

  private static formatError(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
  }
}
