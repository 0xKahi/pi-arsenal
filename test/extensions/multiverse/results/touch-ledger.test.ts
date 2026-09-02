import { describe, expect, it } from 'bun:test';
import { TouchLedger } from '../../../../src/extensions/multiverse/results/touch-ledger.ts';

describe('TouchLedger', () => {
  it('records recognized file-modifying tools from their call arguments', () => {
    const ledger = new TouchLedger();

    ledger.observe({ type: 'tool_execution_start', toolCallId: '1', toolName: 'edit', args: { path: 'src/a.ts' } });
    ledger.observe({ type: 'tool_execution_update', toolCallId: '2', toolName: 'write', args: { filePath: 'src/b.ts' }, partialResult: {} });
    ledger.observe({ type: 'tool_execution_start', toolCallId: '3', toolName: 'multi_edit', args: { path: 'src/c.ts' } });

    expect(ledger.list()).toEqual(['src/a.ts', 'src/b.ts', 'src/c.ts']);
  });

  it('ignores shell operations and result payloads', () => {
    const ledger = new TouchLedger();

    ledger.observe({ type: 'tool_execution_start', toolCallId: '1', toolName: 'bash', args: { command: 'sed -i ... src/a.ts' } });
    // tool_execution_end carries rendered output, never the call arguments.
    ledger.observe({ type: 'tool_execution_end', toolCallId: '2', toolName: 'write', result: { path: 'src/b.ts' }, isError: false });

    expect(ledger.list()).toEqual([]);
  });

  it('deduplicates repeated writes to the same path', () => {
    const ledger = new TouchLedger();

    ledger.observe({ type: 'tool_execution_start', toolCallId: '1', toolName: 'edit', args: { path: 'src/a.ts' } });
    ledger.observe({ type: 'tool_execution_update', toolCallId: '1', toolName: 'edit', args: { path: 'src/a.ts' }, partialResult: {} });

    expect(ledger.list()).toEqual(['src/a.ts']);
  });
});
