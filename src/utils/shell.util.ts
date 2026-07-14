/**
 * Escape a string so it can be safely used as a single POSIX shell argument.
 * Wraps the value in single quotes and escapes embedded single quotes by
 * ending the quoted segment, inserting an escaped single quote, and resuming.
 */
export function escapeShellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
