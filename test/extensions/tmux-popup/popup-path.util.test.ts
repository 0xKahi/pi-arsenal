import { describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { normalizeTmuxPopupPath, validateExistingFile } from '../../../src/extensions/tmux-popup/popup-path.util';

describe('normalizeTmuxPopupPath', () => {
  it('accepts absolute paths', () => {
    const result = normalizeTmuxPopupPath('/home/user/project/file.ts');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.normalizedPath).toBe('/home/user/project/file.ts');
  });

  it('strips one optional leading @', () => {
    const result1 = normalizeTmuxPopupPath('@/home/user/project/file.ts');
    expect(result1.success).toBe(true);
    if (!result1.success) return;
    expect(result1.normalizedPath).toBe('/home/user/project/file.ts');

    const result2 = normalizeTmuxPopupPath('@~/project/file.ts');
    expect(result2.success).toBe(true);
    if (!result2.success) return;
    expect(result2.normalizedPath).toBe(path.join(homedir(), 'project/file.ts'));
  });

  it('expands current-user home paths', () => {
    const result = normalizeTmuxPopupPath('~/project/file.ts');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.normalizedPath).toBe(path.join(homedir(), 'project/file.ts'));
  });

  it('rejects relative paths', () => {
    expect(normalizeTmuxPopupPath('src/file.ts').success).toBe(false);
    expect(normalizeTmuxPopupPath('./src/file.ts').success).toBe(false);
    expect(normalizeTmuxPopupPath('../src/file.ts').success).toBe(false);
  });

  it('rejects ~other-user paths', () => {
    const result = normalizeTmuxPopupPath('~other-user/file.ts');
    expect(result.success).toBe(false);
  });
});

describe('validateExistingFile', () => {
  let tmpDir: string;

  it('accepts existing files', () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'pi-arsenal-path-'));
    const filePath = path.join(tmpDir, 'file.ts');
    writeFileSync(filePath, 'hello');

    const result = validateExistingFile(filePath);
    expect(result.success).toBe(true);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('accepts file-targeting symlinks', () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'pi-arsenal-path-'));
    const filePath = path.join(tmpDir, 'file.ts');
    const linkPath = path.join(tmpDir, 'link.ts');
    writeFileSync(filePath, 'hello');
    symlinkSync(filePath, linkPath);

    const result = validateExistingFile(linkPath);
    expect(result.success).toBe(true);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('rejects missing paths', () => {
    const result = validateExistingFile('/non/existent/path/file.ts');
    expect(result.success).toBe(false);
  });

  it('rejects directories', () => {
    tmpDir = mkdtempSync(path.join(tmpdir(), 'pi-arsenal-path-'));
    const dirPath = path.join(tmpDir, 'directory');
    mkdirSync(dirPath);

    const result = validateExistingFile(dirPath);
    expect(result.success).toBe(false);

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
