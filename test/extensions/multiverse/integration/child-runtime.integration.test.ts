import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { SubagentDefinition } from '../../../../src/extensions/multiverse/agents/subagent-definition.ts';
import { ChildRuntime } from '../../../../src/extensions/multiverse/runtime/child-runtime.ts';
import { ChildSessionRepository } from '../../../../src/extensions/multiverse/runtime/child-session-repository.ts';
import { type FakeModelServer, startFakeModelServer } from './fake-model-server.ts';

const definition: SubagentDefinition = {
  name: 'explorer',
  tools: ['read'],
  skills: [],
  metadata: ['Lane: integration'],
  prompt: 'You are the explorer child.',
  filePath: '/tmp/explorer.md',
};

describe('ChildRuntime against a real AgentSession', () => {
  let server: FakeModelServer;
  let root: string;
  let cwd: string;

  beforeAll(async () => {
    server = await startFakeModelServer();
    root = mkdtempSync(path.join(tmpdir(), 'arsenal-children-'));
    cwd = mkdtempSync(path.join(tmpdir(), 'arsenal-cwd-'));
  });

  afterAll(async () => {
    await server.close();
    rmSync(root, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
    rmSync(server.agentDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    server.requests.length = 0;
  });

  const runtime = () => new ChildRuntime({ agentDir: server.agentDir });
  const repository = () => new ChildSessionRepository({ root });

  it('creates a child, runs one interaction, and persists it after disposal', async () => {
    server.script({ text: 'explored the repository' });
    const handle = repository().create(cwd, 'parent-a', 'explorer');

    const outcome = await runtime().run({
      cwd,
      definition,
      sessionManager: handle.sessionManager,
      model: server.model,
      thinkingLevel: 'off',
      prompt: 'look around',
      checkpoint: null,
    });

    expect(outcome.status).toBe('success');
    expect(outcome.text).toBe('explored the repository');
    expect(outcome.checkpointAfter).not.toBeNull();

    // The child prompt fully replaces the host system prompt.
    const request = server.requests.at(-1);
    expect(request?.system).toContain('You are the explorer child.');

    // Only the definition's tools reach the model.
    expect(request?.toolNames).toEqual(['read']);

    // Reopening from disk after the runtime is gone must recover the transcript.
    const reopened = repository().open(cwd, 'parent-a', handle.sessionId);
    expect(reopened.sessionManager.getEntry(outcome.checkpointAfter as string)).toBeDefined();
  });

  it('continues a child from its checkpoint in a later runtime', async () => {
    server.script({ text: 'first answer' }, { text: 'second answer' });
    const handle = repository().create(cwd, 'parent-b', 'explorer');

    const first = await runtime().run({
      cwd,
      definition,
      sessionManager: handle.sessionManager,
      model: server.model,
      thinkingLevel: 'off',
      prompt: 'first',
      checkpoint: null,
    });

    const reopened = repository().open(cwd, 'parent-b', handle.sessionId);
    const second = await runtime().run({
      cwd,
      definition,
      sessionManager: reopened.sessionManager,
      model: server.model,
      thinkingLevel: 'off',
      prompt: 'second',
      checkpoint: first.checkpointAfter,
    });

    expect(second.status).toBe('success');
    expect(second.text).toBe('second answer');
    // Continuation carries prior context: the earlier turn is replayed upstream.
    const replayed = JSON.stringify(server.requests.at(-1)?.messages);
    expect(replayed).toContain('first');
    expect(replayed).toContain('first answer');
  });

  it('keeps branches from one checkpoint independent', async () => {
    server.script({ text: 'root answer' }, { text: 'branch A answer' }, { text: 'branch B answer' });
    const handle = repository().create(cwd, 'parent-c', 'explorer');

    const base = await runtime().run({
      cwd,
      definition,
      sessionManager: handle.sessionManager,
      model: server.model,
      thinkingLevel: 'off',
      prompt: 'root question',
      checkpoint: null,
    });

    const branchA = await runtime().run({
      cwd,
      definition,
      sessionManager: repository().open(cwd, 'parent-c', handle.sessionId).sessionManager,
      model: server.model,
      thinkingLevel: 'off',
      prompt: 'branch A question',
      checkpoint: base.checkpointAfter,
    });

    const branchB = await runtime().run({
      cwd,
      definition,
      sessionManager: repository().open(cwd, 'parent-c', handle.sessionId).sessionManager,
      model: server.model,
      thinkingLevel: 'off',
      prompt: 'branch B question',
      // Same starting point as branch A: the two must not see each other.
      checkpoint: base.checkpointAfter,
    });

    expect(branchA.checkpointAfter).not.toBe(branchB.checkpointAfter);
    const contextB = JSON.stringify(server.requests.at(-1)?.messages);
    expect(contextB).toContain('root question');
    expect(contextB).not.toContain('branch A question');
  });

  it('executes a declared tool inside the child and feeds the result back', async () => {
    const target = path.join(cwd, 'note.txt');
    writeFileSync(target, 'file contents from disk');
    server.script({ toolCalls: [{ name: 'read', arguments: { path: target } }] }, { text: 'I read the note.' });

    const handle = repository().create(cwd, 'parent-d', 'explorer');
    const outcome = await runtime().run({
      cwd,
      definition,
      sessionManager: handle.sessionManager,
      model: server.model,
      thinkingLevel: 'off',
      prompt: 'read the note',
      checkpoint: null,
    });

    expect(outcome.status).toBe('success');
    expect(outcome.text).toBe('I read the note.');
    // The real tool ran: its output came back to the model on the follow-up request.
    expect(JSON.stringify(server.requests.at(-1)?.messages)).toContain('file contents from disk');
  });

  it('reports abort as a terminal state and preserves work up to the interruption', async () => {
    server.script({ text: 'never delivered', delayMs: 2_000 });
    const handle = repository().create(cwd, 'parent-e', 'explorer');
    const controller = new AbortController();

    const running = runtime().run({
      cwd,
      definition,
      sessionManager: handle.sessionManager,
      model: server.model,
      thinkingLevel: 'off',
      prompt: 'take your time',
      checkpoint: null,
      signal: controller.signal,
    });
    await Bun.sleep(150);
    controller.abort();

    const outcome = await running;
    expect(outcome.status).toBe('aborted');
    // An aborted interaction still reports a checkpoint so it can be continued.
    expect(outcome.checkpointAfter).not.toBeUndefined();
  });
});
