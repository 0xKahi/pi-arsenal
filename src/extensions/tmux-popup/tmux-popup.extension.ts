import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { ConfigLoader } from '../../config/config-loader';
import { createTmuxPopupTool } from './tmux-popup.tool';

export function registerTmuxPopup(pi: ExtensionAPI, ctx: ExtensionContext): void {
  const loadResult = ConfigLoader.load(ctx);
  if (!loadResult.success) {
    ctx.ui.notify(`pi-arsenal: ${loadResult.error}`, 'error');
    return;
  }

  if (!loadResult.config.tmux_popup.enabled) {
    return;
  }

  pi.registerTool(createTmuxPopupTool(loadResult.config.tmux_popup));
}
