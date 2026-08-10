import { describe, expect, test } from 'bun:test';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import {
  formatPeerBatch,
  formatPeerMessage,
  formatPreview,
  formatRemotePrompt,
  renderP2pCouncilMessage,
} from '../../../src/extensions/p2p-council/communication-presentation';
import { createP2pAskTool } from '../../../src/extensions/p2p-council/tools/p2p-ask.tool';
import { createP2pSendTool } from '../../../src/extensions/p2p-council/tools/p2p-send.tool';

const theme = {
  fg: (color: string, text: string) => `<${color}>${text}</${color}>`,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
} as Theme;

function plainTheme(): Theme {
  return {
    fg: (_color: string, text: string) => text,
    bg: (_color: string, text: string) => text,
    bold: (text: string) => text,
  } as Theme;
}

function render(component: { render(width: number): string[] }, width = 80): string[] {
  return component.render(width);
}

const renderContext = (expanded: boolean) => ({ expanded }) as never;

const dummyState = {
  isConnected: () => true,
  getSelfName: () => 'self',
  getRoster: () => [],
  sendChat: () => ({ success: true as const }),
  askPrompt: async () => ({ response: 'reply', from: 'peer' }),
} as never;

describe('p2p communication presentation', () => {
  test('model envelopes attribute every sender while preserving order and complete content', () => {
    const items = [
      { from: 'alpha', content: 'first\nmessage' },
      { from: 'beta', content: 'second message' },
    ];
    expect(formatPeerMessage(items[0]!)).toBe('[Peer message from "alpha"]\n\nfirst\nmessage');
    expect(formatPeerBatch(items)).toBe(
      '[Peer batch: 2 messages]\n\n[Peer message from "alpha"]\n\nfirst\nmessage\n\n[Peer message from "beta"]\n\nsecond message',
    );
    expect(formatRemotePrompt(items[0]!)).toBe(
      '[Remote prompt from "alpha" — your final reply is returned automatically; do not use p2p_send to answer]\n\nfirst\nmessage',
    );
  });

  test('collapsed previews keep up to five lines and mark truncation', () => {
    const short = formatPreview('one\ntwo   three\n\nfour');
    expect(short).toBe('one\ntwo three\n\nfour');

    const preview = formatPreview(Array.from({ length: 12 }, (_, i) => `line ${i}`).join('\n'));
    expect(preview.split('\n')).toHaveLength(6);
    expect(preview.endsWith('\n…')).toBe(true);
    expect(preview).toContain('line 4');
    expect(preview).not.toContain('line 5');
  });

  test('message renderer distinguishes steers, batches, and remote prompts', () => {
    const steer = renderP2pCouncilMessage(
      { content: 'model text', details: { kind: 'steer', delivery: 'steer', items: [{ from: 'alpha', content: 'hello' }] } },
      { expanded: false, outputPad: 0 },
      plainTheme(),
    );
    const steerText = render(steer).join('\n');
    expect(steerText).toContain('council message · p2p_send · steer');
    expect(steerText).toContain('@alpha');
    expect(steerText).toContain('hello');

    const batch = renderP2pCouncilMessage(
      {
        content: 'model batch',
        details: {
          kind: 'batch',
          delivery: 'trigger_when_idle',
          items: [
            { from: 'alpha', content: 'one' },
            { from: 'beta', content: 'two' },
          ],
        },
      },
      { expanded: false, outputPad: 0 },
      plainTheme(),
    );
    const batchText = render(batch).join('\n');
    expect(batchText).toContain('2 council messages · p2p_send · triggered when idle');
    expect(batchText.indexOf('@alpha')).toBeLessThan(batchText.indexOf('@beta'));
    expect(batchText.indexOf('one')).toBeLessThan(batchText.indexOf('two'));

    const prompt = renderP2pCouncilMessage(
      {
        content: 'model prompt',
        details: { kind: 'remote_prompt', delivery: 'remote_prompt', items: [{ from: 'requester', content: 'do this' }] },
      },
      { expanded: true, outputPad: 0 },
      plainTheme(),
    );
    const promptText = render(prompt).join('\n');
    expect(promptText).toContain('council request · p2p_ask');
    expect(promptText).toContain('@requester');
    expect(promptText).toContain('do this');
  });

  test('message renderer never exceeds narrow widths', () => {
    const component = renderP2pCouncilMessage(
      {
        content: 'fallback',
        details: {
          kind: 'batch',
          delivery: 'trigger_when_idle',
          items: [{ from: 'a-very-long-sender-name', content: 'unbroken'.repeat(30) }],
        },
      },
      { expanded: true, outputPad: 0 },
      plainTheme(),
    );
    for (const width of [12, 20, 40]) {
      const lines = render(component, width);
      expect(lines.every(line => visibleWidth(line) <= width)).toBe(true);
      // Every quoted row, including soft-wrapped continuations, keeps its gutter.
      const quoted = lines.filter(line => line.includes('⎸'));
      expect(quoted.length).toBeGreaterThan(2);
      expect(quoted.every(line => line.trimStart().startsWith('⎸'))).toBe(true);
    }
  });

  test('send and ask calls switch between bounded previews and expanded full text', () => {
    const long = `line one\n${Array.from({ length: 8 }, (_, i) => `filler ${i}`).join('\n')}\n${'z'.repeat(120)}`;
    const send = createP2pSendTool(dummyState);
    const collapsedSend = render(send.renderCall!({ to: 'peer', message: long, triggerTurn: true }, plainTheme(), renderContext(false))).join('\n');
    const expandedSend = render(send.renderCall!({ to: 'peer', message: long, triggerTurn: true }, plainTheme(), renderContext(true))).join('\n');
    expect(collapsedSend).toContain('trigger when idle');
    expect(collapsedSend).toContain('…');
    expect(expandedSend).toContain('line one');
    expect(expandedSend.replace(/\s/g, '')).toContain('z'.repeat(100));

    const ask = createP2pAskTool(dummyState);
    const args = { requests: [{ to: 'peer', prompt: long }] };
    expect(render(ask.renderCall!(args, plainTheme(), renderContext(false)))).toEqual([]);
    const result = {
      content: [{ type: 'text' as const, text: 'Reply from "peer":\nraw reply' }],
      details: { kind: 'batch' as const, entries: [{ to: 'peer', state: 'success' as const, from: 'peer', reply: 'raw reply' }] },
    };
    const collapsedAsk = render(
      ask.renderResult!(result, { expanded: false, isPartial: false }, plainTheme(), { args, invalidate: () => {} } as never),
    ).join('\n');
    const expandedAsk = render(
      ask.renderResult!(result, { expanded: true, isPartial: false }, plainTheme(), { args, invalidate: () => {} } as never),
    ).join('\n');
    expect(collapsedAsk).not.toContain('raw reply');
    expect(collapsedAsk).not.toContain('line one');
    expect(expandedAsk).toContain('raw reply');
    expect(expandedAsk.replace(/\s/g, '')).toContain('z'.repeat(100));
  });

  test('result renderers expose responder identity and style operational errors distinctly', () => {
    const ask = createP2pAskTool(dummyState);
    const args = { requests: [{ to: 'peer', prompt: 'question' }] };
    const reply = ask.renderResult!(
      {
        content: [{ type: 'text', text: 'Reply from "peer":\nraw reply' }],
        details: { kind: 'batch', entries: [{ to: 'peer', state: 'success', from: 'peer', reply: 'raw reply' }] },
      },
      { expanded: true, isPartial: false } as never,
      theme,
      { args, invalidate: () => {} } as never,
    );
    const replyText = render(reply).join('\n');
    expect(replyText).toContain('<success>✓ peer</success>');
    expect(replyText).toContain('raw reply');

    const send = createP2pSendTool(dummyState);
    const success = send.renderResult!(
      { content: [{ type: 'text', text: 'accepted' }], details: { to: 'peer', triggerTurn: true } },
      { expanded: false, isPartial: false } as never,
      plainTheme(),
      {} as never,
    );
    expect(render(success).join('\n')).toContain('Accepted for transport · peer · trigger when idle');

    const error = send.renderResult!(
      { content: [{ type: 'text', text: 'Agent missing' }], details: { to: 'ghost', triggerTurn: false, error: 'not_found' } },
      { expanded: false, isPartial: false } as never,
      theme,
      {} as never,
    );
    expect(render(error).join('\n')).toContain('<error>✗ Agent missing</error>');
  });
});
