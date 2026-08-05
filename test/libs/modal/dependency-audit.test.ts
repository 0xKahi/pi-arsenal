import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const LIB_ROOT = join(import.meta.dir, '../../../src/libs/modal');
const HOST_PACKAGES = ['@earendil-works/pi-tui', '@earendil-works/pi-coding-agent', '@earendil-works/pi-ai'];

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (entry.endsWith('.ts')) files.push(path);
  }
  return files;
}

function importSources(path: string): string[] {
  const sources: string[] = [];
  const content = readFileSync(path, 'utf8');
  const pattern = /(?:import|export)[^'"]*from\s+'([^']+)'/g;
  for (const match of content.matchAll(pattern)) {
    if (match[1] !== undefined) sources.push(match[1]);
  }
  return sources;
}

describe('vendored modal library self-containment', () => {
  test('imports only Pi host packages or files within the library', () => {
    const files = sourceFiles(LIB_ROOT);
    expect(files.length).toBeGreaterThan(0);

    const violations: string[] = [];
    for (const file of files) {
      for (const source of importSources(file)) {
        const isHost = HOST_PACKAGES.some(pkg => source === pkg || source.startsWith(`${pkg}/`));
        const isInternal = source.startsWith('./') || source.startsWith('../');
        if (!isHost && !isInternal) {
          violations.push(`${relative(LIB_ROOT, file)} imports ${source}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test('relative imports never escape the library directory', () => {
    const files = sourceFiles(LIB_ROOT);
    const escapes: string[] = [];
    for (const file of files) {
      for (const source of importSources(file)) {
        if (source.startsWith('../')) {
          const resolved = join(file, '..', source);
          if (relative(LIB_ROOT, resolved).startsWith('..')) {
            escapes.push(`${relative(LIB_ROOT, file)} escapes via ${source}`);
          }
        }
      }
    }
    expect(escapes).toEqual([]);
  });
});
