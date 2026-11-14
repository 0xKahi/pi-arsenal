import { expect, test } from 'bun:test';
import { buildChildSessionSnapshots } from '../../../../src/extensions/multiverse/child-sessions/child-session-projection.ts';
import { assistant, entry, spawn } from './fixtures.ts';

test('only parent branch interactions are enumerated, once, ignoring no-checkpoint placeholders', () => {
  const abandoned = spawn([{ childSessionId: 'abandoned' }]);
  const otherParent = spawn([{ childSessionId: 'other-parent' }]);
  const filesRead: string[] = [];
  const branch = [
    spawn([
      { childSessionId: 'a', checkpointAfter: 'root' },
      { childSessionId: 'empty', checkpointAfter: null },
    ]),
    spawn([{ childSessionId: 'a', checkpointAfter: null }]),
  ];
  const snapshots = buildChildSessionSnapshots(branch, {
    readEntries: file => {
      filesRead.push(file);
      return [entry('root', null)];
    },
  });
  expect(snapshots.map(s => s.childSessionId)).toEqual(['a']);
  expect(filesRead).toHaveLength(1);
  expect(buildChildSessionSnapshots([])).toEqual([]);
  expect([abandoned, otherParent]).toHaveLength(2); // neither belongs to the supplied branch
});

test('walks checkpoint ancestry, excludes off-path and later turns, and memoizes blocks', () => {
  const entries = [
    entry('root', null),
    entry('checkpoint', 'root', { message: assistant() }),
    entry('abandoned', 'root'),
    entry('later', 'checkpoint'),
  ];
  const [snapshot] = buildChildSessionSnapshots([spawn([{ checkpointAfter: 'checkpoint', status: 'failure' }])], { readEntries: () => entries });
  expect(snapshot?.status).toBe('available');
  if (snapshot?.status !== 'available') throw new Error('expected available');
  expect(snapshot.getTranscriptBlocks().map(block => block.body)).toEqual(['root', 'reply']);
  expect(snapshot.getTranscriptBlocks()).toBe(snapshot.getTranscriptBlocks());
});

test('sorts checkpoint timestamps descending with child id ties, ignoring newer abandoned activity', () => {
  const snapshots = buildChildSessionSnapshots(
    [
      spawn([
        { childSessionId: 'b', childSessionFile: 'b', checkpointAfter: 'old' },
        { childSessionId: 'c', childSessionFile: 'c', checkpointAfter: 'new' },
        { childSessionId: 'a', childSessionFile: 'a', checkpointAfter: 'new' },
      ]),
    ],
    {
      readEntries: () => [
        entry('old', null, { timestamp: '2026-01-01T00:00:00Z' }),
        entry('new', null, { timestamp: '2026-02-01T00:00:00Z' }),
        entry('abandoned-latest', 'old', { timestamp: '2026-12-01T00:00:00Z' }),
      ],
    },
  );
  expect(snapshots.map(s => s.childSessionId)).toEqual(['a', 'c', 'b']);
});

test('missing or invalid checkpoint times stay available and sort last with locale-independent id ties', () => {
  const snapshots = buildChildSessionSnapshots([spawn(['a', 'Z', 'missing', 'valid'].map(id => ({ childSessionId: id, checkpointAfter: id })))], {
    readEntries: () => [
      entry('a', null, { timestamp: 'invalid' }),
      entry('Z', null, { timestamp: 'invalid' }),
      entry('missing', null, { timestamp: undefined }),
      entry('valid', null),
    ],
  });
  expect(snapshots.map(s => s.childSessionId)).toEqual(['valid', 'Z', 'a', 'missing']);
  expect(snapshots.map(s => s.status)).toEqual(['available', 'available', 'available', 'available']);
  expect(snapshots.slice(1).map(s => s.lastUsed)).toEqual([null, null, null]);
  for (const snapshot of snapshots) {
    if (snapshot.status !== 'available') throw new Error('expected available');
    expect(snapshot.getTranscriptBlocks()[0]?.body).toBe(snapshot.childSessionId);
  }
});

test('missing, corrupt, legacy, cyclic and broken ancestry become unavailable without throwing', () => {
  const parent = [spawn([{ checkpointAfter: 'leaf' }])];
  const readers = [
    () => {
      throw new Error('unreadable');
    },
    () => [],
    () => [entry('other', null)],
    () => [entry('leaf', null, { id: undefined })],
    () => [entry('leaf', 'leaf')],
    () => [entry('leaf', 'missing')],
    () => [entry('leaf', null), entry('leaf', null)],
  ];
  for (const readEntries of readers) {
    const [snapshot] = buildChildSessionSnapshots(parent, { readEntries });
    expect(snapshot?.status).toBe('unavailable');
    if (snapshot?.status === 'unavailable') expect(snapshot.reason.length).toBeGreaterThan(0);
  }
  expect(buildChildSessionSnapshots([spawn([{ childSessionFile: '/nonexistent/child.jsonl' }])])[0]?.status).toBe('unavailable');
});
