import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { ConfigLoader } from '../../config/config-loader';
import { PathUtil } from '../../utils/path.util';
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

  pi.on('resources_discover', () => {
    const promptPath = PathUtil.findPromptFolder('tmux_popup');
    if (!promptPath.exists) {
      ctx.ui.notify(`pi-arsenal: Prompt folder not found for tmux_popup: ${promptPath.path}`, 'error');
      return {};
    }

    return {
      promptPaths: [promptPath.path],
    };
  });

  pi.registerTool(createTmuxPopupTool(loadResult.config.tmux_popup));
}
