import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { ColorHexSchema } from '../../../schemas/shared-config.schema';

export interface SubagentDefinition {
  name: string;
  tools: string[];
  skills: string[];
  /** Parent-facing routing guidance, never the child's second-person prompt. */
  metadata: string[];
  color?: string;
  prompt: string;
  filePath: string;
}

export type ParsedSubagentResult =
  | { status: 'error'; error: string; filePath: string }
  | { status: 'success'; data: SubagentDefinition; filePath: string };

const FrontmatterSchema = z.strictObject({
  name: z.string().trim().min(1),
  tools: z.array(z.string().trim().min(1)),
  skills: z.array(z.string().trim().min(1)),
  metadata: z.array(z.string().min(1)).min(1),
  color: ColorHexSchema.optional(),
});

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/;

/** Load one definition; registration and runtime availability are the caller's concern. */
export function loadSubagentDefinition(filePath: string): ParsedSubagentResult {
  try {
    const source = readFileSync(filePath, 'utf8');
    const match = FRONTMATTER_PATTERN.exec(source);
    if (!match) throw new Error('Expected YAML frontmatter delimited by ---.');

    const frontmatter = FrontmatterSchema.parse(parse(match[1] ?? ''));
    const prompt = (match[2] ?? '').trim();
    if (!prompt) throw new Error('Prompt body must not be empty.');

    return {
      status: 'success',
      filePath,
      data: {
        ...frontmatter,
        tools: [...new Set(frontmatter.tools)],
        skills: [...new Set(frontmatter.skills)],
        prompt,
        filePath,
      },
    };
  } catch (error) {
    return { status: 'error', error: `${filePath}: ${error instanceof Error ? error.message : String(error)}`, filePath };
  }
}
