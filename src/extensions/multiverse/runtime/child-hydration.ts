import type { AgentSessionEvent, SessionManager } from '@earendil-works/pi-coding-agent';
import type { ChildInteractionStatus, ChildTelemetry } from '../results/child-interaction.types.ts';
import { TouchLedger } from '../results/touch-ledger.ts';
import { type ChildRuntimeFactories, type CreateChildRuntimeInput, createChildRuntime } from './child-runtime.ts';

export interface ChildInteractionOutcome {
  status: ChildInteractionStatus;
  text: string;
  error?: string;
  checkpointBefore: string | null;
  checkpointAfter: string | null;
  observedPaths: string[];
  telemetry: ChildTelemetry;
}

export type HydrateChildInput = CreateChildRuntimeInput & {
  prompt: string;
  /** Branch point inside the child session. `null` resets to the root, `undefined` keeps the current leaf. */
  checkpoint?: string | null;
  signal?: AbortSignal;
  onEvent?: (event: AgentSessionEvent) => void;
};

/**
 * Run exactly one interaction against a durable child session.
 *
 * The checkpoint is selected *before* the AgentSession is constructed so the runtime is
 * built against the intended leaf. The runtime is always disposed, and failure and abort
 * are reported as terminal states rather than being flattened into empty success.
 */
export async function hydrateChildInteraction(input: HydrateChildInput, factories: ChildRuntimeFactories = {}): Promise<ChildInteractionOutcome> {
  // Select the branch first: the AgentSession snapshots the leaf when it is created.
  selectCheckpoint(input.sessionManager, input.checkpoint);
  const checkpointBefore = input.sessionManager.getLeafId();

  const ledger = new TouchLedger();
  const started = Date.now();
  const runtime = await createChildRuntime(
    {
      cwd: input.cwd,
      definition: input.definition,
      sessionManager: input.sessionManager,
      model: input.model,
      thinkingLevel: input.thinkingLevel,
    },
    factories,
  );

  const events: AgentSessionEvent[] = [];
  let unsubscribe: (() => void) | undefined;
  let onAbort: (() => void) | undefined;
  let status: ChildInteractionStatus = 'success';
  let error: string | undefined;

  try {
    unsubscribe = runtime.session.subscribe(event => {
      events.push(event);
      ledger.observe(event);
      input.onEvent?.(event);
    });

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

  const text = lastAssistantText(events);
  if (status === 'success' && text === '' && !hasAgentEnd(events)) {
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
    observedPaths: ledger.list(),
    telemetry: { ...collectTelemetry(runtime.session, started), model: `${input.model.provider}/${input.model.id}` },
  };
}

function selectCheckpoint(sessionManager: SessionManager, checkpoint: string | null | undefined): void {
  if (checkpoint === undefined) return;
  if (checkpoint === null) {
    sessionManager.resetLeaf();
    return;
  }
  if (!sessionManager.getEntry(checkpoint)) throw new Error(`Child checkpoint "${checkpoint}" does not exist in this session.`);
  sessionManager.branch(checkpoint);
}

function hasAgentEnd(events: readonly AgentSessionEvent[]): boolean {
  return events.some(event => event.type === 'agent_end');
}

function lastAssistantText(events: readonly AgentSessionEvent[]): string {
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

function collectTelemetry(session: { getSessionStats: () => unknown }, startedAt: number): ChildTelemetry {
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

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
