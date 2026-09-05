import { describe, expect, it } from 'bun:test';
import type { Api, Model } from '@earendil-works/pi-ai';
import { type createAgentSession, type DefaultResourceLoader, SessionManager } from '@earendil-works/pi-coding-agent';
import type { SubagentDefinition } from '../../../../src/extensions/multiverse/agents/subagent-definition.ts';
import { createChildRuntime } from '../../../../src/extensions/multiverse/runtime/child-runtime.ts';

const definition: SubagentDefinition = {
  name: 'fixer',
  tools: ['read', 'edit'],
  skills: [],
  metadata: ['Lane: test lane'],
  prompt: 'fixer prompt',
  filePath: '/tmp/fixer.md',
};

const providerModel = { provider: 'extension-provider', id: 'extension-model', reasoning: true } as Model<Api>;

describe('createChildRuntime', () => {
  it('creates and reloads a fresh resource loader and extension runtime per interaction', async () => {
    const events: string[] = [];
    const loaderOptions: Array<ConstructorParameters<typeof DefaultResourceLoader>[0]> = [];
    let loaderNumber = 0;
    const createResourceLoader = (options: ConstructorParameters<typeof DefaultResourceLoader>[0]) => {
      const number = ++loaderNumber;
      loaderOptions.push(options);
      return {
        reload: async () => {
          events.push(`reload-${number}`);
        },
      } as DefaultResourceLoader;
    };
    const seenOptions: Array<NonNullable<Parameters<typeof createAgentSession>[0]>> = [];
    const createSession = (async options => {
      seenOptions.push(options ?? {});
      events.push(`create-${seenOptions.length}`);
      return { session: { id: seenOptions.length }, extensionsResult: { token: seenOptions.length } } as unknown as Awaited<
        ReturnType<typeof createAgentSession>
      >;
    }) as typeof createAgentSession;

    const input = {
      cwd: '/tmp/project',
      definition,
      sessionManager: SessionManager.inMemory('/tmp/project'),
      model: providerModel,
      thinkingLevel: 'high' as const,
    };
    const first = await createChildRuntime(input, { agentDir: '/tmp/agent', createResourceLoader, createSession });
    const second = await createChildRuntime(input, { agentDir: '/tmp/agent', createResourceLoader, createSession });

    expect(first.resourceLoader).not.toBe(second.resourceLoader);
    expect(first.extensionsResult).not.toBe(second.extensionsResult);
    expect(events).toEqual(['reload-1', 'create-1', 'reload-2', 'create-2']);
    expect(seenOptions[0]).toMatchObject({
      cwd: '/tmp/project',
      agentDir: '/tmp/agent',
      sessionManager: input.sessionManager,
      model: providerModel,
      thinkingLevel: 'high',
      tools: ['read', 'edit'],
    });
    expect(seenOptions[0]?.resourceLoader).toBe(first.resourceLoader);
    expect(seenOptions[0]?.model).toBe(providerModel);
    expect(loaderOptions[0]?.noExtensions).not.toBe(true);
    expect(loaderOptions[0]?.systemPromptOverride?.('host')).toBe('fixer prompt');
    expect(loaderOptions[0]?.appendSystemPromptOverride?.(['ambient'])).toEqual([]);
  });
});
