import { dye } from '@0xkahi/cli-dye';
import { COMMON_COLORS } from '../../constants';
import type { P2pContextSnapshot, P2pStatus } from './protocol.types';

export class FormatUtil {
  static formatDuration(since: number, now: number = Date.now()): string {
    const sec = Math.floor((now - since) / 1000);
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    return `${Math.floor(sec / 3600)}h`;
  }

  static formatStatus(status: P2pStatus, now: number = Date.now()): string {
    const dur = FormatUtil.formatDuration(status.since, now);
    if (status.kind === 'tool') return `tool:${status.toolName} (${dur})`;
    return `${status.kind} (${dur})`;
  }

  static formatTokens(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${Math.round(n / 1000)}K`;
    return `${n}`;
  }

  /** Numeric context usage, e.g. `45K/272K (17%)`, or `?/272K` when tokens are unknown. */
  static formatContextNumeric(c: P2pContextSnapshot | null | undefined): string {
    if (!c || c.contextWindow <= 0) return '';
    const window = FormatUtil.formatTokens(c.contextWindow);
    if (c.tokens === null) return `?/${window}`;
    const percent = FormatUtil.contextPercent(c);
    return `${FormatUtil.formatTokens(c.tokens)}/${window} (${percent}%)`;
  }

  static contextPercent(c: P2pContextSnapshot | null | undefined): number {
    if (!c || c.contextWindow <= 0 || c.tokens === null) return 0;
    return Math.max(0, Math.min(100, Math.round((c.tokens / c.contextWindow) * 100)));
  }

  /** Loading-bar rendering of context usage, e.g. `[###-----------] 17%`. */
  static formatContextBar(c: P2pContextSnapshot | null | undefined, width = 15): string {
    const percent = FormatUtil.contextPercent(c);
    const filled = Math.round((percent / 100) * width);
    const bar = `${dye.colorize('#'.repeat(filled), { fg: 'brightBlue' })}${'-'.repeat(Math.max(0, width - filled))}`;
    return `${dye.colorize('[', { fg: dye.hex(COMMON_COLORS.orange) })}${bar}${dye.colorize(']', { fg: dye.hex(COMMON_COLORS.orange) })} ${dye.colorize(`${percent}%`, { fg: dye.hex(COMMON_COLORS.shinyCyan) })}`;
  }

  static statusDot(status: P2pStatus | undefined): string {
    if (!status) return '○';
    if (status.kind === 'idle') return '●';
    if (status.kind === 'thinking') return '●';
    return '◆';
  }
}
