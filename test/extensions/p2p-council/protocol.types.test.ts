import { describe, expect, test } from 'bun:test';
import { safeParseP2pMessage, type WelcomeMsg } from '../../../src/extensions/p2p-council/protocol.types';

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

describe('p2p welcome protocol', () => {
  test('parses explicit assigned name, host, existing clients, and statuses', () => {
    expect(safeParseP2pMessage(JSON.stringify(welcome))).toEqual(welcome);
    expect(safeParseP2pMessage(JSON.stringify(welcome))).toMatchObject({
      host: { model: 'claude-sonnet-4-5' },
      clients: [{ model: 'gpt-5.6-sol' }],
    });
  });

  test('rejects the former flat member shape and malformed explicit payloads', () => {
    expect(safeParseP2pMessage(JSON.stringify({ type: 'welcome', name: 'client-a', members: [], statuses: {} }))).toBeUndefined();
    expect(safeParseP2pMessage(JSON.stringify({ ...welcome, host: undefined }))).toBeUndefined();
    expect(safeParseP2pMessage(JSON.stringify({ ...welcome, statuses: { 'host-a': { kind: 'bogus', since: 1 } } }))).toBeUndefined();
  });
});
