import { expect, test } from 'bun:test';
import { SUBAGENT_IDENTITY_CUSTOM_TYPE } from '../../../../src/extensions/multiverse/agents/session-identity.ts';
import { buildTranscriptBlocks } from '../../../../src/extensions/multiverse/child-sessions/transcript-blocks.ts';
import { entry, transcriptFixture } from './fixtures.ts';

test('two interactions preserve content order, tool correlation, errors, images and summaries', () => {
  const blocks = buildTranscriptBlocks(transcriptFixture());
  expect(blocks.map(b => b.kind)).toEqual([
    'prompt',
    'thinking',
    'assistant',
    'toolCall',
    'assistant',
    'toolResult',
    'summary',
    'prompt',
    'assistant',
    'summary',
  ]);
  expect(blocks[0]?.body).toBe('first prompt\n[image]');
  expect(blocks[3]).toMatchObject({ title: 'read', toolCallId: 'call', body: '{\n  "path": "file"\n}' });
  expect(blocks[5]).toMatchObject({ title: 'read', toolCallId: 'call', body: 'not found', isError: true });
  expect(blocks[6]?.body).toBe('compacted');
  expect(new Set(blocks.map(b => b.id)).size).toBe(blocks.length);
  expect(blocks.every(b => b.timestamp)).toBe(true);
});

test('missing or invalid message content is empty and missing tool arguments are an object', () => {
  for (const content of [undefined, null, 42, {}]) {
    const blocks = buildTranscriptBlocks([
      entry('user', null, { message: { role: 'user', content } }),
      entry('assistant', 'user', { message: { role: 'assistant', content } }),
      entry('tool', 'assistant', { message: { role: 'toolResult', toolName: 'read', content } }),
    ]);
    expect(blocks.map(block => block.body)).toEqual(['', '']);
  }
  const blocks = buildTranscriptBlocks([
    entry('call', null, { message: { role: 'assistant', content: [{ type: 'toolCall', id: 'call', name: 'read' }] } }),
  ]);
  expect(blocks[0]?.body).toBe('{}');
  expect(blocks.every(block => typeof block.body === 'string')).toBe(true);
});

test('identity and all metadata skipped; raw content is not context-edited', () => {
  const types = ['label', 'session_info', 'model_change', 'thinking_level_change', 'usage', 'context_edit'];
  expect(
    buildTranscriptBlocks([
      entry('identity', null, { type: 'custom', customType: SUBAGENT_IDENTITY_CUSTOM_TYPE }),
      ...types.map(type => entry(type, null, { type })),
    ]),
  ).toEqual([]);
});

test('bash and custom entries/messages render text with image placeholders', () => {
  const blocks = buildTranscriptBlocks([
    entry('bash', null, { message: { role: 'bashExecution', command: 'false', output: 'failed', exitCode: 1 } }),
    entry('custom-entry', 'bash', { type: 'custom_message', customType: 'notice', content: 'hello', display: true }),
    entry('custom-msg', 'custom-entry', { message: { role: 'custom', customType: 'notice', content: [{ type: 'image' }], display: true } }),
  ]);
  expect(blocks.map(b => b.body)).toEqual(['$ false\nfailed', 'hello', '[image]']);
  expect(blocks[0]?.isError).toBe(true);
});
