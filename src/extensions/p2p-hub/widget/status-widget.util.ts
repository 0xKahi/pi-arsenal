import { FormatUtil } from '../format.util';
import type { P2pRosterEntry } from '../p2p-hub-state';

/**
 * Render the below-editor connection status box. Pure string layout - no
 * pi/TUI dependency - so it can render via `ctx.ui.setWidget(key, string[])`
 * directly and be unit tested without a live pi runtime.
 *
 * ┏━ p2p-hub ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 *  ● agent_name  model [###-----------] 17%
 *  ● agent_name  model [#######-------] 52%
 * ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ count ━━┛
 */
export function renderStatusWidgetLines(roster: readonly P2pRosterEntry[]): string[] {
  const rows = roster.map(entry => {
    const dot = FormatUtil.statusDot(entry.status);
    const model = entry.identity.model ? ` ${entry.identity.model}` : '';
    const bar = entry.identity.context ? ` ${FormatUtil.formatContextBar(entry.identity.context)}` : '';
    return ` ${dot} ${entry.identity.name}${model}${bar}`;
  });

  const title = ' p2p-hub ';
  const countLabel = ` ${roster.length} `;
  // Content width: the span between the two frame corners, sized to fit the
  // widest row, the title, and the count label.
  const contentWidth = Math.max(title.length + 2, countLabel.length + 2, ...rows.map(row => row.length), 20);

  const top = `┏━${title}${'━'.repeat(Math.max(0, contentWidth - 1 - title.length))}┓`;
  const bottomFill = Math.max(0, contentWidth - 1 - countLabel.length);
  const bottom = `┗${'━'.repeat(bottomFill)}${countLabel}━┛`;
  const paddedRows = rows.map(row => row.padEnd(contentWidth));

  return [top, ...paddedRows, bottom];
}
