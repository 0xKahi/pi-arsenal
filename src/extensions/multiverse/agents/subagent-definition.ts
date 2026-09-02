import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';

export const BUNDLED_SUBAGENT_NAMES = ['explorer', 'fixer', 'visualizer'] as const;
export const BUNDLED_SUBAGENT_PROMPTS_DIRECTORY = path.join(path.dirname(fileURLToPath(import.meta.url)), 'subagent-prompts');
export type BundledSubagentName = (typeof BUNDLED_SUBAGENT_NAMES)[number];

export interface SubagentDefinition {
  name: BundledSubagentName;
  tools: string[];
  skills: string[];
  prompt: string;
  filePath: string;
}

export interface SubagentDefinitionLoadResult {
  definitions: Map<BundledSubagentName, SubagentDefinition>;
  errors: string[];
}

export interface SubagentDefinitionLoadOptions {
  directory: string;
  availableTools: Iterable<string>;
  availableSkills: Iterable<string>;
}

const FrontmatterSchema = z.strictObject({
  name: z.string().min(1),
  tools: z.array(z.string().min(1)),
  skills: z.array(z.string().min(1)),
});

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;

const isBundledName = (value: string): value is BundledSubagentName => (BUNDLED_SUBAGENT_NAMES as readonly string[]).includes(value);

const duplicateValues = (values: string[]): string[] => values.filter((value, index) => values.indexOf(value) !== index);

export function loadSubagentDefinitions(options: SubagentDefinitionLoadOptions): SubagentDefinitionLoadResult {
  const definitions = new Map<BundledSubagentName, SubagentDefinition>();
  const errors: string[] = [];
  const availableTools = new Set(options.availableTools);
  const availableSkills = new Set(options.availableSkills);

  let fileNames: string[];
  try {
    fileNames = readdirSync(options.directory)
      .filter(fileName => fileName.endsWith('.md'))
      .sort();
  } catch (error) {
    return { definitions, errors: [`${options.directory}: unable to discover subagent definitions: ${formatError(error)}`] };
  }

  for (const fileName of fileNames) {
    const filePath = path.join(options.directory, fileName);
    const expectedName = path.basename(fileName, '.md');
    if (!isBundledName(expectedName)) {
      errors.push(`${filePath}: unsupported bundled subagent filename "${expectedName}"`);
      continue;
    }

    let source: string;
    try {
      source = readFileSync(filePath, 'utf8');
    } catch (error) {
      errors.push(`${filePath}: unable to read definition: ${formatError(error)}`);
      continue;
    }

    const match = FRONTMATTER_PATTERN.exec(source);
    if (!match) {
      errors.push(`${filePath}: expected YAML frontmatter delimited by ---`);
      continue;
    }

    let rawFrontmatter: unknown;
    try {
      rawFrontmatter = parse(match[1] ?? '');
    } catch (error) {
      errors.push(`${filePath}: invalid YAML frontmatter: ${formatError(error)}`);
      continue;
    }

    const parsed = FrontmatterSchema.safeParse(rawFrontmatter);
    if (!parsed.success) {
      errors.push(`${filePath}: invalid frontmatter: ${parsed.error.message}`);
      continue;
    }

    if (parsed.data.name !== expectedName) {
      errors.push(`${filePath}: declared name "${parsed.data.name}" does not match filename "${expectedName}"`);
      continue;
    }

    const duplicateTools = duplicateValues(parsed.data.tools);
    const duplicateSkills = duplicateValues(parsed.data.skills);
    if (duplicateTools.length > 0 || duplicateSkills.length > 0) {
      errors.push(
        `${filePath}: duplicate capabilities: ${[
          ...duplicateTools.map(value => `tool:${value}`),
          ...duplicateSkills.map(value => `skill:${value}`),
        ].join(', ')}`,
      );
      continue;
    }

    const unknownTools = parsed.data.tools.filter(tool => !availableTools.has(tool));
    const unknownSkills = parsed.data.skills.filter(skill => !availableSkills.has(skill));
    if (unknownTools.length > 0 || unknownSkills.length > 0) {
      errors.push(
        `${filePath}: unavailable capabilities: ${[
          ...unknownTools.map(value => `tool:${value}`),
          ...unknownSkills.map(value => `skill:${value}`),
        ].join(', ')}`,
      );
      continue;
    }

    const prompt = (match[2] ?? '').trim();
    if (!prompt) {
      errors.push(`${filePath}: prompt body must not be empty`);
      continue;
    }

    if (definitions.has(expectedName)) {
      errors.push(`${filePath}: duplicate definition for "${expectedName}"`);
      continue;
    }

    definitions.set(expectedName, {
      name: expectedName,
      tools: [...parsed.data.tools],
      skills: [...parsed.data.skills],
      prompt,
      filePath,
    });
  }

  for (const name of BUNDLED_SUBAGENT_NAMES) {
    if (!fileNames.includes(`${name}.md`)) errors.push(`${path.join(options.directory, `${name}.md`)}: definition is missing`);
  }

  return { definitions, errors };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
