import type { BundledSubagentName, SubagentDefinition } from '../agents/subagent-definition.ts';
import { MAX_SPAWN_TASKS } from '../tools/spawn/spawn.schema.ts';
import { MEGAMIND_ROLE, MEGAMIND_SECTIONS_AFTER_ROSTER } from './orchestrator-prompts/megamind.ts';

/**
 * Leading section of the assembled Megamind prompt, and the eligibility gate: Megamind
 * stays ineligible while this is empty, which lets tests drive assembly with a fixture
 * introduction and lets an operator disable the persona by emptying one constant.
 */
export const MEGAMIND_PROMPT_INTRO = MEGAMIND_ROLE;

export interface MegamindPromptInput {
  intro: string;
  roster: Map<BundledSubagentName, SubagentDefinition>;
  /** Configured concurrency pool size; the batch width the roster section advises. */
  maxConcurrency: number;
  /** Sections appended after the generated roster. Overridable so tests can assert assembly alone. */
  sectionsAfterRoster?: readonly string[];
}

/**
 * Assemble the parent Megamind prompt at runtime from the live roster.
 *
 * Renders each enabled subagent's parent-facing `metadata` lines, never its `prompt`
 * body: a child prompt is written in the second person and would tell the orchestrator it
 * is the child. Returns an empty string while the introduction is unapproved so callers
 * treat Megamind as ineligible.
 */
export function buildMegamindPrompt(input: MegamindPromptInput): string {
  const intro = input.intro.trim();
  if (!intro) return '';

  const after = input.sectionsAfterRoster ?? MEGAMIND_SECTIONS_AFTER_ROSTER;
  return [intro, buildAgentsSection(input.roster, input.maxConcurrency), ...after].join('\n\n');
}

/**
 * The `<Agents>` block reflects only enabled subagents, so a disabled lane is never
 * advertised to the parent and cannot be named in a `spawn` call the schema would reject.
 */
function buildAgentsSection(roster: Map<BundledSubagentName, SubagentDefinition>, maxConcurrency: number): string {
  const entries = [...roster.values()].map(renderAgent);
  return ['<Agents>', '', describeBatchWidth(roster.size, maxConcurrency), '', ...entries, '</Agents>'].join('\n');
}

/**
 * Queueing is work-conserving, so the pool size is stated as mechanism rather than as a
 * batch target: a queued task starts the moment any slot frees, whereas a model that
 * splits a batch to "avoid" queueing imposes a barrier and idles the pool until the
 * slowest task of the first call settles.
 */
function describeBatchWidth(rosterSize: number, maxConcurrency: number): string {
  const pool = Math.max(1, Math.min(Math.floor(maxConcurrency) || 1, MAX_SPAWN_TASKS));
  const lines = [
    `${rosterSize} specialist ${rosterSize === 1 ? 'lane is' : 'lanes are'} enabled.`,
    `A single call accepts up to ${MAX_SPAWN_TASKS} tasks and runs ${pool} of them at a time.`,
    'Extra tasks queue and start automatically as soon as any slot frees, so put all independent work in one call.',
    'Do not split a batch to stay under the pool size: a second call cannot begin until every task in the first has settled, which leaves slots idle.',
  ];
  return lines.join('\n');
}

/**
 * `metadata` lines are authored prose and rendered verbatim; the `Tools:` line is emitted
 * separately because it is derived from the granted tool list rather than authored, so it
 * cannot drift from what the child can actually run.
 */
function renderAgent(definition: SubagentDefinition): string {
  const lines = [`@${definition.name}`, `- Tools: ${definition.tools.join(', ')}`, ...definition.metadata.map(line => `- ${line}`)];
  return `${lines.join('\n')}\n`;
}
