import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../config/config-loader.ts';
import { emitSetAgentNameEvent } from '../../utils/emit-set-agentName-event.util.ts';
import { PiToolManager } from '../../utils/pi-tool-manager.util.ts';
import { SessionRoleState } from './agents/session-role-state.ts';
import type { SubagentDefinition } from './agents/subagent-definition.ts';
import { discoverSubagentPaths, SUBAGENT_PROMPTS_DIRECTORY } from './agents/subagent-paths.ts';
import { SubAgentRegistry } from './agents/subagent-registry.ts';
import { AGENT_COLORS } from './constants.ts';
import { buildMegamindPrompt } from './orchestrator/orchestrator-prompts/megamind.ts';
import { ParentAgentState } from './orchestrator/parent-agent.ts';
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

export function registerMultiverse(pi: ExtensionAPI, dependencies: MultiverseDependencies): MultiverseActivation {
  const roleState = dependencies.roleState ?? new SessionRoleState();
  const parentAgentState = dependencies.parentAgentState ?? new ParentAgentState();
  const repository = dependencies.repository ?? new ChildSessionRepository();
  const admission = new ChildAdmissionRegistry();
  const subAgents = new SubAgentRegistry();
  const discovered = discoverSubagentPaths(dependencies.definitionsDirectory ?? SUBAGENT_PROMPTS_DIRECTORY);
  const definitionErrors = [...discovered.errors, ...subAgents.register(discovered.paths)];

  let registeredSubAgentSession: SubagentDefinition | undefined;

  pi.registerTool(
    createSpawnTool({
      // Reuse the registry, but read the current model, configuration, and parent branch for each call.
      getExecutionContext: ctx => {
        const settings = dependencies.config.getMultiverse();
        if (!settings.enabled || roleState.get().kind !== 'parent' || parentAgentState.getActive() !== 'megamind') {
          return undefined;
        }
        if (!ctx.model) return { error: 'spawn requires a selected model.' };
        const agentModel = (name: string) => (Object.hasOwn(settings.subagents, name) ? settings.subagents[name]?.model : undefined);
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

  pi.on('session_start', (_event, ctx) => {
    const config = dependencies.config.getMultiverse();
    registeredSubAgentSession = undefined;
    roleState.classify([]);
    parentAgentState.setActive('default');
    if (!config.enabled) {
      PiToolManager.removeActive(pi, [SPAWN_TOOL_NAME]);
      return;
    }

    subAgents.resolveAvailability(config);
    for (const error of definitionErrors) ctx.ui.notify(`pi-arsenal: ${error}`, 'error');
    const roster = subAgents.availableSubAgents;
    const tools = new Set(pi.getAllTools().map(tool => tool.name));
    for (const agent of roster) {
      const unknown = agent.tools.filter(name => !tools.has(name));
      if (unknown.length) ctx.ui.notify(`pi-arsenal: ${agent.filePath}: unknown tools: ${unknown.join(', ')}. Agent remains available.`, 'warning');
    }

    const entries = ctx.sessionManager.getEntries();
    const role = roleState.classify(entries);
    if (role.kind !== 'parent') {
      let childError: string | undefined;
      if (role.kind === 'invalid-child') childError = role.error;
      else {
        const registered = subAgents.getSubAgent(role.identity.agent);
        if (registered?.enabled) {
          registeredSubAgentSession = registered.agent;
          emitSetAgentNameEvent(pi, { name: registered.agent.name, color: registered.agent.color });
        } else {
          childError = `Subagent "${role.identity.agent}" is ${registered ? 'disabled' : 'not registered'}.`;
        }
      }
      PiToolManager.overrideActive(pi, registeredSubAgentSession?.tools ?? []);
      if (childError) ctx.ui.notify(`pi-arsenal: ${childError}`, 'error');
      return;
    }

    const preferred = parentAgentState.restore(entries, config.defaultAgent);
    const active = preferred === 'megamind' && roster.length > 0 ? 'megamind' : 'default';

    parentAgentState.setActive(active);
    if (active === 'megamind') {
      PiToolManager.addActive(pi, [SPAWN_TOOL_NAME]);
    } else {
      PiToolManager.removeActive(pi, [SPAWN_TOOL_NAME]);
    }
    if (!roster.length) ctx.ui.notify('pi-arsenal: No enabled valid Multiverse subagent is available; using Default.', 'warning');
    emitSetAgentNameEvent(pi, { name: active, color: active === 'megamind' ? AGENT_COLORS.megamind : undefined });
  });

  pi.on('before_agent_start', event => {
    const config = dependencies.config.getMultiverse();
    if (!config.enabled) return;
    if (registeredSubAgentSession) return { systemPrompt: registeredSubAgentSession.prompt };
    if (roleState.get().kind === 'parent' && parentAgentState.getActive() === 'megamind') {
      return { systemPrompt: `${event.systemPrompt}\n\n${buildMegamindPrompt(subAgents.availableSubAgents, config.maxConcurrency)}` };
    }
  });

  return { roleState, parentAgentState };
}
