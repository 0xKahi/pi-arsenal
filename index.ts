import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { registerTmuxPopup } from './src/extensions/tmux-popup/tmux-popup.extension';

export default function piArsenalExtension(pi: ExtensionAPI): void {
  pi.on('session_start', (_event, ctx: ExtensionContext) => {
    registerTmuxPopup(pi, ctx);
  });
}
