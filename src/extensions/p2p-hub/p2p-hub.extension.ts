import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../config/config-loader';
import { COMMAND_NAME, PI_VIM_KEY_EVENT_ID } from './constants';
import { resolveP2pIdentity } from './identity.util';
import { openP2pHubModal } from './modal/open-p2p-hub-modal';
import { clearP2pHubService, installP2pHubService, resolveP2pHubService } from './p2p-hub-service';
import { type P2pHubBindingToken, type P2pHubRuntimeBinding, P2pHubState } from './p2p-hub-state';
import { HubRegistry } from './registry.util';
import { createP2pAskTool } from './tools/p2p-ask.tool';
import { createP2pLsTool } from './tools/p2p-ls.tool';
import { createP2pSendTool } from './tools/p2p-send.tool';
import { P2PWidgetController } from './widget/status-widget-controller';

function clearWidget(ctx: ExtensionContext): void {
  try {
    P2PWidgetController.clearWidget(ctx.ui);
  } catch {
    // UI unavailable - nothing to clear.
  }
}

function disposePreservedService(ctx: ExtensionContext): void {
  const service = resolveP2pHubService();
  if (service) {
    clearP2pHubService(service);
    service.dispose();
  }
  clearWidget(ctx);
}

/** @internal exported only so tests can drive `state` and lifecycle hooks directly. */
export function activateP2pHub(
  pi: ExtensionAPI,
  initialCtx: ExtensionContext,
  deps: { config: ConfigProvider },
): { state: P2pHubState; bindingToken: P2pHubBindingToken } {
  let latestCtx: ExtensionContext = initialCtx;
  const registry = new HubRegistry();
  let state!: P2pHubState;

  const runtime: P2pHubRuntimeBinding = {
    getModelId: () => latestCtx.model?.id,
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
  };

  const existing = resolveP2pHubService();
  if (existing) {
    state = existing;
  } else {
    const identity = resolveP2pIdentity(initialCtx.cwd);
    state = installP2pHubService(
      new P2pHubState({
        registry,
        identity: { name: identity.name, description: identity.description, cwd: initialCtx.cwd },
        ...runtime,
      }),
    );
  }
  const bindingToken = state.attachRuntime(runtime);

  pi.on('session_start', (_event, ctx) => {
    latestCtx = ctx;
    state.refreshRuntime(bindingToken);
  });

  pi.on('session_shutdown', (event, ctx) => {
    clearWidget(ctx);

    if (event.reason === 'quit') {
      clearP2pHubService(state);
      state.dispose();
    }

    if (['reload', 'new', 'resume', 'fork'].includes(event.reason)) {
      state.detachRuntime(bindingToken);
    }
  });

  pi.on('agent_start', () => {
    state.setAgentRunning(true, bindingToken);
  });

  pi.on('agent_end', (event, _ctx) => {
    state.setAgentRunning(false, bindingToken);
    state.wakeInboxFlush(bindingToken);

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
    state.resolveRemotePrompt(responseText, bindingToken);
  });

  pi.on('tool_execution_start', event => {
    state.setActiveTool(event.toolName, bindingToken);
  });

  pi.on('tool_execution_end', () => {
    state.setActiveTool(null, bindingToken);
  });

  pi.registerTool(createP2pSendTool(state));
  pi.registerTool(createP2pAskTool(state));
  pi.registerTool(createP2pLsTool(state));

  const openModal = async (ctx: ExtensionContext) => {
    if (ctx.mode !== 'tui') {
      ctx.ui.notify(`/${COMMAND_NAME} requires TUI mode.`, 'warning');
      return;
    }
    await openP2pHubModal(ctx, state, registry, deps.config.getP2pHub().layout);
  };

  pi.registerCommand(COMMAND_NAME, {
    description: 'Connect to, browse, or create p2p-hub networks',
    handler: async (args, ctx) => {
      latestCtx = ctx;
      if (args.trim()) {
        ctx.ui.notify(`/${COMMAND_NAME} accepts no arguments.`, 'error');
        return;
      }
      await openModal(ctx);
    },
  });

  pi.events.on(PI_VIM_KEY_EVENT_ID, () => {
    if (latestCtx.mode !== 'tui') return;
    void openModal(latestCtx).catch(error => {
      latestCtx.ui.notify(`p2p-hub: failed to open modal: ${error instanceof Error ? error.message : String(error)}`, 'error');
    });
  });

  return { state, bindingToken };
}

/** Lazily registers surfaces once per runtime and reuses the process service. */
export function registerP2pHub(pi: ExtensionAPI, deps: { config: ConfigProvider }): void {
  let registered = false;
  pi.on('session_start', (_event, ctx) => {
    if (!deps.config.getP2pHub().enabled) {
      disposePreservedService(ctx);
      return;
    }
    if (registered) return;
    activateP2pHub(pi, ctx, deps);
    registered = true;
  });
}
