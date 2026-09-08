import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SUBAGENT_PROMPTS_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'subagent-prompts');

export function discoverSubagentPaths(directory: string): { paths: string[]; errors: string[] } {
  try {
    const paths = readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(entry => path.join(directory, entry.name))
      .sort();
    return { paths, errors: [] };
  } catch (error) {
    return { paths: [], errors: [`${directory}: unable to discover subagent definitions: ${String(error)}`] };
  }
}
