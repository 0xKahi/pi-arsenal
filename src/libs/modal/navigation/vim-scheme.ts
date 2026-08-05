/** Forked from dimk90/pi-context-view at f6f007b867212bcf81a61519c8e40ce209cdd608 (MIT). */
import { Key, matchesKey } from '@earendil-works/pi-tui';
import { STEP_KEY_HINT } from '../text';
import type { Hint, NavigationResult, NavigationScheme } from '../types';

/**
 * Vim-style navigation scheme for read-only inspector modals: `j/k` plus
 * arrow keys step, `Ctrl+u/d` page, `gg/G` jump to boundaries, Enter
 * confirms, and Esc/`q` dismiss. PageUp/PageDown/Home/End are intentionally
 * swallowed — they were replaced by the Vim bindings. The stateful `gg`
 * chord is cleared by `reset()` on tab switches and layer changes.
 *
 * Do not combine this scheme with a dialog filter input: printable keys are
 * commands here, so typing cannot reach a text field.
 */
export class VimNavigationScheme implements NavigationScheme {
  private pendingG = false;

  public reset(): void {
    this.pendingG = false;
  }

  public consume(data: string): NavigationResult {
    if (data === 'g') {
      if (this.pendingG) {
        this.pendingG = false;
        return { handled: true, action: 'first' };
      }
      this.pendingG = true;
      return { handled: true };
    }

    this.pendingG = false;
    if (data === 'G') return { handled: true, action: 'last' };
    if (matchesKey(data, Key.ctrl('u'))) return { handled: true, action: 'page-back' };
    if (matchesKey(data, Key.ctrl('d'))) return { handled: true, action: 'page-forward' };
    if (matchesKey(data, Key.up) || data === 'k') return { handled: true, action: 'step-back' };
    if (matchesKey(data, Key.down) || data === 'j') return { handled: true, action: 'step-forward' };
    if (matchesKey(data, Key.enter)) return { handled: true, action: 'confirm' };
    if (matchesKey(data, Key.escape) || data === 'q') return { handled: true, action: 'dismiss' };

    // These keys were intentionally replaced by Vim bindings.
    if (matchesKey(data, Key.pageUp) || matchesKey(data, Key.pageDown) || matchesKey(data, Key.home) || matchesKey(data, Key.end)) {
      return { handled: true };
    }
    return { handled: false };
  }

  public hints(stepLabel = 'Navigate'): Hint[] {
    return [
      [STEP_KEY_HINT, stepLabel],
      ['Ctrl+u/d', 'Page'],
      ['gg/G', 'Bounds'],
    ];
  }
}
