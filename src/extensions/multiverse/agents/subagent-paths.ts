import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUBAGENT_PROMPTS_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'subagent-prompts');

/** `optionalDirectory` makes a missing directory silent: no paths, no errors. */
export function discoverSubagentPaths(directory: string, options?: { optionalDirectory?: boolean }): { paths: string[]; errors: string[] } {
  try {
    const paths = readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(entry => path.join(directory, entry.name))
      .sort();
    return { paths, errors: [] };
  } catch (error) {
    if (options?.optionalDirectory && (error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { paths: [], errors: [] };
    }
    return { paths: [], errors: [`${directory}: unable to discover subagent definitions: ${String(error)}`] };
  }
}

/**
 * Build one ordered path list: bundled definitions first, then project, then global. Combined with
 * the registry's first-registration-wins deduplication, this ordering yields bundled-over-project-
 * over-global precedence. Omitted user directories are never read, which lets the caller express an
 * untrusted project by simply not passing it.
 */
export function discoverOrderedSubagentPaths(input: {
  bundledDirectory: string;
  /** Omitted when the project is untrusted — the directory is then never read. */
  projectDirectory?: string;
  globalDirectory?: string;
}): { paths: string[]; errors: string[] } {
  const bundled = discoverSubagentPaths(input.bundledDirectory);
  const project = input.projectDirectory ? discoverSubagentPaths(input.projectDirectory, { optionalDirectory: true }) : { paths: [], errors: [] };
  const global = input.globalDirectory ? discoverSubagentPaths(input.globalDirectory, { optionalDirectory: true }) : { paths: [], errors: [] };

  return {
    paths: [...bundled.paths, ...project.paths, ...global.paths],
    errors: [...bundled.errors, ...project.errors, ...global.errors],
  };
}
