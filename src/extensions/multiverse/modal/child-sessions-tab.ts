import { copyToClipboard, type Theme } from '@earendil-works/pi-coding-agent';
import { stripTerminalSequences, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui';
import {
  BlockListLayer,
  BlockNavigator,
  type CopyCallback,
  fitLine,
  type Hint,
  layoutPreviewBlocks,
  type ModalTab,
  type ModalTabContext,
  type NavigationAction,
  SearchablePreview,
} from '../../../libs/modal';
import type { ChildSessionSnapshot } from '../child-sessions/child-session-projection.ts';
import { buildSpendLineSegments } from '../child-sessions/child-session-summary.ts';
import type { TranscriptBlock } from '../child-sessions/transcript-blocks.ts';

const safe = (text: string) =>
  [...stripTerminalSequences(text)]
    .filter(character => {
      const code = character.codePointAt(0) ?? 0;
      return (code >= 0x20 && code !== 0x7f) || character === '\n' || character === '\t';
    })
    .join('');
const field = (text: string) => safe(text).replace(/[\r\n\t]/g, ' ');
const expandTabs = (line: string) => {
  let column = 0;
  return line
    .split('\t')
    .map((part, index) => {
      const padding = index === 0 ? '' : ' '.repeat(8 - (column % 8));
      column += padding.length + visibleWidth(part);
      return padding + part;
    })
    .join('');
};

export function formatChildTimestamp(timestamp: string | null | undefined): string {
  if (timestamp == null) return '';
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${String(date.getFullYear()).padStart(4, '0')} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Wraps already-styled content in dim brackets. */
function breadcrumb(theme: Theme, content: string): string {
  return `${theme.fg('dim', '[')}${content}${theme.fg('dim', ']')}`;
}

function entryHeader(theme: Theme, timestamp: string | null | undefined, crumbs: string[], error?: string, meta?: string): string {
  const formatted = formatChildTimestamp(timestamp);
  const cells = formatted ? [breadcrumb(theme, theme.fg('syntaxString', formatted))] : [];
  cells.push(
    ...crumbs.map((crumb, index) =>
      breadcrumb(theme, index === 0 ? theme.fg('mdHeading', theme.bold(field(crumb))) : theme.fg('toolTitle', field(crumb))),
    ),
  );
  if (error) cells.push(breadcrumb(theme, theme.fg('error', field(error))));
  if (meta) cells.push(theme.fg('dim', field(meta)));
  return cells.join(' ');
}

export class ChildSessionsTab implements ModalTab {
  public readonly label = 'Child Sessions';
  private readonly navigator = new BlockNavigator();
  private context?: ModalTabContext;

  public constructor(
    private readonly theme: Theme,
    private readonly sessions: readonly ChildSessionSnapshot[],
    private readonly copy: CopyCallback = copyToClipboard,
    private readonly requestRender?: () => void,
  ) {}

  public attach(context: ModalTabContext): void {
    this.context = context;
  }
  public handleInput(_data: string): void {}
  public hints(): Hint[] {
    return this.sessions.length === 0 ? [] : [['Enter', 'Transcript']];
  }

  public render(width: number, height: number | undefined): string[] {
    if (this.sessions.length === 0) return [fitLine(this.theme.fg('muted', '  No child sessions on this branch.'), width)];

    const layout = layoutPreviewBlocks(this.sessions.map(() => 4));
    const showScroll = height !== undefined && height > 1 && layout.lines.length > height;
    const visible = Math.max(1, (height ?? layout.lines.length) - (showScroll ? 1 : 0));
    this.navigator.setExtent(layout, visible);

    const rows = this.sessions.map((session, index) => {
      const selected = index === this.navigator.selected;
      const summary = session.status === 'available' ? session.summary : undefined;
      const spend = summary
        ? buildSpendLineSegments(summary)
            .map(segment => this.theme.fg(segment.tone, segment.text))
            .join(' ')
        : this.theme.fg('dim', '?');
      return [
        `${selected ? this.theme.fg('accent', '→ ') : '  '}${entryHeader(this.theme, session.lastUsed, [session.agent], session.status === 'unavailable' ? 'unavailable' : undefined)}`,
        `      ${this.theme.fg('muted', field(session.childSessionId))}`,
        `      ${this.theme.fg('dim', `${field(summary?.provider ?? '—')}/${field(summary?.model ?? '—')} (thinking: ${field(summary?.thinkingLevel ?? '—')})`)}`,
        `      ${spend}`,
      ];
    });
    const lines = layout.lines
      .slice(this.navigator.offset, this.navigator.offset + visible)
      .map(ref => fitLine(ref ? (rows[ref.blockIndex]?.[ref.lineIndex] ?? '') : '', width));
    if (showScroll)
      lines.push(
        fitLine(this.theme.fg('dim', `  (${Math.min(layout.lines.length, this.navigator.offset + visible)}/${layout.lines.length})`), width),
      );
    return lines;
  }

  public handleNavigation(action: NavigationAction): void {
    switch (action) {
      case 'step-back':
        this.navigator.stepBack();
        break;
      case 'step-forward':
        this.navigator.stepForward();
        break;
      case 'page-back':
        this.navigator.page(-1);
        break;
      case 'page-forward':
        this.navigator.page(1);
        break;
      case 'first':
        this.navigator.moveToFirst();
        break;
      case 'last':
        this.navigator.moveToLast();
        break;
      case 'confirm': {
        const session = this.sessions[this.navigator.selected];
        if (session) this.openTranscript(session);
        break;
      }
    }
  }

  private openTranscript(session: ChildSessionSnapshot): void {
    let transcript: TranscriptBlock[] = [];
    if (session.status === 'available') {
      try {
        transcript = session.getTranscriptBlocks();
      } catch (error) {
        session = { ...session, status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
      }
    }
    const blocks: TranscriptBlock[] =
      session.status === 'available'
        ? transcript
        : [
            {
              id: session.childSessionId,
              kind: 'text',
              timestamp: session.lastUsed ?? '',
              title: 'Unavailable',
              body: session.reason,
              isError: true,
            },
          ];
    const header = (block: TranscriptBlock) =>
      entryHeader(this.theme, block.timestamp, [block.kind, block.title], block.isError ? 'error' : undefined, block.meta);
    const body = (block: TranscriptBlock, width: number) =>
      safe(block.body)
        .split('\n')
        .flatMap(line => {
          const wrapped = wrapTextWithAnsi(expandTabs(line), Math.max(10, width - 5));
          return (wrapped.length === 0 ? [''] : wrapped).map(part => (part === '' ? '' : `    ${part}`));
        });
    this.context?.pushLayer(
      new BlockListLayer(this.theme, {
        title: `Transcript: ${field(session.childSessionId)}`,
        blocks,
        header,
        body,
        copy: this.copy,
        copyText: block => block.body,
        requestRender: this.requestRender,
        onOpen: block =>
          this.context?.pushLayer(
            new SearchablePreview(this.theme, {
              title: `  ${header(block)}`,
              body: width => body(block, width - 2).map(line => (line === '' ? '' : `  ${line}`)),
              copy: this.copy,
              copyText: () => block.body,
              requestRender: this.requestRender,
            }),
          ),
      }),
    );
  }
}
