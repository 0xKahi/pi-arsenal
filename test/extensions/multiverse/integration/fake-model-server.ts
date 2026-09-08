import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Api, Model } from '@earendil-works/pi-ai';

/**
 * A scripted OpenAI-compatible completions endpoint.
 *
 * Integration coverage needs a *real* `AgentSession` driving a real streaming
 * request, but it must stay offline and deterministic. Serving the
 * `openai-completions` SSE shape from localhost gives both: the SDK's model
 * runtime, streaming parser, tool loop, and session persistence all run
 * unmodified, while the response content is whatever the test queued.
 */

export interface ScriptedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ScriptedTurn {
  /** Assistant text for this turn. */
  text?: string;
  /** Tool calls the assistant should request instead of finishing. */
  toolCalls?: ScriptedToolCall[];
  /** Milliseconds to hold the stream open before finishing, for abort tests. */
  delayMs?: number;
}

export interface RecordedRequest {
  model: string;
  system: string;
  toolNames: string[];
  messages: Array<{ role: string; content: unknown }>;
}

export interface FakeModelServer {
  model: Model<Api>;
  agentDir: string;
  /** Queue one assistant turn. Turns are consumed in order, one per upstream request. */
  script(...turns: ScriptedTurn[]): void;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

const PROVIDER = 'groq';
const MODEL_ID = 'arsenal-test-model';

export async function startFakeModelServer(): Promise<FakeModelServer> {
  const turns: ScriptedTurn[] = [];
  const requests: RecordedRequest[] = [];

  const server = Bun.serve({
    port: 0,
    idleTimeout: 30,
    fetch: async request => {
      const body = (await request.json()) as {
        model?: string;
        messages?: Array<{ role: string; content: unknown }>;
        tools?: Array<{ function?: { name?: string } }>;
      };
      const messages = body.messages ?? [];
      requests.push({
        model: body.model ?? '',
        system: messages
          .filter(message => message.role === 'system')
          .map(message => (typeof message.content === 'string' ? message.content : JSON.stringify(message.content)))
          .join('\n'),
        toolNames: (body.tools ?? []).map(tool => tool.function?.name ?? '').filter(Boolean),
        messages,
      });

      const turn = turns.shift() ?? { text: 'ok' };
      return new Response(streamTurn(turn), {
        headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' },
      });
    },
  });

  const baseUrl = `http://127.0.0.1:${server.port}/v1`;
  const agentDir = mkdtempSync(path.join(tmpdir(), 'arsenal-agentdir-'));
  // The SDK resolves credentials from `<agentDir>/auth.json`; a static key keeps the
  // request path identical to production without touching the user's real auth file.
  writeFileSync(path.join(agentDir, 'auth.json'), JSON.stringify({ [PROVIDER]: { type: 'api_key', key: 'test-key' } }), { mode: 0o600 });

  return {
    agentDir,
    model: {
      id: MODEL_ID,
      name: MODEL_ID,
      api: 'openai-completions',
      provider: PROVIDER,
      baseUrl,
      reasoning: false,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128_000,
      maxTokens: 4096,
    } as Model<Api>,
    script: (...next) => turns.push(...next),
    requests,
    close: async () => {
      await server.stop(true);
    },
  };
}

function streamTurn(turn: ScriptedTurn): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, payload: unknown) =>
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

  return new ReadableStream({
    async start(controller) {
      const chunk = (delta: Record<string, unknown>, finishReason: string | null = null) => ({
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 0,
        model: MODEL_ID,
        choices: [{ index: 0, delta, finish_reason: finishReason }],
      });

      send(controller, chunk({ role: 'assistant', content: '' }));
      if (turn.delayMs) await Bun.sleep(turn.delayMs);
      if (turn.text) send(controller, chunk({ content: turn.text }));

      if (turn.toolCalls?.length) {
        turn.toolCalls.forEach((call, index) => {
          send(
            controller,
            chunk({
              tool_calls: [
                {
                  index,
                  id: `call_${index}`,
                  type: 'function',
                  function: { name: call.name, arguments: JSON.stringify(call.arguments) },
                },
              ],
            }),
          );
        });
        send(controller, chunk({}, 'tool_calls'));
      } else {
        send(controller, chunk({}, 'stop'));
      }

      send(controller, {
        id: 'chatcmpl-test',
        object: 'chat.completion.chunk',
        created: 0,
        model: MODEL_ID,
        choices: [],
        usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
      });
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });
}
