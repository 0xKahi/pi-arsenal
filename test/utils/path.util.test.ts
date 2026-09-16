import { describe, expect, test } from 'bun:test';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { EXTENSION_ID } from '../../src/constants.ts';
import { PathUtil } from '../../src/utils/path.util.ts';

const agentsSuffix = path.join('extensions', EXTENSION_ID, 'agents');

describe('PathUtil.getAgentsDirectory', () => {
  test('resolves the global directory under the agent directory', () => {
    expect(PathUtil.getAgentsDirectory({ type: 'global' })).toBe(path.join(getAgentDir(), agentsSuffix));
  });

  test('resolves the project directory under the project .pi directory', () => {
    const cwd = path.join(path.sep, 'work', 'project');
    expect(PathUtil.getAgentsDirectory({ type: 'project', cwd })).toBe(path.join(cwd, '.pi', agentsSuffix));
  });

  test('returns a path rather than throwing for a root that does not exist', () => {
    const cwd = path.join(tmpdir(), 'arsenal-path-util-missing-root');
    expect(() => PathUtil.getAgentsDirectory({ type: 'project', cwd })).not.toThrow();
    expect(PathUtil.getAgentsDirectory({ type: 'project', cwd })).toContain(cwd);
  });
});
