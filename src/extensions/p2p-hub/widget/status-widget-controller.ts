import { dye } from '@0xkahi/cli-dye';
import type { ExtensionUIContext, Theme } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { COMMON_COLORS } from '../../../constants';
import { STATUS_WIDGET_KEY } from '../constants';
import { FormatUtil } from '../format.util';
import type { P2pHubState, P2pRosterEntry } from '../p2p-hub-state';

export const P2P_WIDGET_LAYOUT = {
  rowInset: 1,
  preferredGap: 2,
  minimumGap: 1,
  maximumNameWidth: 24,
  maximumModelWidth: 24,
  preferredContextBarWidth: 14,
  compactContextBarWidth: 3,
} as const;

interface ResolvedLayout {
  inset: number;
  gap: number;
  nameWidth: number;
  modelWidth: number;
  contextBarWidth: number;
  showContext: boolean;
}

function borderChar(type: 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft' | 'horizontal' | 'vertical'): string {
  let char = '';
  switch (type) {
    case 'topRight':
      char = '┓';
      break;
    case 'topLeft':
      char = '┏';
      break;
    case 'bottomRight':
      char = '┛';
      break;
    case 'bottomLeft':
      char = '┗';
      break;
    case 'horizontal':
      char = '━';
      break;
    case 'vertical':
      char = '┃';
      break;
  }
  return dye.colorize(char, { fg: 'brightCyan' });
}

function safeWidth(width: number): number {
  return Math.max(0, Math.floor(Number.isFinite(width) ? width : 0));
}

function repeatToWidth(value: string, width: number): string {
  return value.repeat(Math.max(0, safeWidth(width)));
}

function fit(value: string, width: number, ellipsis = '…'): string {
  const bounded = safeWidth(width);
  if (bounded === 0) return '';
  return truncateToWidth(value, bounded, ellipsis);
}

function pad(value: string, width: number): string {
  const bounded = safeWidth(width);
  const truncated = fit(value, bounded);
  return `${truncated}${repeatToWidth(' ', bounded - visibleWidth(truncated))}`;
}

function contextText(entry: P2pRosterEntry, barWidth: number): string {
  const context = entry.identity.context;
  if (!context) return '';
  const percent = dye.colorize(`${FormatUtil.contextPercent(context)}%`, { fg: dye.hex(COMMON_COLORS.shinyCyan) });
  if (barWidth <= 0) return percent;
  const value = FormatUtil.formatContextBar(context, barWidth);
  return value;
}

function activeFieldCount(layout: ResolvedLayout): number {
  return 1 + Number(layout.nameWidth > 0) + Number(layout.modelWidth > 0) + Number(layout.showContext);
}

function layoutWidth(layout: ResolvedLayout, contextPercentWidth: number): number {
  const contextWidth = layout.showContext ? contextPercentWidth + (layout.contextBarWidth > 0 ? layout.contextBarWidth + 3 : 0) : 0;
  return layout.inset + 1 + layout.nameWidth + layout.modelWidth + contextWidth + Math.max(0, activeFieldCount(layout) - 1) * layout.gap;
}

function resolveLayout(roster: P2pRosterEntry[], width: number): ResolvedLayout {
  const available = safeWidth(width);
  const hasContext = roster.some(entry => entry.identity.context !== undefined);
  const hasModel = roster.some(entry => Boolean(entry.identity.model));
  const contextPercentWidth = hasContext
    ? Math.max(...roster.map(entry => (entry.identity.context ? visibleWidth(`${FormatUtil.contextPercent(entry.identity.context)}%`) : 0)))
    : 0;
  const layout: ResolvedLayout = {
    inset: Math.min(P2P_WIDGET_LAYOUT.rowInset, available),
    gap: P2P_WIDGET_LAYOUT.preferredGap,
    nameWidth: Math.min(P2P_WIDGET_LAYOUT.maximumNameWidth, Math.max(0, ...roster.map(entry => visibleWidth(entry.identity.name)))),
    modelWidth: hasModel
      ? Math.min(P2P_WIDGET_LAYOUT.maximumModelWidth, Math.max(0, ...roster.map(entry => visibleWidth(entry.identity.model ?? ''))))
      : 0,
    contextBarWidth: hasContext ? P2P_WIDGET_LAYOUT.preferredContextBarWidth : 0,
    showContext: hasContext,
  };

  const overflows = () => layoutWidth(layout, contextPercentWidth) > available;
  while (overflows() && layout.gap > P2P_WIDGET_LAYOUT.minimumGap) layout.gap--;
  while (overflows() && layout.contextBarWidth > P2P_WIDGET_LAYOUT.compactContextBarWidth) layout.contextBarWidth--;
  while (overflows() && layout.modelWidth > 1) layout.modelWidth--;
  while (overflows() && layout.nameWidth > 1) layout.nameWidth--;
  while (overflows() && layout.contextBarWidth > 0) layout.contextBarWidth--;
  if (overflows() && layout.modelWidth > 0) layout.modelWidth = 0;
  if (overflows() && layout.nameWidth > 0) layout.nameWidth = 0;
  if (overflows() && layout.showContext) layout.showContext = false;
  if (overflows()) layout.inset = 0;

  return layout;
}

function border(width: number, left: string, right: string, label: string, alignRight = false): string {
  const bounded = safeWidth(width);
  if (bounded === 0) return '';
  if (bounded === 1) return borderChar('horizontal');
  const innerWidth = bounded - 2;
  const fittedLabel = fit(label, innerWidth);
  const fill = repeatToWidth(borderChar('horizontal'), innerWidth - visibleWidth(fittedLabel));
  return `${left}${alignRight ? `${fill}${fittedLabel}` : `${fittedLabel}${fill}`}${right}`;
}

export class P2PWidgetController {
  static clearWidget(ui: ExtensionUIContext) {
    ui.setWidget(STATUS_WIDGET_KEY, undefined, { placement: 'belowEditor' });
  }

  static renderWidget(ui: ExtensionUIContext, state: P2pHubState) {
    if (!state.isConnected()) {
      P2PWidgetController.clearWidget(ui);
      return;
    }
    ui.setWidget(
      STATUS_WIDGET_KEY,
      (_tui, theme) => ({
        render: (width: number) => P2PWidgetController.renderLines(state, theme, width),
        invalidate: () => {},
      }),
      { placement: 'belowEditor' },
    );
  }

  static renderLines(state: P2pHubState, theme: Theme, width: number): string[] {
    const bounded = safeWidth(width);
    const roster = state.getRoster();
    const hubName = state.getHubName() ?? '';
    const count = roster.length;
    const memberLabel = `${count} ${count === 1 ? 'member' : 'members'} `;
    return [
      border(bounded, borderChar('topLeft'), borderChar('topRight'), `${borderChar('horizontal')} ${dye.colorize(hubName, { fg: 'green' })} `),
      ...P2PWidgetController.renderRows(roster, bounded, theme),
      border(bounded, borderChar('bottomLeft'), borderChar('bottomRight'), memberLabel, true),
    ].map(line => fit(line, bounded, ''));
  }

  private static renderRows(roster: P2pRosterEntry[], width: number, theme: Theme): string[] {
    const bounded = safeWidth(width);
    const layout = resolveLayout(roster, bounded);
    return roster.map(entry => {
      const fields: string[] = [P2PWidgetController.statusDot(entry, theme)];
      if (layout.nameWidth > 0) fields.push(pad(dye.colorize(entry.identity.name, { fg: dye.hex(COMMON_COLORS.shinyCyan) }), layout.nameWidth));
      if (layout.modelWidth > 0) fields.push(pad(entry.identity.model ?? '', layout.modelWidth));
      if (layout.showContext) fields.push(contextText(entry, layout.contextBarWidth));
      const line = `${repeatToWidth(' ', layout.inset)}${fields.join(repeatToWidth(' ', layout.gap))}`;
      return fit(line, bounded, '');
    });
  }

  private static statusDot(entry: P2pRosterEntry, theme: Theme): string {
    const dot = FormatUtil.statusDot(entry.status);
    if (!entry.status) return theme.fg('dim', dot);
    if (entry.status.kind === 'idle') return dye.colorize(dot, { fg: 'green' });
    if (entry.status.kind === 'thinking') return dye.colorize(dot, { fg: 'yellow' });
    return theme.fg('accent', dot);
  }
}
