import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../config/config-loader';
import { formatPeerBatch, formatPeerMessage, formatRemotePrompt, renderP2pCouncilMessage } from './communication-presentation';
import { COMMAND_NAME, PI_VIM_KEY_EVENT_ID } from './constants';
import { resolveP2pIdentity } from './identity.util';
import { openP2pCouncilModal } from './modal/open-p2p-council-modal';
import { clearP2pCouncilService, installP2pCouncilService, resolveP2pCouncilService } from './p2p-council-service';
import { type P2pCouncilBindingToken, type P2pCouncilRuntimeBinding, P2pCouncilState } from './p2p-council-state';
import { CouncilRegistry } from './registry.util';
import { createP2pAskTool, P2pAskToolName } from './tools/p2p-ask.tool';
import { createP2pLsTool, P2pLsToolName } from './tools/p2p-ls.tool';
import { createP2pSendTool, P2pSendToolName } from './tools/p2p-send.tool';
import { P2PWidgetController } from './widget/status-widget-controller';

const P2P_TOOL_NAMES: readonly string[] = [P2pSendToolName, P2pAskToolName, P2pLsToolName];

/**
 * Tools are registered at load so restored history keeps its renderers, then activated or
 * deactivated here once `enabled` is known. Deactivating keeps the definitions resolvable for
 * rendering while removing them from the model's tool list.
 */
function setP2pToolsActive(pi: ExtensionAPI, active: boolean): void {
  try {
    const current = pi.getActiveTools();
    const next = active ? [...new Set([...current, ...P2P_TOOL_NAMES])] : current.filter(name => !P2P_TOOL_NAMES.includes(name));
    if (next.length !== current.length) pi.setActiveTools(next);
  } catch {
    // Tool activation is unavailable in this runtime (e.g. tests or non-interactive hosts).
  }
}

function clearWidget(ctx: ExtensionContext): void {
  try {
    P2PWidgetController.clearWidget(ctx.ui);
  } catch {
    // UI unavailable - nothing to clear.
  }
}

function disposePreservedService(ctx: ExtensionContext): void {
  const service = resolveP2pCouncilService();
  if (service) {
    clearP2pCouncilService(service);
    service.dispose();
  }
  clearWidget(ctx);
}

/** @internal exported only so tests can drive `state` and lifecycle hooks directly. */
export function activateP2pCouncil(
  pi: ExtensionAPI,
  initialCtx: ExtensionContext,
  deps: { config: ConfigProvider },
): { state: P2pCouncilState; bindingToken: P2pCouncilBindingToken } {
  let latestCtx: ExtensionContext = initialCtx;
  const registry = new CouncilRegistry();
  let state!: P2pCouncilState;

  const runtime: P2pCouncilRuntimeBinding = {
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
    deliverBatch: items => {
      pi.sendMessage(
        {
          customType: 'p2p_council',
          content: formatPeerBatch(items),
          display: true,
          details: { kind: 'batch', delivery: 'trigger_when_idle', items },
        },
        { triggerTurn: true },
      );
    },
    deliverSteer: (content, from) => {
      const item = { from, content };
      pi.sendMessage(
        {
          customType: 'p2p_council',
          content: formatPeerMessage(item),
          display: true,
          details: { kind: 'steer', delivery: 'steer', items: [item] },
        },
        { triggerTurn: false, deliverAs: 'steer' },
      );
    },
    runRemotePrompt: (from, prompt) => {
      const item = { from, content: prompt };
      pi.sendMessage(
        {
          customType: 'p2p_council',
          content: formatRemotePrompt(item),
          display: true,
          details: { kind: 'remote_prompt', delivery: 'remote_prompt', items: [item] },
        },
        { triggerTurn: true },
      );
    },
    notify: (message, level) => {
      try {
        latestCtx.ui.notify(`p2p-council: ${message}`, level);
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

  const existing = resolveP2pCouncilService();
  if (existing) {
    state = existing;
  } else {
    const identity = resolveP2pIdentity(initialCtx.cwd);
    state = installP2pCouncilService(
      new P2pCouncilState({
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
      clearP2pCouncilService(state);
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

  const openModal = async (ctx: ExtensionContext) => {
    if (ctx.mode !== 'tui') {
      ctx.ui.notify(`/${COMMAND_NAME} requires TUI mode.`, 'warning');
      return;
    }
    await openP2pCouncilModal(ctx, state, registry, deps.config.getP2pCouncil().layout);
  };

  pi.registerCommand(COMMAND_NAME, {
    description: 'Connect to, browse, or create p2p-council networks',
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
      latestCtx.ui.notify(`p2p-council: failed to open modal: ${error instanceof Error ? error.message : String(error)}`, 'error');
    });
  });

  return { state, bindingToken };
}

/**
 * Registers render surfaces eagerly and council state lazily.
 *
 * Rendering must be registered during extension load: when Pi replays persisted history it
 * captures the custom-message renderer and the tool definition once per component, at
 * construction time. Registering them from a `session_start` handler leaves every restored
 * `p2p_council` message and p2p tool call stuck on Pi's fallback rendering for the life of the
 * session.
 *
 * Registration is deliberately unconditional: config is only loaded during `session_start`
 * (see `index.ts`) and project-local config must not be read before trust is resolved, so
 * `enabled` is not knowable at load time and gating here would register nothing at all.
 * Availability is handled separately via `setP2pToolsActive` once config is known, so a
 * disabled council hides its tools from the model without losing renderers for restored history.
 * Council state stays lazy because it needs a session context.
 */
export function registerP2pCouncil(pi: ExtensionAPI, deps: { config: ConfigProvider }): void {
  let activation: { state: P2pCouncilState; bindingToken: P2pCouncilBindingToken } | undefined;
  const currentState = () => activation?.state;

  pi.registerMessageRenderer('p2p_council', renderP2pCouncilMessage);
  pi.registerTool(createP2pSendTool(currentState));
  pi.registerTool(createP2pAskTool(currentState));
  pi.registerTool(createP2pLsTool(currentState));

  pi.on('session_start', (_event, ctx) => {
    const enabled = deps.config.getP2pCouncil().enabled;
    setP2pToolsActive(pi, enabled);
    if (!enabled) {
      disposePreservedService(ctx);
      return;
    }
    if (activation) return;
    activation = activateP2pCouncil(pi, ctx, deps);
  });
}
