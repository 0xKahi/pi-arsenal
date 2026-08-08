import { dye } from '@0xkahi/cli-dye';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { Box, type Component, Text, wrapTextWithAnsi } from '@earendil-works/pi-tui';

export interface P2pInboundItem {
  from: string;
  content: string;
}

export type P2pInboundDetails =
  | { kind: 'steer'; delivery: 'steer'; items: P2pInboundItem[] }
  | { kind: 'batch'; delivery: 'trigger_when_idle'; items: P2pInboundItem[] }
  | { kind: 'remote_prompt'; delivery: 'remote_prompt'; items: P2pInboundItem[] };

export const COLLAPSED_PREVIEW_LINES = 5;

export function formatPreview(text: string, maxLines = COLLAPSED_PREVIEW_LINES): string {
  const normalized = dye
    .strip(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .trim();
  const lines = normalized.split('\n').map(line => line.trimEnd());
  if (lines.length <= maxLines) return lines.join('\n');
  return `${lines.slice(0, maxLines).join('\n')}\n…`;
}

export function formatPeerMessage(item: P2pInboundItem): string {
  return `[Peer message from "${item.from}"]\n\n${item.content}`;
}

export function formatPeerBatch(items: readonly P2pInboundItem[]): string {
  const noun = items.length === 1 ? 'message' : 'messages';
  return `[Peer batch: ${items.length} ${noun}]\n\n${items.map(formatPeerMessage).join('\n\n')}`;
}

/**
 * Only the final assistant message is shipped back (see `resolveRemotePrompt`), so the envelope
 * says "final reply" and rules out answering with `p2p_send`, which would double-send.
 */
export function formatRemotePrompt(item: P2pInboundItem): string {
  return `[Remote prompt from "${item.from}" — your final reply is returned automatically; do not use p2p_send to answer]\n\n${item.content}`;
}

function isInboundDetails(value: unknown): value is P2pInboundDetails {
  if (!value || typeof value !== 'object') return false;
  const details = value as Partial<P2pInboundDetails>;
  return (
    (details.kind === 'steer' || details.kind === 'batch' || details.kind === 'remote_prompt') &&
    Array.isArray(details.items) &&
    details.items.every(item => item && typeof item.from === 'string' && typeof item.content === 'string')
  );
}

const QUOTE_GUTTER = '⎸';

function headingFor(details: P2pInboundDetails): string {
  if (details.kind === 'batch') {
    const noun = details.items.length === 1 ? 'message' : 'messages';
    return `${details.items.length} peer ${noun} · triggered when idle`;
  }
  if (details.kind === 'steer') return 'peer message · steer';
  return 'remote prompt';
}

/** Build the un-gutted lines for one peer message; the gutter is applied at render time. */
function chatMessageLines({ data, expanded, theme }: { data: P2pInboundItem; expanded: boolean; theme: Theme }): string[] {
  const sender = theme.fg('mdQuoteBorder', theme.bold(`@${data.from}`));
  const content = expanded ? dye.strip(data.content) : formatPreview(data.content);
  return [sender, ...content.split('\n').map(line => theme.fg('customMessageText', line))];
}

/**
 * Renders quoted lines with a left gutter that survives soft wrapping: wrapping happens
 * here, against the real render width, so every visual row keeps its gutter.
 */
class P2pQuoteBlock implements Component {
  constructor(
    private readonly lines: readonly string[],
    private readonly theme: Theme,
  ) {}

  invalidate(): void {
    // Stateless: lines and theme are fixed at construction, so there is nothing to reset.
  }

  render(width: number): string[] {
    const gutter = this.theme.fg('mdQuoteBorder', QUOTE_GUTTER);
    const inner = Math.max(1, width - 1);
    return this.lines.flatMap(line => (line === '' ? [gutter] : wrapTextWithAnsi(line, inner).map(w => `${gutter}${w}`)));
  }
}

export function renderP2pHubMessage(
  message: { content: string | Array<{ type: string; text?: string }>; details?: unknown },
  options: { expanded: boolean; outputPad: number },
  theme: Theme,
): Component {
  const details = isInboundDetails(message.details) ? message.details : undefined;
  const textualContent =
    typeof message.content === 'string'
      ? message.content
      : message.content
          .filter(part => part.type === 'text')
          .map(part => part.text ?? '')
          .join('\n');
  if (!details) return new Text(dye.strip(textualContent), options.outputPad, 0);

  const blocks = details.items.map(item => chatMessageLines({ data: item, expanded: options.expanded, theme }));
  const quoted = blocks.flatMap((block, index) => (index === 0 ? block : ['', ...block]));

  const box = new Box(options.outputPad, 1, value => theme.bg('customMessageBg', value));
  box.addChild(new Text(theme.fg('customMessageLabel', theme.bold(headingFor(details))), 0, 0));
  box.addChild(new P2pQuoteBlock(quoted, theme));
  return box;
}
