import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { ConfigLoader } from './src/config/config-loader';
import { registerP2pCouncil } from './src/extensions/p2p-council/p2p-council.extension';
import { registerTmuxPopup } from './src/extensions/tmux-popup/tmux-popup.extension';

export default function piArsenalExtension(pi: ExtensionAPI): void {
  const config = new ConfigLoader();

  // Keep config initialization registered before registerP2pCouncil: Pi invokes handlers in
  // registration order, and the p2p session-start reconcile reads the initialized config.
  pi.on('session_start', (_event, ctx) => {
    const result = config.initializeConfig(ctx);
    if (!result.success) {
      ctx.ui.notify(`pi-arsenal: ${result.error}`, 'error');
      return;
    }
  });

  registerTmuxPopup(pi, { config });
  registerP2pCouncil(pi, { config });
}
