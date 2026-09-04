import { Type } from 'typebox';
import { BUNDLED_SUBAGENT_NAMES, type BundledSubagentName } from '../../agents/subagent-definition.ts';

/**
 * Upper bound on tasks in one call.
 *
 * Bounds both the rendered height of the tool row and the details written to the parent
 * session; tasks beyond the concurrency pool only queue anyway.
 */
export const MAX_SPAWN_TASKS = 20;

const optionalName = { name: Type.Optional(Type.String({ minLength: 1, description: 'Short label shown in the parent UI for this task.' })) };

const createTask = Type.Object(
  {
    action: Type.Literal('create'),
    agent: Type.Union(
      BUNDLED_SUBAGENT_NAMES.map(name => Type.Literal(name)),
      { description: 'Subagent that runs this task.' },
    ),
    task: Type.String({ minLength: 1, description: 'Task-specific instructions for this child.' }),
    ...optionalName,
  },
  { additionalProperties: false },
);

const continueTask = Type.Object(
  {
    action: Type.Literal('continue'),
    childSessionId: Type.String({ minLength: 1, description: 'Durable child session ID returned by an earlier spawn call.' }),
    task: Type.String({ minLength: 1, description: 'Task-specific instructions for this child.' }),
    ...optionalName,
  },
  { additionalProperties: false },
);

export const spawnParameters = Type.Object(
  {
    context: Type.String({ minLength: 1, description: 'Shared context passed to every task in this call.' }),
    tasks: Type.Array(Type.Union([createTask, continueTask]), {
      minItems: 1,
      maxItems: MAX_SPAWN_TASKS,
      description: `Ordered tasks executed as one blocking batch (at most ${MAX_SPAWN_TASKS}).`,
    }),
  },
  { additionalProperties: false },
);

export type SpawnCreateTask = { action: 'create'; agent: BundledSubagentName; task: string; name?: string };
export type SpawnContinueTask = { action: 'continue'; childSessionId: string; task: string; name?: string };
export type SpawnTask = SpawnCreateTask | SpawnContinueTask;

export interface SpawnInput {
  context: string;
  tasks: SpawnTask[];
}

export interface SpawnValidationOptions {
  availableAgents: Iterable<string>;
}

/** Every rejection happens before any child is dispatched, so a bad call has no side effects. */
export function validateSpawnInput(input: unknown, options: SpawnValidationOptions): SpawnInput {
  const failures: string[] = [];
  if (!isRecord(input)) throw validationError(['Spawn input must be an object.']);
  if (typeof input.context !== 'string' || !input.context.trim()) failures.push('Shared context must be non-empty.');
  if (!Array.isArray(input.tasks) || input.tasks.length === 0) {
    failures.push('Task array must be non-empty.');
    throw validationError(failures);
  }
  if (input.tasks.length > MAX_SPAWN_TASKS) {
    failures.push(`Task array holds ${input.tasks.length} tasks; at most ${MAX_SPAWN_TASKS} are allowed in one call.`);
    throw validationError(failures);
  }

  const availableAgents = new Set(options.availableAgents);
  const continueIds = new Set<string>();
  const tasks: SpawnTask[] = [];

  for (const [index, task] of input.tasks.entries()) {
    if (!isRecord(task)) {
      failures.push(`Task ${index + 1} must be an object.`);
      continue;
    }
    const name = extractOptionalName(task, index, failures);
    if (task.action === 'create') {
      if (typeof task.agent !== 'string' || typeof task.task !== 'string' || !task.task.trim()) {
        failures.push(`Create task ${index + 1} requires agent and non-empty task.`);
        continue;
      }
      if (!availableAgents.has(task.agent)) {
        failures.push(`Create task ${index + 1} targets unavailable agent "${task.agent}".`);
        continue;
      }
      rejectUnknownFields(task, 'create', ['action', 'agent', 'task', 'name'], index, failures);
      tasks.push({ action: 'create', agent: task.agent as BundledSubagentName, task: task.task, name });
      continue;
    }
    if (task.action === 'continue') {
      if (typeof task.childSessionId !== 'string' || typeof task.task !== 'string' || !task.task.trim()) {
        failures.push(`Continue task ${index + 1} requires childSessionId and non-empty task.`);
        continue;
      }
      if (continueIds.has(task.childSessionId)) {
        failures.push(`Continue task ${index + 1} duplicates child "${task.childSessionId}".`);
        continue;
      }
      continueIds.add(task.childSessionId);
      rejectUnknownFields(task, 'continue', ['action', 'childSessionId', 'task', 'name'], index, failures);
      tasks.push({ action: 'continue', childSessionId: task.childSessionId, task: task.task, name });
      continue;
    }
    failures.push(`Task ${index + 1} must use action "create" or "continue".`);
  }

  if (failures.length > 0) throw validationError(failures);
  return { context: String(input.context), tasks };
}

/** Shared context plus task-specific text form the prompt every child interaction receives. */
export function buildChildPrompt(context: string, task: SpawnTask): string {
  return `${context.trim()}\n\n${task.task.trim()}`;
}

export function describeTask(task: SpawnTask, index: number): string {
  if (task.name) return task.name;
  return task.action === 'create' ? `${task.agent} task ${index + 1}` : `continue ${task.childSessionId}`;
}

function rejectUnknownFields(task: Record<string, unknown>, action: string, allowed: string[], index: number, failures: string[]): void {
  const unknown = Object.keys(task).filter(key => !allowed.includes(key));
  if (unknown.length > 0) failures.push(`${action} task ${index + 1} contains unknown fields: ${unknown.join(', ')}.`);
}

function extractOptionalName(task: Record<string, unknown>, index: number, failures: string[]): string | undefined {
  if (task.name === undefined) return undefined;
  if (typeof task.name === 'string' && task.name.trim()) return task.name;
  failures.push(`Task ${index + 1} name must be a non-empty string when supplied.`);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validationError(failures: string[]): Error {
  return new Error(`Spawn rejected before dispatch: ${failures.join(' ')}`);
}
