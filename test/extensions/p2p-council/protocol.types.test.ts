import { describe, expect, test } from 'bun:test';
import { safeParseP2pMessage, type P2pMessage, type WelcomeMsg } from '../../../src/extensions/p2p-council/protocol.types';

const welcome: WelcomeMsg = {
  type: 'welcome',
  assignedName: 'client-a-2',
  host: { name: 'host-a', model: 'claude-sonnet-4-5' },
  clients: [{ name: 'client-a', model: 'gpt-5.6-sol' }],
  statuses: {
    'host-a': { kind: 'idle', since: 1 },
    'client-a': { kind: 'tool', toolName: 'bash', since: 2 },
  },
};

const validMessages: P2pMessage[] = [
  { type: 'register', name: 'client-a', context: { tokens: null, contextWindow: 10 } },
  welcome,
  { type: 'member_joined', identity: { name: 'client-a', description: 'description', cwd: '/tmp' } },
  { type: 'member_left', name: 'client-a' },
  { type: 'chat', from: 'client-a', to: 'host-a', content: 'hello', triggerTurn: false },
  { type: 'prompt_request', id: 'id', from: 'client-a', to: 'host-a', prompt: 'question' },
  { type: 'prompt_response', id: 'id', from: 'host-a', to: 'client-a', response: 'answer', error: 'optional' },
  { type: 'status_update', name: 'client-a', status: { kind: 'tool', toolName: 'bash', since: 2 }, context: null },
  { type: 'error', message: 'error message' },
  { type: 'peek' },
  { type: 'peek_response', councilName: 'team-a', host: { name: 'host-a' }, clients: [], statuses: {} },
];

describe('p2p wire protocol', () => {
  test('validates every message type', () => {
    for (const message of validMessages) {
      expect(safeParseP2pMessage(JSON.stringify(message))).toEqual(message);
    }
  });

  test('rejects invalid names, statuses, fields, and unknown types', () => {
    const invalidMessages = [
      { type: 'register', name: '' },
      { type: 'register', name: 'two words' },
      { type: 'member_left', name: 'two\twords' },
      { ...welcome, statuses: { 'host-a': { kind: 'bogus', since: 1 } } },
      { type: 'chat', from: 'a', to: 'b', content: 4, triggerTurn: false },
      { type: 'prompt_request', id: 'id', from: 'a', to: 'b', prompt: 42 },
      { type: 'status_update', name: 'a', status: { kind: 'idle', since: 'now' } },
      { type: 'unknown', value: true },
    ];
    for (const message of invalidMessages) expect(safeParseP2pMessage(JSON.stringify(message))).toBeUndefined();
  });

  test('accepts peek responses for council names containing spaces', () => {
    expect(
      safeParseP2pMessage(JSON.stringify({ type: 'peek_response', councilName: 'my council', host: { name: 'host-a' }, clients: [], statuses: {} })),
    ).toMatchObject({ type: 'peek_response', councilName: 'my council' });
  });

  test('strips unknown fields before returning validated messages', () => {
    expect(safeParseP2pMessage(JSON.stringify({ type: 'register', name: 'client-a', extra: true }))).toEqual({
      type: 'register',
      name: 'client-a',
    });
    expect(safeParseP2pMessage(JSON.stringify({ ...welcome, extra: true, host: { name: 'host-a', extra: true } }))).toEqual({
      ...welcome,
      host: { name: 'host-a' },
    });
  });
});
