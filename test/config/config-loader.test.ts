import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConfigLoader, type ConfigResolver } from '../../src/config/config-loader';

const createCtx = (trusted: boolean, cwd: string) => ({
  cwd,
  isProjectTrusted: () => trusted,
});

const createResolver = (globalPath?: string, projectPath?: string): ConfigResolver => ({
  findExtensionConfig: input => {
    if (input.type === 'global') return { exists: Boolean(globalPath), path: globalPath ?? '' };
    return { exists: Boolean(projectPath), path: projectPath ?? '' };
  },
});

describe('ConfigLoader', () => {
  let tmpDir: string;
  let globalPath: string;
  let projectPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'pi-arsenal-config-'));
    globalPath = path.join(tmpDir, 'global-config.json');
    projectPath = path.join(tmpDir, 'project-config.json');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses defaults when no configuration files exist', () => {
    const result = ConfigLoader.load(createCtx(false, tmpDir), createResolver());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.tmux_popup).toEqual({
      enabled: false,
      width: 50,
      height: 50,
      fileCommand: 'nvim',
    });
    expect(result.config.p2p_council).toEqual({ enabled: false, layout: 'inline' });
    expect(result.config.multiverse).toEqual({
      enabled: false,
      defaultAgent: 'default',
      maxConcurrency: 5,
      subagents: {
        explorer: { enabled: true },
        fixer: { enabled: true },
        visualizer: { enabled: true },
      },
    });
  });

  it('initializes one shared provider for extensions', () => {
    writeFileSync(globalPath, JSON.stringify({ tmux_popup: { enabled: true }, p2p_council: { enabled: true, layout: 'overlay' } }));
    const loader = new ConfigLoader();

    const result = loader.initializeConfig(createCtx(false, tmpDir), createResolver(globalPath));

    expect(result.success).toBe(true);
    expect(loader.getTmuxPopup().enabled).toBe(true);
    expect(loader.getP2pCouncil()).toEqual({ enabled: true, layout: 'overlay' });
    expect(loader.getMultiverse().enabled).toBe(false);
  });

  it('resets the shared provider to defaults when reinitialization fails', () => {
    const loader = new ConfigLoader();
    writeFileSync(globalPath, JSON.stringify({ p2p_council: { enabled: true } }));
    loader.initializeConfig(createCtx(false, tmpDir), createResolver(globalPath));
    writeFileSync(globalPath, '{ invalid');

    const result = loader.initializeConfig(createCtx(false, tmpDir), createResolver(globalPath));

    expect(result.success).toBe(false);
    expect(loader.getP2pCouncil().enabled).toBe(false);
  });

  it('applies global configuration overrides', () => {
    writeFileSync(globalPath, JSON.stringify({ tmux_popup: { enabled: true, width: 80 } }));

    const result = ConfigLoader.load(createCtx(false, tmpDir), createResolver(globalPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.tmux_popup).toEqual({
      enabled: true,
      width: 80,
      height: 50,
      fileCommand: 'nvim',
    });
  });

  it('layers p2p-council layout project configuration over global', () => {
    writeFileSync(globalPath, JSON.stringify({ p2p_council: { enabled: false, layout: 'inline' } }));
    writeFileSync(projectPath, JSON.stringify({ p2p_council: { enabled: true, layout: 'overlay' } }));

    const result = ConfigLoader.load(createCtx(true, tmpDir), createResolver(globalPath, projectPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.p2p_council).toEqual({ enabled: true, layout: 'overlay' });
  });

  it('does not treat the legacy p2p_hub key as an activation alias', () => {
    writeFileSync(globalPath, JSON.stringify({ p2p_hub: { enabled: true, layout: 'overlay' } }));

    const result = ConfigLoader.load(createCtx(false, tmpDir), createResolver(globalPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.p2p_council).toEqual({ enabled: false, layout: 'inline' });
    expect(result.config).not.toHaveProperty('p2p_hub');
  });

  it('rejects an invalid p2p-council layout', () => {
    writeFileSync(globalPath, JSON.stringify({ p2p_council: { layout: 'floating' } }));

    const result = ConfigLoader.load(createCtx(false, tmpDir), createResolver(globalPath));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain('layout');
    expect(result.error).toContain('inline');
    expect(result.error).toContain('overlay');
  });

  it('fails when dimensions are out of bounds', () => {
    writeFileSync(globalPath, JSON.stringify({ tmux_popup: { width: 200 } }));

    const result = ConfigLoader.load(createCtx(false, tmpDir), createResolver(globalPath));
    expect(result.success).toBe(false);
  });

  it('layers trusted project configuration over global', () => {
    writeFileSync(globalPath, JSON.stringify({ tmux_popup: { enabled: true, height: 60 } }));
    writeFileSync(projectPath, JSON.stringify({ tmux_popup: { width: 75 } }));

    const result = ConfigLoader.load(createCtx(true, tmpDir), createResolver(globalPath, projectPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.tmux_popup).toEqual({
      enabled: true,
      width: 75,
      height: 60,
      fileCommand: 'nvim',
    });
  });

  it('ignores project configuration when project is untrusted', () => {
    writeFileSync(globalPath, JSON.stringify({ tmux_popup: { enabled: true } }));
    writeFileSync(projectPath, JSON.stringify({ tmux_popup: { enabled: false, width: 30 } }));

    const result = ConfigLoader.load(createCtx(false, tmpDir), createResolver(globalPath, projectPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.tmux_popup.enabled).toBe(true);
    expect(result.config.tmux_popup.width).toBe(50);
  });

  it('deep-merges trusted project subagent model settings over global values', () => {
    writeFileSync(
      globalPath,
      JSON.stringify({
        multiverse: {
          enabled: true,
          maxConcurrency: 7,
          subagents: { explorer: { enabled: true, model: { provider: 'openai', modelId: 'one', reasoning: 'high' } } },
        },
      }),
    );
    writeFileSync(projectPath, JSON.stringify({ multiverse: { subagents: { explorer: { model: { modelId: 'two' } } } } }));

    const result = ConfigLoader.load(createCtx(true, tmpDir), createResolver(globalPath, projectPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.multiverse.enabled).toBe(true);
    expect(result.config.multiverse.maxConcurrency).toBe(7);
    expect(result.config.multiverse.subagents.explorer?.model).toEqual({
      provider: 'openai',
      modelId: 'two',
      reasoning: 'high',
    });
    expect(result.config.multiverse.subagents.fixer?.enabled).toBe(true);
  });

  it('merges arbitrary agent names without treating configuration as registration', () => {
    writeFileSync(
      globalPath,
      JSON.stringify({
        multiverse: {
          enabled: true,
          subagents: {
            researcher: { enabled: false, model: { provider: 'custom', modelId: 'old' } },
          },
        },
      }),
    );
    writeFileSync(
      projectPath,
      JSON.stringify({
        multiverse: {
          subagents: {
            researcher: { model: { modelId: 'new' } },
            reviewer: { model: { reasoning: 'low' } },
          },
        },
      }),
    );
    const result = ConfigLoader.load(createCtx(true, tmpDir), createResolver(globalPath, projectPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.multiverse.subagents.researcher).toEqual({ enabled: false, model: { provider: 'custom', modelId: 'new' } });
    expect(result.config.multiverse.subagents.reviewer).toEqual({ enabled: true, model: { reasoning: 'low' } });
    expect(result.warnings).toEqual([]);
  });

  it.each([0, 11, 1.5])('isolates an invalid Multiverse concurrency value %p', maxConcurrency => {
    writeFileSync(globalPath, JSON.stringify({ tmux_popup: { enabled: true }, multiverse: { enabled: true, maxConcurrency } }));

    const result = ConfigLoader.load(createCtx(false, tmpDir), createResolver(globalPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.tmux_popup.enabled).toBe(true);
    expect(result.config.multiverse.enabled).toBe(false);
    expect(result.warnings.join('\n')).toContain('maxConcurrency');
  });

  it('rejects unknown per-subagent fields and disables only Multiverse', () => {
    writeFileSync(
      globalPath,
      JSON.stringify({ p2p_council: { enabled: true }, multiverse: { enabled: true, subagents: { fixer: { concurrency: 2 } } } }),
    );

    const result = ConfigLoader.load(createCtx(false, tmpDir), createResolver(globalPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.p2p_council.enabled).toBe(true);
    expect(result.config.multiverse.enabled).toBe(false);
    expect(result.warnings.join('\n')).toContain('concurrency');
  });

  it('identifies an unknown subagent reasoning level without disabling unrelated features', () => {
    writeFileSync(
      globalPath,
      JSON.stringify({ tmux_popup: { enabled: true }, multiverse: { subagents: { explorer: { model: { reasoning: 'extreme' } } } } }),
    );

    const result = ConfigLoader.load(createCtx(false, tmpDir), createResolver(globalPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.tmux_popup.enabled).toBe(true);
    expect(result.config.multiverse.enabled).toBe(false);
    expect(result.warnings.join('\n')).toContain('reasoning');
    expect(result.warnings.join('\n')).toContain('extreme');
  });

  it('deep-merges trusted project preset model fields and retains sibling presets and agents', () => {
    writeFileSync(
      globalPath,
      JSON.stringify({
        multiverse: {
          defaultPreset: 'global',
          presets: {
            global: {
              fixer: { provider: 'openai', modelId: 'one', reasoning: 'low' },
              explorer: { modelId: 'explore' },
            },
            retained: { visualizer: { provider: 'anthropic' } },
          },
        },
      }),
    );
    writeFileSync(
      projectPath,
      JSON.stringify({
        multiverse: {
          defaultPreset: 'global',
          presets: {
            global: { fixer: { reasoning: 'high' }, reviewer: {} },
            retained: {},
            project: {},
          },
        },
      }),
    );

    const result = ConfigLoader.load(createCtx(true, tmpDir), createResolver(globalPath, projectPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.multiverse.defaultPreset).toBe('global');
    expect(result.config.multiverse.presets).toEqual({
      global: {
        fixer: { provider: 'openai', modelId: 'one', reasoning: 'high' },
        explorer: { modelId: 'explore' },
        reviewer: {},
      },
      retained: { visualizer: { provider: 'anthropic' } },
      project: {},
    });
  });

  it('deep-merges prototype-like preset and agent names using own properties', () => {
    writeFileSync(globalPath, '{"multiverse":{"presets":{"__proto__":{"constructor":{"provider":"global"}}}}}');
    writeFileSync(projectPath, '{"multiverse":{"presets":{"__proto__":{"constructor":{"modelId":"project"}}}}}');

    const result = ConfigLoader.load(createCtx(true, tmpDir), createResolver(globalPath, projectPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    const prototypePreset = Object.getOwnPropertyDescriptor(result.config.multiverse.presets ?? {}, '__proto__')?.value;
    expect(Object.hasOwn(result.config.multiverse.presets ?? {}, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(prototypePreset ?? {}, 'constructor')?.value).toEqual({ provider: 'global', modelId: 'project' });
  });

  it('allows a project defaultPreset to reference a globally defined preset', () => {
    writeFileSync(globalPath, JSON.stringify({ multiverse: { defaultPreset: 'other', presets: { smart: {}, other: {} } } }));
    writeFileSync(projectPath, JSON.stringify({ multiverse: { defaultPreset: 'smart' } }));

    const result = ConfigLoader.load(createCtx(true, tmpDir), createResolver(globalPath, projectPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.multiverse.defaultPreset).toBe('smart');
    expect(result.config.multiverse.presets).toEqual({ smart: {}, other: {} });
  });

  it('ignores untrusted project presets and defaultPreset', () => {
    writeFileSync(globalPath, JSON.stringify({ multiverse: { defaultPreset: 'global', presets: { global: {} } } }));
    writeFileSync(projectPath, JSON.stringify({ multiverse: { defaultPreset: 'project', presets: { project: {} } } }));

    const result = ConfigLoader.load(createCtx(false, tmpDir), createResolver(globalPath, projectPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.multiverse.defaultPreset).toBe('global');
    expect(result.config.multiverse.presets).toEqual({ global: {} });
  });

  it('accepts missing preset references and isolates invalid preset blocks', () => {
    writeFileSync(globalPath, JSON.stringify({ tmux_popup: { enabled: true }, multiverse: { defaultPreset: 'missing' } }));
    let result = ConfigLoader.load(createCtx(false, tmpDir), createResolver(globalPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.multiverse.defaultPreset).toBe('missing');

    writeFileSync(
      globalPath,
      JSON.stringify({ tmux_popup: { enabled: true }, multiverse: { presets: { smart: { fixer: { reasoning: 'invalid' } } } } }),
    );
    result = ConfigLoader.load(createCtx(false, tmpDir), createResolver(globalPath));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.config.tmux_popup.enabled).toBe(true);
    expect(result.config.multiverse.enabled).toBe(false);
    expect(result.warnings.join('\n')).toContain('reasoning');
  });

  it('fails on malformed configuration', () => {
    writeFileSync(globalPath, '{ not valid json');

    const result = ConfigLoader.load(createCtx(false, tmpDir), createResolver(globalPath));
    expect(result.success).toBe(false);
  });
});
