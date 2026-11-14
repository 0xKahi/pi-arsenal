import { expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildChildSessionSnapshots } from '../../../../src/extensions/multiverse/child-sessions/child-session-projection.ts';
import { spawn, timestamp, transcriptFixture } from './fixtures.ts';

test('default reader and lazy transcript leave directory, index and session contents/mtimes untouched', () => {
  const dir = mkdtempSync(join(tmpdir(), 'multiverse-read-only-'));
  try {
    const file = join(dir, 'child.jsonl');
    const index = join(dir, 'index.json');
    const parentFile = join(dir, 'parent.jsonl');
    const branch = [spawn([{ childSessionFile: file, checkpointAfter: 'branch' }])];
    writeFileSync(index, '{"children":[]}');
    writeFileSync(parentFile, JSON.stringify(branch));
    writeFileSync(
      file,
      [{ type: 'session', version: 3, id: 'child', cwd: dir, timestamp }, ...transcriptFixture()].map(e => JSON.stringify(e)).join('\n'),
    );
    const capture = () =>
      Object.fromEntries(
        readdirSync(dir)
          .sort()
          .map(name => {
            const path = join(dir, name);
            return [name, { content: readFileSync(path, 'utf8'), mtime: statSync(path).mtimeMs }];
          }),
      );
    const before = capture();
    const [snapshot] = buildChildSessionSnapshots(branch);
    expect(snapshot?.status).toBe('available');
    if (snapshot?.status !== 'available') throw new Error('expected available');
    expect(snapshot.getTranscriptBlocks()).toHaveLength(10);
    snapshot.getTranscriptBlocks();
    expect(capture()).toEqual(before);
    writeFileSync(file, '{"broken":');
    expect(buildChildSessionSnapshots(branch)[0]?.status).toBe('unavailable');
    // Legacy entries are not migrated (even in memory) into a falsely available path.
    writeFileSync(file, JSON.stringify({ type: 'message', message: { role: 'user', content: 'legacy' } }));
    const legacyBefore = capture();
    expect(buildChildSessionSnapshots(branch)[0]?.status).toBe('unavailable');
    expect(capture()).toEqual(legacyBefore);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
