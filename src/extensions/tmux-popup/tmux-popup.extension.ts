import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../config/config-loader';
import { PathUtil } from '../../utils/path.util';
import { createTmuxPopupTool } from './tmux-popup.tool';

/** Lazily registers tmux-popup once per runtime after the first enabled session starts. */
export function registerTmuxPopup(pi: ExtensionAPI, deps: { config: ConfigProvider }): void {
  let registered = false;

  pi.on('session_start', (_event, ctx) => {
    const tmuxPopupConfig = deps.config.getTmuxPopup();
    if (registered || !tmuxPopupConfig.enabled) return;

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

    pi.registerTool(createTmuxPopupTool(tmuxPopupConfig));
    registered = true;
  });
}
