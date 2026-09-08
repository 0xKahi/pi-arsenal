import type { Api, Model } from '@earendil-works/pi-ai';
import { clampThinkingLevel } from '@earendil-works/pi-ai/compat';
import {
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  type SessionManager,
  type Skill,
} from '@earendil-works/pi-coding-agent';
import type { ModelConfig, ReasoningLevel } from '../../../schemas/shared-config.schema.ts';
import { DebugLoggerUtil } from '../../../utils/debug-logger.util.ts';
import type { SubagentDefinition } from '../agents/subagent-definition.ts';
import { MULTIVERSE_DEBUG } from '../constants.ts';
import type { ChildInteractionStatus, ChildTelemetry } from '../results/child-interaction.ts';

type CreateSessionOptions = NonNullable<Parameters<typeof createAgentSession>[0]>;
type DefaultResourceLoaderOptions = ConstructorParameters<typeof DefaultResourceLoader>[0];

/** `ThinkingLevel` is not exported from the SDK root, so it is derived from the session factory. */
export type ChildThinkingLevel = NonNullable<CreateSessionOptions['thinkingLevel']>;

export type SubagentModelConfig = Partial<ModelConfig>;

type RequestAuth =
  | { ok: true; apiKey?: string; headers?: Record<string, string | null>; baseUrl?: string; env?: Record<string, string> }
  | { ok: false; error: string };

export type ModelResolutionResult =
  | { success: true; model: Model<Api>; auth: Extract<RequestAuth, { ok: true }>; failures: string[] }
  | { success: false; error: string; failures: string[] };

export interface ModelResolutionRegistry {
  find(provider: string, modelId: string): Model<Api> | undefined;
  getApiKeyAndHeaders(model: Model<Api>): Promise<RequestAuth>;
}

export interface ChildRuntimeFactories {
  agentDir?: string;
  createResourceLoader?: (options: DefaultResourceLoaderOptions) => DefaultResourceLoader;
  createSession?: typeof createAgentSession;
}

export interface ChildInteractionOutcome {
  status: ChildInteractionStatus;
  text: string;
  error?: string;
  checkpointBefore: string | null;
  checkpointAfter: string | null;
  telemetry: ChildTelemetry;
}

export interface RunChildInteractionInput {
  cwd: string;
  definition: SubagentDefinition;
  sessionManager: SessionManager;
  model: Model<Api>;
  thinkingLevel: ChildThinkingLevel;
  prompt: string;
  /** Branch point inside the child session. `null` resets to the root, `undefined` keeps the current leaf. */
  checkpoint?: string | null;
  signal?: AbortSignal;
  onEvent?: (event: AgentSessionEvent) => void;
}

/**
 * Decides which model a child runs on, builds its SDK runtime, and runs exactly one
 * interaction against a durable child session.
 *
 * Construction is private on purpose: a child runtime only exists for the duration of
 * one interaction, so callers ask for the interaction rather than for the runtime.
 * SDK factories are injected once through the constructor so tests have a single seam.
 */
export class ChildRuntime {
  private readonly factories: ChildRuntimeFactories;

  constructor(factories: ChildRuntimeFactories = {}) {
    this.factories = factories;
  }

  // --- model and reasoning selection ------------------------------------

  static async resolveModel(input: {
    configured?: SubagentModelConfig;
    parentModel?: Model<Api>;
    registry: ModelResolutionRegistry;
  }): Promise<ModelResolutionResult> {
    const failures: string[] = [];
    const candidates: Model<Api>[] = [];
    const configured = input.configured;

    if (configured && (configured.provider || configured.modelId)) {
      const provider = configured.provider ?? input.parentModel?.provider;
      const modelId = configured.modelId ?? input.parentModel?.id;
      if (!provider || !modelId) {
        failures.push('Configured subagent model is incomplete and cannot inherit missing fields because no parent model is selected.');
      } else {
        const model = input.registry.find(provider, modelId);
        if (model) candidates.push(model);
        else failures.push(`Configured model ${provider}/${modelId} was not found.`);
      }
    }

    if (input.parentModel && !candidates.some(model => model.provider === input.parentModel?.provider && model.id === input.parentModel?.id)) {
      candidates.push(input.parentModel);
    } else if (!input.parentModel && candidates.length === 0) {
      failures.push('No parent model is selected for fallback.');
    }

    for (const model of candidates) {
      let auth: RequestAuth;
      try {
        auth = await input.registry.getApiKeyAndHeaders(model);
      } catch (error) {
        failures.push(`${model.provider}/${model.id} authentication lookup failed: ${formatError(error)}`);
        continue;
      }
      if (auth.ok) return { success: true, model, auth, failures };
      failures.push(`${model.provider}/${model.id} authentication failed: ${auth.error}`);
    }

    return { success: false, error: `No usable model candidate. ${failures.join(' ')}`, failures };
  }

  static resolveReasoning(model: Model<Api>, requested: ReasoningLevel | undefined, parentReasoning: ReasoningLevel | undefined): ReasoningLevel {
    return clampThinkingLevel(model, requested ?? parentReasoning ?? 'medium');
  }

  // --- one interaction --------------------------------------------------

  /**
   * The checkpoint is selected *before* the AgentSession is constructed so the runtime is
   * built against the intended leaf. The runtime is always disposed, and failure and abort
   * are reported as terminal states rather than being flattened into empty success.
   */
  async run(input: RunChildInteractionInput): Promise<ChildInteractionOutcome> {
    // Select the branch first: the AgentSession snapshots the leaf when it is created.
    ChildRuntime.selectCheckpoint(input.sessionManager, input.checkpoint);
    const checkpointBefore = input.sessionManager.getLeafId();

    const started = Date.now();
    const runtime = await this.create(input);

    const events: AgentSessionEvent[] = [];
    let unsubscribe: (() => void) | undefined;
    let onAbort: (() => void) | undefined;
    let status: ChildInteractionStatus = 'success';
    let error: string | undefined;

    try {
      unsubscribe = runtime.session.subscribe(event => {
        events.push(event);
        input.onEvent?.(event);
      });

      if (MULTIVERSE_DEBUG) {
        DebugLoggerUtil.logToMarkdown('subAgent', {
          header: 'System Prompt',
          contents: [runtime.session.agent.state.systemPrompt],
        });
      }

      if (input.signal?.aborted) {
        status = 'aborted';
      } else {
        onAbort = () => void runtime.session.abort();
        input.signal?.addEventListener('abort', onAbort, { once: true });
        await runtime.session.prompt(input.prompt);
        if (input.signal?.aborted) status = 'aborted';
      }
    } catch (caught) {
      status = input.signal?.aborted ? 'aborted' : 'failure';
      error = formatError(caught);
    } finally {
      if (onAbort) input.signal?.removeEventListener('abort', onAbort);
      unsubscribe?.();
      runtime.session.dispose();
    }

    const text = ChildRuntime.lastAssistantText(events);
    if (status === 'success' && text === '' && !ChildRuntime.hasAgentEnd(events)) {
      status = 'failure';
      error ??= 'The child produced no assistant response.';
    }

    return {
      status,
      text,
      error,
      checkpointBefore,
      // The newest persisted entry is the checkpoint; it falls back to the start point when nothing was written.
      checkpointAfter: input.sessionManager.getLeafId() ?? checkpointBefore,
      telemetry: { ...ChildRuntime.collectTelemetry(runtime.session, started), model: `${input.model.provider}/${input.model.id}` },
    };
  }

  // --- construction -----------------------------------------------------

  private async create(input: RunChildInteractionInput) {
    const agentDir = this.factories.agentDir ?? getAgentDir();
    const resourceLoader = (this.factories.createResourceLoader ?? (options => new DefaultResourceLoader(options)))({
      cwd: input.cwd,
      agentDir,
      ...ChildRuntime.resourcePolicy(input.definition),
    });
    await resourceLoader.reload();

    const result = await (this.factories.createSession ?? createAgentSession)({
      cwd: input.cwd,
      agentDir,
      resourceLoader,
      sessionManager: input.sessionManager,
      model: input.model,
      thinkingLevel: input.thinkingLevel,
      tools: input.definition.tools,
    });

    return { ...result, resourceLoader };
  }

  /** Resource overrides shared by every hydrated SDK child runtime. */
  private static resourcePolicy(
    definition: SubagentDefinition,
  ): Pick<DefaultResourceLoaderOptions, 'skillsOverride' | 'systemPromptOverride' | 'appendSystemPromptOverride' | 'noContextFiles'> {
    return {
      noContextFiles: true,
      systemPromptOverride: () => definition.prompt,
      appendSystemPromptOverride: () => [],
      skillsOverride: base => ({
        skills: ChildRuntime.filterSkills(base.skills, definition.skills),
        diagnostics: base.diagnostics,
      }),
    };
  }

  private static filterSkills(skills: readonly Skill[], allowedNames: readonly string[]): Skill[] {
    const allowed = new Set(allowedNames);
    return skills.filter(skill => allowed.has(skill.name));
  }

  // --- session helpers --------------------------------------------------

  private static selectCheckpoint(sessionManager: SessionManager, checkpoint: string | null | undefined): void {
    if (checkpoint === undefined) return;
    if (checkpoint === null) {
      sessionManager.resetLeaf();
      return;
    }
    if (!sessionManager.getEntry(checkpoint)) throw new Error(`Child checkpoint "${checkpoint}" does not exist in this session.`);
    sessionManager.branch(checkpoint);
  }

  private static hasAgentEnd(events: readonly AgentSessionEvent[]): boolean {
    return events.some(event => event.type === 'agent_end');
  }

  private static lastAssistantText(events: readonly AgentSessionEvent[]): string {
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (event?.type !== 'agent_end') continue;
      const assistant = [...event.messages].reverse().find(message => message.role === 'assistant');
      const content = assistant?.content;
      if (!Array.isArray(content)) continue;
      return content
        .filter((item): item is Extract<typeof item, { type: 'text' }> => item.type === 'text')
        .map(item => item.text)
        .join('\n');
    }
    return '';
  }

  private static collectTelemetry(session: { getSessionStats: () => unknown }, startedAt: number): ChildTelemetry {
    const durationMs = Date.now() - startedAt;
    try {
      const stats = session.getSessionStats() as
        | { tokens?: { input?: number; output?: number }; cost?: number; assistantMessages?: number }
        | undefined;
      return {
        durationMs,
        requests: stats?.assistantMessages ?? 0,
        tokensInput: stats?.tokens?.input ?? 0,
        tokensOutput: stats?.tokens?.output ?? 0,
        cost: stats?.cost ?? 0,
      };
    } catch {
      return { durationMs, requests: 0, tokensInput: 0, tokensOutput: 0, cost: 0 };
    }
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
