import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { ConfigLoader } from '../../config/config-loader';
import { createTmuxPopupTool } from './tmux-popup.tool';

let registered = false;

export function registerTmuxPopup(pi: ExtensionAPI, ctx: ExtensionContext): void {
  if (registered) return;

  const loadResult = ConfigLoader.load(ctx);
  if (!loadResult.success) {
    ctx.ui.notify(`pi-arsenal: ${loadResult.error}`, 'error');
    return;
  }

  if (!loadResult.config.tmux_popup.enabled) {
    return;
  }

  ctx.ui.notify('pi-arsenal: Registering tmux-popup tool', 'info');
  pi.registerTool(createTmuxPopupTool(loadResult.config.tmux_popup));
  registered = true;
}

export function resetTmuxPopupRegistrationState(): void {
  registered = false;
}
