import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { ConfigLoader, type ConfigLoadResult } from '../../config/config-loader';
import { COMMAND_NAME, PI_VIM_KEY_EVENT_ID } from './constants';
import { resolveP2pIdentity } from './identity.util';
import { openP2pHubModal } from './modal/open-p2p-hub-modal';
import { P2pHubState } from './p2p-hub-state';
import { HubRegistry } from './registry.util';
import { createP2pAskTool } from './tools/p2p-ask.tool';
import { createP2pLsTool } from './tools/p2p-ls.tool';
import { createP2pSendTool } from './tools/p2p-send.tool';
import { P2PWidgetController } from './widget/status-widget-controller';

function loadP2pHubConfig(ctx: Pick<ExtensionContext, 'cwd' | 'isProjectTrusted'>): ConfigLoadResult {
  return ConfigLoader.load(ctx);
}

function isP2pHubEnabled(ctx: Pick<ExtensionContext, 'cwd' | 'isProjectTrusted'>): boolean {
  const result = loadP2pHubConfig(ctx);
  return result.success && result.config.p2p_hub.enabled;
}

/** @internal exported only so tests can drive `state` and lifecycle hooks directly. */
export function activateP2pHub(pi: ExtensionAPI, initialCtx: ExtensionContext): { state: P2pHubState } {
  let latestCtx: ExtensionContext = initialCtx;
  const enabled = () => isP2pHubEnabled(latestCtx);
  const registry = new HubRegistry();
  const identity = resolveP2pIdentity(initialCtx.cwd);

  const state = new P2pHubState({
    registry,
    identity: { name: identity.name, description: identity.description, cwd: initialCtx.cwd },
    getModelName: () => latestCtx.model?.name,
    getContextSnapshot: () => {
      const usage = latestCtx.getContextUsage();
      if (!usage || usage.contextWindow <= 0) return undefined;
      return { tokens: usage.tokens, contextWindow: usage.contextWindow };
    },
    isIdle: () => {
      try {
        return latestCtx.isIdle();
      } catch {
        return false;
      }
    },
    deliverBatch: (batchText, count) => {
      pi.sendMessage(
        {
          customType: 'p2p_hub',
          content: `[p2p-hub: ${count} message(s) received]\n\n${batchText}`,
          display: true,
          details: { batched: true, count },
        },
        { triggerTurn: true },
      );
    },
    deliverSteer: (content, from) => {
      pi.sendMessage({ customType: 'p2p_hub', content, display: true, details: { from } }, { triggerTurn: false, deliverAs: 'steer' });
    },
    runRemotePrompt: (from, prompt) => {
      pi.sendUserMessage(`[Remote prompt from "${from}"]\n\n${prompt}`);
    },
    notify: (message, level) => {
      try {
        latestCtx.ui.notify(`p2p-hub: ${message}`, level);
      } catch {
        // UI unavailable (e.g. non-interactive mode) - drop silently.
      }
    },
    onChange: () => {
      try {
        if (latestCtx.mode === 'tui') P2PWidgetController.renderWidget(latestCtx.ui, state);
      } catch {
        // UI unavailable - nothing to update.
      }
    },
  });

  pi.on('session_start', (_event, ctx) => {
    latestCtx = ctx;
    if (!enabled() && state.isConnected()) {
      state.disconnect('disabled');
      try {
        P2PWidgetController.clearWidget(ctx.ui);
      } catch {
        // UI unavailable - nothing to clear.
      }
    }
  });

  pi.on('agent_start', () => {
    if (!enabled()) return;
    state.setAgentRunning(true);
  });

  pi.on('agent_end', (event, _ctx) => {
    if (!enabled()) return;
    state.setAgentRunning(false);
    state.wakeInboxFlush();

    let responseText = '';
    for (let i = event.messages.length - 1; i >= 0; i--) {
      const message = event.messages[i];
      if (message?.role === 'assistant') {
        responseText = message.content
          .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
          .map(c => c.text)
          .join('\n');
        break;
      }
    }
    state.resolveRemotePrompt(responseText);
  });

  pi.on('tool_execution_start', event => {
    if (!enabled()) return;
    state.setActiveTool(event.toolName);
  });

  pi.on('tool_execution_end', () => {
    if (!enabled()) return;
    state.setActiveTool(null);
  });

  pi.registerTool(createP2pSendTool(state));
  pi.registerTool(createP2pAskTool(state));
  pi.registerTool(createP2pLsTool(state));

  const openModal = async (ctx: ExtensionContext) => {
    if (ctx.mode !== 'tui') {
      ctx.ui.notify(`/${COMMAND_NAME} requires TUI mode.`, 'warning');
      return;
    }
    const config = loadP2pHubConfig(ctx);
    if (!config.success) {
      ctx.ui.notify(`p2p-hub: ${config.error}`, 'error');
      return;
    }
    await openP2pHubModal(ctx, state, registry, config.config.p2p_hub.layout);
  };

  pi.registerCommand(COMMAND_NAME, {
    description: 'Connect to, browse, or create p2p-hub networks',
    handler: async (args, ctx) => {
      latestCtx = ctx;
      if (!enabled()) {
        ctx.ui.notify('(pi-arsenal) p2p_hub is disabled', 'warning');
        return;
      }
      if (args.trim()) {
        ctx.ui.notify(`/${COMMAND_NAME} accepts no arguments.`, 'error');
        return;
      }
      await openModal(ctx);
    },
  });

  pi.events.on(PI_VIM_KEY_EVENT_ID, () => {
    if (!enabled() || latestCtx.mode !== 'tui') return;
    void openModal(latestCtx).catch(error => {
      latestCtx.ui.notify(`p2p-hub: failed to open modal: ${error instanceof Error ? error.message : String(error)}`, 'error');
    });
  });

  return { state };
}

/** Lazily activates p2p-hub only after the first session with `p2p_hub.enabled: true`. */
export function registerP2pHub(pi: ExtensionAPI): void {
  let registered = false;
  pi.on('session_start', (_event, ctx) => {
    if (registered || !isP2pHubEnabled(ctx)) return;
    activateP2pHub(pi, ctx);
    registered = true;
  });
}
