import type { KeybindingsManager } from '@earendil-works/pi-coding-agent';
import type { Hint, NavigationResult, NavigationScheme } from '../types';

/**
 * Default navigation scheme driven by the host keybindings manager, so modal
 * movement follows the user's configured `tui.select.*` bindings. Hint labels
 * describe the default keys; remapped keys are not reflected (accepted
 * limitation).
 */
export class PiKeybindingsScheme implements NavigationScheme {
  public constructor(private readonly keybindings: KeybindingsManager) {}

  public consume(data: string): NavigationResult {
    if (this.keybindings.matches(data, 'tui.select.up')) return { handled: true, action: 'step-back' };
    if (this.keybindings.matches(data, 'tui.select.down')) return { handled: true, action: 'step-forward' };
    if (this.keybindings.matches(data, 'tui.select.pageUp')) return { handled: true, action: 'page-back' };
    if (this.keybindings.matches(data, 'tui.select.pageDown')) return { handled: true, action: 'page-forward' };
    if (this.keybindings.matches(data, 'tui.select.confirm')) return { handled: true, action: 'confirm' };
    if (this.keybindings.matches(data, 'tui.select.cancel')) return { handled: true, action: 'dismiss' };
    return { handled: false };
  }

  public reset(): void {
    // Stateless: no chords to clear.
  }

  public hints(stepLabel = 'Navigate'): Hint[] {
    return [
      ['↑↓', stepLabel],
      ['PgUp/PgDn', 'Page'],
    ];
  }
}
