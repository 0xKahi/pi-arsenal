import type { Api, Model } from '@earendil-works/pi-ai';
import { createAgentSession, DefaultResourceLoader, getAgentDir, type SessionManager } from '@earendil-works/pi-coding-agent';
import type { SubagentDefinition } from '../agents/subagent-definition.ts';
import { createChildResourcePolicy } from '../runtime/child-resource-policy.ts';

type CreateSessionOptions = NonNullable<Parameters<typeof createAgentSession>[0]>;

/** `ThinkingLevel` is not exported from the SDK root, so it is derived from the session factory. */
export type ChildThinkingLevel = NonNullable<CreateSessionOptions['thinkingLevel']>;

export interface CreateChildRuntimeInput {
  cwd: string;
  definition: SubagentDefinition;
  sessionManager: SessionManager;
  model: Model<Api>;
  thinkingLevel: ChildThinkingLevel;
}

export interface ChildRuntimeFactories {
  agentDir?: string;
  createResourceLoader?: (options: ConstructorParameters<typeof DefaultResourceLoader>[0]) => DefaultResourceLoader;
  createSession?: typeof createAgentSession;
}

export async function createChildRuntime(input: CreateChildRuntimeInput, factories: ChildRuntimeFactories = {}) {
  const agentDir = factories.agentDir ?? getAgentDir();
  const resourceLoader = (factories.createResourceLoader ?? (options => new DefaultResourceLoader(options)))({
    cwd: input.cwd,
    agentDir,
    ...createChildResourcePolicy(input.definition),
  });
  await resourceLoader.reload();

  const result = await (factories.createSession ?? createAgentSession)({
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
