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
  });

  it('initializes one shared provider for extensions', () => {
    writeFileSync(globalPath, JSON.stringify({ tmux_popup: { enabled: true }, p2p_council: { enabled: true, layout: 'overlay' } }));
    const loader = new ConfigLoader();

    const result = loader.initializeConfig(createCtx(false, tmpDir), createResolver(globalPath));

    expect(result.success).toBe(true);
    expect(loader.getTmuxPopup().enabled).toBe(true);
    expect(loader.getP2pCouncil()).toEqual({ enabled: true, layout: 'overlay' });
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

  it('fails on malformed configuration', () => {
    writeFileSync(globalPath, '{ not valid json');

    const result = ConfigLoader.load(createCtx(false, tmpDir), createResolver(globalPath));
    expect(result.success).toBe(false);
  });
});
