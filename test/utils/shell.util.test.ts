import { describe, expect, it } from 'bun:test';
import { escapeShellArg } from '../../src/utils/shell.util';

describe('escapeShellArg', () => {
  it('wraps simple values in single quotes', () => {
    expect(escapeShellArg('/tmp/file.ts')).toBe("'/tmp/file.ts'");
  });

  it('escapes spaces', () => {
    expect(escapeShellArg('/tmp/my file.ts')).toBe("'/tmp/my file.ts'");
  });

  it('escapes apostrophes', () => {
    expect(escapeShellArg("/tmp/file's.ts")).toBe("'/tmp/file'\\''s.ts'");
  });

  it('escapes shell metacharacters', () => {
    expect(escapeShellArg('/tmp/file; rm -rf /')).toBe("'/tmp/file; rm -rf /'");
    expect(escapeShellArg('/tmp/file$(echo).ts')).toBe("'/tmp/file$(echo).ts'");
  });
});
