import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { ConfigLoader } from './src/config/config-loader.ts';
import { registerMultiverse } from './src/extensions/multiverse/multiverse.extension.ts';
import { registerP2pCouncil } from './src/extensions/p2p-council/p2p-council.extension.ts';
import { registerTmuxPopup } from './src/extensions/tmux-popup/tmux-popup.extension.ts';

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
    for (const warning of result.warnings) ctx.ui.notify(`pi-arsenal: ${warning}`, 'warning');
  });

  registerTmuxPopup(pi, { config });
  registerP2pCouncil(pi, { config });
  registerMultiverse(pi, { config });
}
