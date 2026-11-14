import type { AssistantMessage, Usage } from '@earendil-works/pi-ai';
import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import type { ChildInteraction } from '../../../../src/extensions/multiverse/results/child-interaction.ts';
import { childInteraction } from '../interaction-fixture.ts';

export const timestamp = '2026-06-01T12:00:00.000Z';
export function usage(input = 10, output = 5, cacheRead = 20, cacheWrite = 5): Usage {
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    totalTokens: input + output + cacheRead + cacheWrite,
    cost: { input: 0.1, output: 0.2, cacheRead: 0.3, cacheWrite: 0.4, total: 1 },
  };
}
export function assistant(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: 'assistant',
    api: 'anthropic-messages',
    provider: 'anthropic',
    model: 'model',
    content: [{ type: 'text', text: 'reply' }],
    usage: usage(),
    stopReason: 'stop',
    timestamp: 0,
    ...overrides,
  };
}
export function entry(id: string, parentId: string | null, fields: Record<string, unknown> = {}): SessionEntry {
  return { type: 'message', id, parentId, timestamp, message: { role: 'user', content: id, timestamp: 0 }, ...fields } as SessionEntry;
}
export function spawn(interactions: Partial<ChildInteraction>[]): SessionEntry {
  return entry('spawn', null, {
    message: {
      role: 'toolResult',
      toolCallId: 'call',
      toolName: 'spawn',
      content: [],
      isError: false,
      timestamp: 0,
      details: { kind: 'spawn', version: 1, interactions: interactions.map(i => childInteraction(i)) },
    },
  });
}
export function transcriptFixture(): SessionEntry[] {
  return [
    entry('identity', null, { type: 'custom', customType: 'multiverse.subagent-identity', data: {} }),
    entry('prompt1', 'identity', {
      message: {
        role: 'user',
        content: [
          { type: 'text', text: 'first prompt' },
          { type: 'image', data: '', mimeType: 'image/png' },
        ],
        timestamp: 0,
      },
    }),
    entry('reply1', 'prompt1', {
      message: assistant({
        content: [
          { type: 'thinking', thinking: 'consider' },
          { type: 'text', text: 'before' },
          { type: 'toolCall', id: 'call', name: 'read', arguments: { path: 'file' } },
          { type: 'text', text: 'after' },
        ],
      }),
    }),
    entry('result', 'reply1', {
      message: {
        role: 'toolResult',
        toolCallId: 'call',
        toolName: 'read',
        content: [{ type: 'text', text: 'not found' }],
        isError: true,
        timestamp: 0,
        usage: usage(),
      },
    }),
    entry('compact', 'result', { type: 'compaction', summary: 'compacted', firstKeptEntryId: 'result', tokensBefore: 100, usage: usage() }),
    entry('prompt2', 'compact'),
    entry('reply2', 'prompt2', { message: assistant() }),
    entry('branch', 'reply2', { type: 'branch_summary', fromId: 'reply1', summary: 'branch summary', usage: usage() }),
  ];
}
