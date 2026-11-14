import { describe, expect, it } from 'bun:test';
import type { KeybindingsManager, Theme } from '@earendil-works/pi-coding-agent';
import type { ChildSessionSnapshot } from '../../../../src/extensions/multiverse/child-sessions/child-session-projection.ts';
import { buildChildSessionSummary } from '../../../../src/extensions/multiverse/child-sessions/child-session-summary.ts';
import { ChildSessionsTab, formatChildTimestamp } from '../../../../src/extensions/multiverse/modal/child-sessions-tab.ts';
import { ModalDialog, type ModalLayer, VimNavigationScheme } from '../../../../src/libs/modal';

const theme = { fg: (tone: string, text: string) => `<${tone}>${text}</${tone}>`, bold: (text: string) => `<bold>${text}</bold>` } as Theme;
export const childSnapshot = (id = 'child-one'): ChildSessionSnapshot => ({
  status: 'available',
  childSessionId: id,
  childSessionFile: '/unused',
  agent: 'fixer',
  lastUsed: '2025-01-02T12:34:00',
  summary: {
    ...buildChildSessionSummary([]),
    provider: 'anthropic',
    model: 'sonnet',
    thinkingLevel: 'medium',
    contextPercent: 91,
    contextWindow: 100000,
  },
  getTranscriptBlocks: () => [
    {
      id: 'block',
      kind: 'toolResult',
      timestamp: '2025-01-02T12:34:00',
      title: 'bash',
      body: Array.from({ length: 40 }, (_, i) => `result ${id} ${i}`).join('\n'),
      isError: true,
    },
  ],
});

describe('ChildSessionsTab', () => {
  it('renders four-line rows, placeholders, tones, and unavailable errors', () => {
    const tab = new ChildSessionsTab(theme, [
      childSnapshot(),
      {
        status: 'unavailable',
        childSessionId: 'missing',
        childSessionFile: '/missing',
        agent: 'explorer',
        lastUsed: null,
        reason: 'Missing checkpoint',
      },
    ]);
    const lines = tab.render(200, undefined);
    expect(lines).toHaveLength(9);
    expect(lines[0]).toBe(
      '<accent>→ </accent><dim>[</dim><syntaxString>02-01-2025 12:34:00</syntaxString><dim>]</dim> <dim>[</dim><mdHeading><bold>fixer</bold></mdHeading><dim>]</dim>',
    );
    expect(lines[1]).toBe('      <muted>child-one</muted>');
    expect(lines[2]).toBe('      <dim>anthropic/sonnet (thinking: medium)</dim>');
    expect(lines.join('\n')).toContain('anthropic/sonnet (thinking: medium)');
    expect(lines.join('\n')).toContain('<error>91.0%/100k</error>');
    expect(lines.join('\n')).toContain('<error>unavailable</error>');
    expect(lines.join('\n')).toContain('—/— (thinking: —)');
  });

  it('always formats local date and seconds and omits missing timestamps', () => {
    expect(formatChildTimestamp('2025-01-02T03:04:05')).toBe('02-01-2025 03:04:05');
    expect(formatChildTimestamp('2025-12-31T23:59:59')).toBe('31-12-2025 23:59:59');
    expect(formatChildTimestamp(null)).toBe('');
    expect(formatChildTimestamp(undefined)).toBe('');
    expect(formatChildTimestamp('invalid')).toBe('');
    const snapshot = childSnapshot();
    snapshot.lastUsed = null;
    const row = new ChildSessionsTab(theme, [snapshot]).render(200, undefined)[0];
    expect(row).toBe('<accent>→ </accent><dim>[</dim><mdHeading><bold>fixer</bold></mdHeading><dim>]</dim>');
    const tab = new ChildSessionsTab(theme, []);
    expect(tab.render(100, 10).join('\n')).toContain('No child sessions');
    expect(tab.hints()).toEqual([]);
    tab.handleNavigation('confirm');
  });

  it('opens transcript and preview, and Esc returns with selections kept', () => {
    const tab = new ChildSessionsTab(theme, [childSnapshot(), childSnapshot('child-two')]);
    const modal = new ModalDialog(
      { terminal: { rows: 48 }, requestRender: () => {} } as never,
      theme,
      { matches: () => false } as unknown as KeybindingsManager,
      {
        tabs: [tab],
        navigation: new VimNavigationScheme(),
        frame: 'inline',
        height: 'fit',
        title: 'Test',
        cancelValue: 'closed',
        onComplete: () => {},
      },
    );
    modal.render(320);
    modal.handleInput('j');
    expect(modal.render(320).join('\n')).toContain('<accent>→ </accent><dim>[</dim><syntaxString>02-01-2025 12:34:00</syntaxString><dim>]</dim>');
    const before = tab.render(320, undefined);
    modal.handleInput('\r');
    const transcript = modal.render(320).join('\n');
    expect(transcript).toContain('Transcript: child-two');
    expect(transcript).toContain('<mdHeading><bold>toolResult</bold></mdHeading>');
    expect(transcript).toContain('<toolTitle>bash</toolTitle>');
    expect(transcript).toContain('<error>error</error>');
    expect(transcript).toContain('      result child-two 0');
    expect(transcript).not.toContain('<error>result');
    expect(transcript).toContain('lines');
    modal.handleInput('\r');
    modal.render(320);
    modal.handleInput('/');
    expect(modal.render(320).join('\n')).toContain('Search:');
    modal.handleInput('\u001b'); // clear the query input first
    modal.handleInput('\u001b');
    expect(modal.render(320).join('\n')).toContain('Transcript: child-two');
    modal.handleInput('\u001b');
    modal.render(320);
    expect(tab.render(320, undefined)).toEqual(before);
  });

  it('copies normalized full content from transcript and preview with transient statuses', async () => {
    const snapshot = childSnapshot();
    if (snapshot.status !== 'available') throw new Error('Expected available snapshot');
    const block = snapshot.getTranscriptBlocks()[0];
    if (!block) throw new Error('Expected transcript block');
    block.body = `\r\n\r\n${block.body.replace(/\n/g, '\r\n')}  \r\n\t`;
    snapshot.getTranscriptBlocks = () => [block];
    const copied: string[] = [];
    let fail = false;
    let renders = 0;
    const tab = new ChildSessionsTab(
      theme,
      [snapshot],
      text => {
        if (fail) throw new Error('Clipboard denied');
        copied.push(text);
      },
      () => {
        renders++;
      },
    );
    const layers: ModalLayer[] = [];
    tab.attach({ pushLayer: layer => layers.push(layer), popLayer: () => {} });
    tab.handleNavigation('confirm');
    const transcript = layers[0];
    if (!transcript) throw new Error('Expected transcript layer');
    try {
      transcript.render(160, 24);
      transcript.handleInput('y');
      await Promise.resolve();
      const normalized = block.body.replace(/\r\n/g, '\n').replace(/^\n+/, '').trimEnd();
      expect(copied).toEqual([normalized]);
      const copiedTranscript = transcript.render(160, 24).join('\n');
      expect(copiedTranscript).toContain(`<success>  Copied ${normalized.length} characters</success>`);
      expect(copiedTranscript).not.toContain('<muted> Copy</muted>');
      expect(renders).toBeGreaterThan(0);

      transcript.handleNavigation('confirm');
      const preview = layers[1];
      if (!preview) throw new Error('Expected preview layer');
      preview.render(160, 24);
      preview.handleInput('y');
      await Promise.resolve();
      expect(copied).toEqual([normalized, normalized]);
      expect(preview.render(160, 24).join('\n')).toContain(`<success>  Copied ${normalized.length} characters</success>`);

      fail = true;
      preview.handleInput('y');
      await Promise.resolve();
      expect(preview.render(160, 24).join('\n')).toContain('<error>  Copy failed: Clipboard denied</error>');

      block.body = '\r\n\n  \t';
      transcript.handleInput('y');
      await Promise.resolve();
      expect(copied).toHaveLength(2);
      expect(transcript.render(160, 24).join('\n')).toContain('<warning>  Nothing to copy</warning>');
    } finally {
      for (const layer of layers) layer.dispose?.();
    }
  });

  it('expands display tabs at line tab stops, highlights search, and copies original tabs', async () => {
    const snapshot = childSnapshot();
    if (snapshot.status !== 'available') throw new Error('Expected available snapshot');
    const block = snapshot.getTranscriptBlocks()[0];
    if (!block) throw new Error('Expected block');
    block.body = ['a\tfoo', '12345678\tbar', ...Array(30).fill('tail')].join('\n');
    snapshot.getTranscriptBlocks = () => [block];
    const copied: string[] = [];
    const tab = new ChildSessionsTab(theme, [snapshot], text => {
      copied.push(text);
    });
    const layers: ModalLayer[] = [];
    tab.attach({ pushLayer: layer => layers.push(layer), popLayer: () => {} });
    tab.handleNavigation('confirm');
    const transcript = layers[0];
    if (!transcript) throw new Error('Expected transcript');
    try {
      const lines = transcript.render(160, 24);
      expect(lines[3]).toBe('      a       foo');
      expect(lines[4]).toBe('      12345678        bar');
      expect(lines.join('\n')).not.toContain('\t');
      transcript.handleInput('y');
      await Promise.resolve();
      transcript.handleNavigation('confirm');
      const preview = layers[1];
      if (!preview) throw new Error('Expected preview');
      const plain = preview.render(160, 24);
      expect(plain[2]).toBe('      a       foo');
      expect(plain.join('\n')).not.toContain('\t');
      preview.handleInput('/');
      preview.handleInput('foo');
      preview.handleInput('\r');
      expect(preview.render(160, 24)[2]).not.toBe(plain[2]);
      preview.handleInput('y');
      await Promise.resolve();
      expect(copied).toEqual([block.body, block.body]);
    } finally {
      for (const layer of layers) layer.dispose?.();
    }
  });

  it('opens an error transcript when lazy block building throws', () => {
    const snapshot = childSnapshot();
    if (snapshot.status !== 'available') throw new Error('Expected available snapshot');
    snapshot.getTranscriptBlocks = () => {
      throw new Error('Broken transcript');
    };
    const tab = new ChildSessionsTab(theme, [snapshot]);
    const layers: ModalLayer[] = [];
    tab.attach({ pushLayer: layer => layers.push(layer), popLayer: () => {} });
    expect(() => tab.handleNavigation('confirm')).not.toThrow();
    const rendered = layers[0]?.render(320, 24).join('\n');
    expect(rendered).toContain('Unavailable');
    expect(rendered).toContain('      Broken transcript');
    expect(rendered).toContain('<error>error</error>');
  });

  it('matches body indentation, wrapping, breadcrumbs and hint tones', () => {
    const snapshot = childSnapshot();
    if (snapshot.status !== 'available') throw new Error('Expected available snapshot');
    snapshot.getTranscriptBlocks = () => [
      {
        id: 'one',
        kind: 'toolResult',
        timestamp: '2025-01-02T03:04:05',
        title: 'bash',
        meta: 'call-1',
        body: 'x'.repeat(120),
        isError: true,
      },
    ];
    const ansiTheme = {
      fg: (tone: string, text: string) =>
        `\u001b[${({ dim: 2, mdHeading: 35, muted: 90, error: 31, accent: 36 } as Record<string, number>)[tone] ?? 0}m${text}\u001b[0m`,
      bold: (text: string) => `\u001b[1m${text}\u001b[22m`,
    } as Theme;
    const tab = new ChildSessionsTab(ansiTheme, [snapshot]);
    const layers: ModalLayer[] = [];
    tab.attach({ pushLayer: layer => layers.push(layer), popLayer: () => {} });
    tab.handleNavigation('confirm');
    const layer = layers[0];
    if (!layer) throw new Error('Expected transcript');
    const lines = layer.render(60, 24);
    expect(lines[2]).toContain('\u001b[2m[\u001b[0m\u001b[0m02-01-2025 03:04:05\u001b[0m\u001b[2m]\u001b[0m');
    expect(lines[2]).toContain('\u001b[35m\u001b[1mtoolResult');
    expect(lines[2]).toContain('\u001b[0mbash');
    expect(lines[2]).toContain('\u001b[31merror');
    expect(lines[2]).toContain('\u001b[2mcall-1');
    expect(lines[3]).toBe(`      ${'x'.repeat(53)}`);
    expect(lines[4]).toBe(`      ${'x'.repeat(53)}`);
    expect(lines[5]).toBe(`      ${'x'.repeat(14)}`);
    expect(lines.join('\n')).toContain('  \u001b[2my\u001b[0m\u001b[90m Copy\u001b[0m');
    expect(lines.join('\n')).not.toContain('selectedBg');
    // Header is one truncated row, never wrapped into the body.
    const narrow = layer.render(32, 24);
    expect(narrow[3]).toBe(`      ${'x'.repeat(25)}`);
  });

  it('changes only the selection gutter and shows a dim list counter', () => {
    const tab = new ChildSessionsTab(theme, [childSnapshot(), childSnapshot('two')]);
    const before = tab.render(320, undefined);
    tab.handleNavigation('step-forward');
    const after = tab.render(320, undefined);
    expect(before[0]?.replace('<accent>→ </accent>', '  ')).toBe(after[0]);
    expect(after[5]?.replace('<accent>→ </accent>', '  ')).toBe(before[5]);
    expect(after.slice(1, 5)).toEqual(before.slice(1, 5));
    expect(tab.render(320, 6).at(-1)).toContain('<dim>  (');
  });

  it('opens an unavailable child as an error transcript', () => {
    const tab = new ChildSessionsTab(theme, [
      {
        status: 'unavailable',
        childSessionId: 'missing',
        childSessionFile: '/missing',
        agent: 'fixer',
        lastUsed: null,
        reason: 'Missing checkpoint',
      },
    ]);
    const layers: { render: (width: number, height: number) => string[] }[] = [];
    tab.attach({ pushLayer: layer => layers.push(layer), popLayer: () => {} });
    tab.handleNavigation('confirm');
    const rendered = layers[0]?.render(320, 24).join('\n');
    expect(rendered).toContain('      Missing checkpoint');
    expect(rendered).toContain('<error>error</error>');
    expect(rendered).not.toContain('<error>Missing checkpoint</error>');
  });
});
