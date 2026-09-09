import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../config/config-loader.ts';
import type { ModelConfig, ReasoningLevel } from '../../schemas/shared-config.schema.ts';
import { DebugLoggerUtil } from '../../utils/debug-logger.util.ts';
import { emitSetAgentNameEvent } from '../../utils/emit-set-agentName-event.util.ts';
import { PiToolManager } from '../../utils/pi-tool-manager.util.ts';
import { SessionRoleState } from './agents/session-role-state.ts';
import type { SubagentDefinition } from './agents/subagent-definition.ts';
import { type PresetSelection, SubAgentModelResolver } from './agents/subagent-model-resolver.ts';
import { discoverSubagentPaths, SUBAGENT_PROMPTS_DIRECTORY } from './agents/subagent-paths.ts';
import { SubAgentRegistry } from './agents/subagent-registry.ts';
import { AGENT_COLORS, COMMAND_NAME, MULTIVERSE_DEBUG, PI_VIM_KEY_EVENT_ID } from './constants.ts';
import { openMultiverseModal } from './modal/open-multiverse-modal.ts';
import { buildMegamindPrompt } from './orchestrator/orchestrator-prompts/megamind.ts';
import { type ParentAgent, ParentAgentState } from './orchestrator/parent-agent.ts';
import type { runSpawn } from './orchestrator/spawn-orchestrator.ts';
import { latestChildInteraction } from './results/child-interaction.ts';
import { ChildAdmissionRegistry } from './runtime/child-admission.ts';
import { ChildSessionRepository } from './runtime/child-session-repository.ts';
import { createSpawnTool, SPAWN_TOOL_NAME } from './tools/spawn/spawn.tool.ts';

export interface MultiverseDependencies {
  config: ConfigProvider;
  roleState?: SessionRoleState;
  parentAgentState?: ParentAgentState;
  definitionsDirectory?: string;
  repository?: ChildSessionRepository;
  spawnRun?: typeof runSpawn;
}

export interface MultiverseActivation {
  roleState: SessionRoleState;
  parentAgentState: ParentAgentState;
}

interface MultiverseRuntime {
  roleState: SessionRoleState;
  parentAgentState: ParentAgentState;
  subAgents: SubAgentRegistry;
  definitionErrors: readonly string[];
  modelResolver: SubAgentModelResolver;
  registeredSubAgentSession?: SubagentDefinition;
}

export function registerMultiverse(pi: ExtensionAPI, dependencies: MultiverseDependencies): MultiverseActivation {
  const roleState = dependencies.roleState ?? new SessionRoleState();
  const parentAgentState = dependencies.parentAgentState ?? new ParentAgentState();
  const repository = dependencies.repository ?? new ChildSessionRepository();
  const admission = new ChildAdmissionRegistry();
  const subAgents = new SubAgentRegistry();
  const discovered = discoverSubagentPaths(dependencies.definitionsDirectory ?? SUBAGENT_PROMPTS_DIRECTORY);
  const definitionErrors = [...discovered.errors, ...subAgents.register(discovered.paths)];
  // Selection is deliberately extension-local: session starts reset it and switches never append entries.
  const modelResolver = new SubAgentModelResolver(dependencies.config.getMultiverse());
  const runtime: MultiverseRuntime = { roleState, parentAgentState, subAgents, definitionErrors, modelResolver };

  pi.registerTool(
    createSpawnTool({
      // Reuse the registry, but read the current model, configuration, and parent branch for each call.
      getExecutionContext: ctx => {
        const settings = dependencies.config.getMultiverse();
        modelResolver.updateConfig(settings);
        if (!settings.enabled || roleState.get().kind !== 'parent' || parentAgentState.getActive() !== 'megamind') {
          return undefined;
        }
        if (!ctx.model) return { error: 'spawn requires a selected model.' };
        // Snapshot composed settings now, before this spawn call can queue any work. Later
        // preset changes must not alter queued continuations in this batch.
        const selection = modelResolver.currentSelection();
        const models = new Map<string, Partial<ModelConfig>>(
          subAgents.availableSubAgents.map(agent => [agent.name, modelResolver.resolveModel(agent.name, selection)]),
        );
        const agentModel = (name: string) => models.get(name);
        return {
          cwd: ctx.cwd,
          parentSessionId: ctx.sessionManager.getSessionId(),
          repository,
          admission,
          maxConcurrency: settings.maxConcurrency,
          model: ctx.model,
          thinkingLevel: ctx.thinkingLevel ?? 'off',
          registry: ctx.modelRegistry,
          subagentModel: agentModel,
          subagentReasoning: name => agentModel(name)?.reasoning,
          getSubAgent: name => subAgents.getSubAgent(name),
          resolveContinuation: id => latestChildInteraction(ctx.sessionManager.getBranch(), id),
        };
      },
      availableAgents: () => subAgents.availableSubAgents.map(agent => agent.name),
      appendManifest: (customType, manifest) => pi.appendEntry(customType, manifest),
      run: dependencies.spawnRun,
    }),
  );

  let activated = false;
  pi.on('session_start', (_event, ctx) => {
    const settings = dependencies.config.getMultiverse();
    modelResolver.reset(settings);
    if (!settings.enabled) {
      PiToolManager.removeActive(pi, [SPAWN_TOOL_NAME]);
      return;
    }
    if (activated) return;
    activated = true;
    activateMultiverse(pi, dependencies, runtime, ctx);
  });

  return { roleState, parentAgentState };
}

/** Install enabled-only command, key-event, prompt, and activation behavior. */
function activateMultiverse(pi: ExtensionAPI, dependencies: MultiverseDependencies, runtime: MultiverseRuntime, initialCtx: ExtensionContext): void {
  const { roleState, parentAgentState, subAgents, definitionErrors } = runtime;
  let latestCtx = initialCtx;

  //--- Internal Session Logic START ---
  const config = dependencies.config.getMultiverse();
  subAgents.resolveAvailability(config);
  for (const error of definitionErrors) initialCtx.ui.notify(`pi-arsenal: ${error}`, 'error');
  const roster = subAgents.availableSubAgents;
  const tools = new Set(pi.getAllTools().map(tool => tool.name));
  for (const agent of roster) {
    const unknown = agent.tools.filter(name => !tools.has(name));
    if (unknown.length) {
      initialCtx.ui.notify(`pi-arsenal: ${agent.filePath}: unknown tools: ${unknown.join(', ')}. Agent remains available.`, 'warning');
    }
  }

  const entries = initialCtx.sessionManager.getEntries();
  const role = roleState.classify(entries);
  if (role.kind !== 'parent') {
    let childError: string | undefined;
    if (role.kind === 'invalid-child') childError = role.error;
    else {
      const registered = subAgents.getSubAgent(role.identity.agent);
      if (registered?.enabled) {
        runtime.registeredSubAgentSession = registered.agent;
        emitSetAgentNameEvent(pi, { name: registered.agent.name, color: registered.agent.color, delay: 10 }); //delay as not to conflict with pi-qol own session_start event
      } else {
        childError = `Subagent "${role.identity.agent}" is ${registered ? 'disabled' : 'not registered'}.`;
      }
    }
    PiToolManager.overrideActive(pi, runtime.registeredSubAgentSession?.tools ?? []);
    if (childError) initialCtx.ui.notify(`pi-arsenal: ${childError}`, 'error');
  } else {
    const preferred = parentAgentState.restore(entries, config.defaultAgent);
    const active = preferred === 'megamind' && roster.length > 0 ? 'megamind' : 'default';

    parentAgentState.setActive(active);
    if (active === 'megamind') PiToolManager.addActive(pi, [SPAWN_TOOL_NAME]);
    else PiToolManager.removeActive(pi, [SPAWN_TOOL_NAME]);
    if (!roster.length) initialCtx.ui.notify('pi-arsenal: No enabled valid Multiverse subagent is available; using Default.', 'warning');
    emitSetAgentNameEvent(pi, { name: active, color: active === 'megamind' ? AGENT_COLORS.megamind : undefined, delay: 10 }); //delay as not to conflict with pi-qol own session_start event
  }
  //--- Internal Session Logic END ---

  pi.on('before_agent_start', event => {
    if (runtime.registeredSubAgentSession) {
      if (MULTIVERSE_DEBUG) {
        DebugLoggerUtil.logToMarkdown(runtime.registeredSubAgentSession.name, {
          header: 'System Prompt',
          contents: [event.systemPrompt, '', 'Expected Subagent Prompt:', '', runtime.registeredSubAgentSession.prompt],
        });
      }

      return { systemPrompt: runtime.registeredSubAgentSession.prompt };
    }

    if (roleState.get().kind === 'parent' && parentAgentState.getActive() === 'megamind') {
      const config = dependencies.config.getMultiverse();
      const systemPrompt = `${event.systemPrompt}\n\n${buildMegamindPrompt(subAgents.availableSubAgents, config.maxConcurrency)}`;

      if (MULTIVERSE_DEBUG) DebugLoggerUtil.logToMarkdown(parentAgentState.getActive(), { header: 'System Prompt', contents: [systemPrompt] });

      return { systemPrompt };
    }
  });

  const selectParentAgent = (agent: ParentAgent): void => {
    parentAgentState.select(agent, (customType, selection) => pi.appendEntry(customType, selection));
    parentAgentState.setActive(agent);
    if (agent === 'megamind') PiToolManager.addActive(pi, [SPAWN_TOOL_NAME]);
    else PiToolManager.removeActive(pi, [SPAWN_TOOL_NAME]);
    emitSetAgentNameEvent(pi, { name: agent, color: agent === 'megamind' ? AGENT_COLORS.megamind : undefined });
  };

  const openModal = async (ctx: ExtensionContext): Promise<void> => {
    if (ctx.mode !== 'tui') {
      ctx.ui.notify(`/${COMMAND_NAME} requires TUI mode.`, 'warning');
      return;
    }
    const settings = dependencies.config.getMultiverse();
    runtime.modelResolver.updateConfig(settings);

    const buildPresetTabState = (
      resolver: SubAgentModelResolver,
      config: ReturnType<ConfigProvider['getMultiverse']>,
      agentNames: readonly string[],
      ctx: ExtensionContext,
    ) => {
      const selections: PresetSelection[] = [{ kind: 'baseline' }];
      for (const name of Object.keys(config.presets ?? {})) selections.push({ kind: 'named', name });
      return {
        selection: resolver.currentSelection(),
        options: selections.map(selection => ({
          selection,
          agents: agentNames.map(name => ({ name, model: resolver.resolveModel(name, selection) })),
        })),
        parentModel: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined,
        parentReasoning: ctx.thinkingLevel as ReasoningLevel | undefined,
      };
    };

    const result = await openMultiverseModal(ctx, {
      activeAgent: parentAgentState.getActive(),
      role: roleState.get(),
      megamindAvailable: subAgents.availableSubAgents.length > 0,
      presets: buildPresetTabState(
        runtime.modelResolver,
        settings,
        subAgents.availableSubAgents.map(agent => agent.name),
        ctx,
      ),
    });

    if (result.action === 'select') selectParentAgent(result.agent);
    // Keep preset selection parent-only even if a stale or synthetic modal result is returned.
    if (result.action === 'select-preset' && roleState.get().kind === 'parent') {
      runtime.modelResolver.select(result.selection);
    }
  };

  pi.registerCommand(COMMAND_NAME, {
    description: 'Switch Multiverse personas, browse child sessions, or select model presets',
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
      latestCtx.ui.notify(`multiverse: failed to open modal: ${error instanceof Error ? error.message : String(error)}`, 'error');
    });
  });
}
