/**
 * Width-aware tab strip: highlights the active label and, when labels
 * overflow, keeps a window of labels around the active tab with leading and
 * trailing omission indicators. Pure rendering — no input handling.
 */
import type { Theme } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { singleLine } from './text';

const SEPARATOR = '  ';
const OMISSION = '…';

/** Render one tab-strip line fitted to `width`, highlighting `activeIndex`. */
export function renderTabStrip(theme: Theme, labels: string[], activeIndex: number, width: number): string {
  const safeWidth = Math.max(1, width);
  if (labels.length === 0) return '';
  if (visibleWidth(labels.join(SEPARATOR)) <= safeWidth) {
    return styleLabels(theme, labels, activeIndex, 0, labels.length - 1, false, false);
  }

  let start = activeIndex;
  let end = activeIndex;
  let expandLeft = true;
  while (true) {
    const nextStart = expandLeft && start > 0 ? start - 1 : start;
    const nextEnd = !expandLeft && end < labels.length - 1 ? end + 1 : end;
    expandLeft = !expandLeft;

    if (nextStart === start && nextEnd === end) {
      if ((start === 0 || nextStart === start) && (end === labels.length - 1 || nextEnd === end)) break;
      continue;
    }

    const candidate = plainViewport(labels, nextStart, nextEnd);
    if (visibleWidth(candidate) <= safeWidth) {
      start = nextStart;
      end = nextEnd;
      continue;
    }

    const otherStart = start > 0 ? start - 1 : start;
    const otherEnd = end < labels.length - 1 ? end + 1 : end;
    if ((otherStart === start && otherEnd === end) || visibleWidth(plainViewport(labels, otherStart, otherEnd)) > safeWidth) break;
    start = otherStart;
    end = otherEnd;
  }

  const leftOmitted = start > 0;
  const rightOmitted = end < labels.length - 1;
  if (visibleWidth(plainViewport(labels, start, end)) <= safeWidth) {
    return styleLabels(theme, labels, activeIndex, start, end, leftOmitted, rightOmitted);
  }

  const prefix = leftOmitted ? `${OMISSION} ` : '';
  const suffix = rightOmitted ? ` ${OMISSION}` : '';
  const activeBudget = Math.max(1, safeWidth - visibleWidth(prefix) - visibleWidth(suffix));
  const active = truncateToWidth(labels[activeIndex] ?? '', activeBudget, '');
  return singleLine(`${theme.fg('muted', prefix)}${theme.fg('accent', theme.bold(active))}${theme.fg('muted', suffix)}`, safeWidth);
}

/** Plain joined label window with omission markers, used for width probes. */
function plainViewport(labels: string[], start: number, end: number): string {
  const parts = labels.slice(start, end + 1);
  if (start > 0) parts.unshift(OMISSION);
  if (end < labels.length - 1) parts.push(OMISSION);
  return parts.join(SEPARATOR);
}

/** Join one styled label window: active label accent+bold, others muted. */
function styleLabels(
  theme: Theme,
  labels: string[],
  activeIndex: number,
  start: number,
  end: number,
  leftOmitted: boolean,
  rightOmitted: boolean,
): string {
  const parts: string[] = [];
  if (leftOmitted) parts.push(theme.fg('muted', OMISSION));
  for (let index = start; index <= end; index++) {
    const label = labels[index] ?? '';
    parts.push(index === activeIndex ? theme.fg('accent', theme.bold(label)) : theme.fg('muted', label));
  }
  if (rightOmitted) parts.push(theme.fg('muted', OMISSION));
  return parts.join(theme.fg('muted', SEPARATOR));
}
