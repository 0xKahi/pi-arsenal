import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ConfigProvider } from '../../config/config-loader.ts';
import { resolveCurrentSubagent } from './agents/current-subagent.ts';
import { SessionRoleState } from './agents/session-role-state.ts';
import { getAvailableSkillNames } from './agents/skill-policy.ts';
import { BUNDLED_SUBAGENT_PROMPTS_DIRECTORY, type BundledSubagentName } from './agents/subagent-definition.ts';
import { resolveMegamindEligibility } from './orchestrator/megamind.ts';
import { MEGAMIND_PROMPT_INTRO } from './orchestrator/megamind-prompt.ts';
import { type ParentAgent, ParentAgentState } from './orchestrator/parent-agent.ts';
import type { runSpawn, SpawnOrchestratorDependencies } from './orchestrator/spawn-orchestrator.ts';
import { latestChildInteraction } from './results/child-interaction-lookup.ts';
import { ChildAdmissionRegistry } from './runtime/child-admission.ts';
import { ChildSessionRepository } from './runtime/child-session-repository.ts';
import { createSpawnTool, SPAWN_TOOL_NAME } from './tools/spawn/spawn.tool.ts';

export interface MultiverseDependencies {
  config: ConfigProvider;
  roleState?: SessionRoleState;
  parentAgentState?: ParentAgentState;
  definitionsDirectory?: string;
  availableSkills?: () => Iterable<string>;
  megamindPromptIntro?: () => string;
  repository?: ChildSessionRepository;
  spawnRun?: typeof runSpawn;
}

export interface MultiverseActivation {
  roleState: SessionRoleState;
  parentAgentState: ParentAgentState;
  /** Persona switch for parent sessions. The command and shortcut that call it are added last. */
  selectParentAgent: (agent: ParentAgent, ctx: ExtensionContext) => { ok: true } | { ok: false; error: string };
}

export function registerMultiverse(pi: ExtensionAPI, dependencies: MultiverseDependencies): MultiverseActivation {
  const roleState = dependencies.roleState ?? new SessionRoleState();
  const parentAgentState = dependencies.parentAgentState ?? new ParentAgentState();
  const repository = dependencies.repository ?? new ChildSessionRepository();
  const admission = new ChildAdmissionRegistry();
  const definitionsDirectory = dependencies.definitionsDirectory ?? BUNDLED_SUBAGENT_PROMPTS_DIRECTORY;

  const environment = () => ({
    config: dependencies.config.getMultiverse(),
    definitionsDirectory,
    availableTools: pi.getAllTools().map(tool => tool.name),
    availableSkills: dependencies.availableSkills?.() ?? getAvailableSkillNames(pi),
  });

  const resolveMegamind = () =>
    resolveMegamindEligibility({ ...environment(), promptIntro: dependencies.megamindPromptIntro?.() ?? MEGAMIND_PROMPT_INTRO });
  const resolveChild = (name: BundledSubagentName) => resolveCurrentSubagent({ name, ...environment() });

  /** spawn is only callable from a parent session whose active persona is an eligible Megamind. */
  const resolveSpawnHost = (ctx: ExtensionContext): SpawnOrchestratorDependencies | { error: string } | undefined => {
    if (roleState.get().kind !== 'parent') return undefined;
    if (parentAgentState.getActive() !== 'megamind') return undefined;
    const eligibility = resolveMegamind();
    if (!eligibility.eligible) return { error: `spawn is unavailable: ${eligibility.reason}` };
    if (!ctx.model) return { error: 'spawn requires a selected model.' };

    return {
      cwd: ctx.cwd,
      parentSessionId: ctx.sessionManager.getSessionId(),
      repository,
      admission,
      maxConcurrency: dependencies.config.getMultiverse().maxConcurrency,
      model: ctx.model,
      thinkingLevel: ctx.thinkingLevel ?? 'off',
      registry: ctx.modelRegistry,
      subagentModel: name => dependencies.config.getMultiverse().subagents[name].model,
      subagentReasoning: name => dependencies.config.getMultiverse().subagents[name].model?.reasoning,
      resolveSubagent: resolveChild,
      resolveContinuation: childSessionId => latestChildInteraction(ctx.sessionManager.getEntries(), childSessionId),
    };
  };

  pi.registerTool(
    createSpawnTool({
      resolve: resolveSpawnHost,
      availableAgents: () => {
        const eligibility = resolveMegamind();
        return eligibility.eligible ? [...eligibility.roster.keys()] : [];
      },
      // `ctx` only exposes a read-only session manager, so the manifest is persisted through
      // the extension API in closure. Custom entries stay out of LLM context, and no renderer
      // is registered, so the manifest stays invisible to the user's transcript too.
      appendManifest: (customType, manifest) => pi.appendEntry(customType, manifest),
      run: dependencies.spawnRun,
    }),
  );

  /** Active tools are reapplied after extension discovery and before the first child turn. */
  const applyChildTools = (agent: BundledSubagentName, ctx: ExtensionContext): void => {
    const resolved = resolveChild(agent);
    if (!resolved.success) {
      pi.setActiveTools([]);
      ctx.ui.notify(`pi-arsenal: ${resolved.error}`, 'error');
      return;
    }
    pi.setActiveTools(resolved.definition.tools);
  };

  const applyParentTools = (): void => {
    const active = pi.getActiveTools().filter(name => name !== SPAWN_TOOL_NAME);
    // Persona and tool switch together from the next turn.
    pi.setActiveTools(parentAgentState.getActive() === 'megamind' && resolveMegamind().eligible ? [...active, SPAWN_TOOL_NAME] : active);
  };

  /**
   * Switch the parent persona. Child sessions are not parents and never become one:
   * a child's identity, prompt, and tools come from its subagent definition alone, so a
   * switch there is refused before anything is persisted and no parent-agent entry is
   * ever written into a child session.
   */
  const selectParentAgent = (agent: ParentAgent, ctx: ExtensionContext): { ok: true } | { ok: false; error: string } => {
    const role = roleState.get();
    if (role.kind !== 'parent') return { ok: false, error: 'Parent agents cannot be switched inside a subagent session.' };

    parentAgentState.select(agent, (customType, data) => pi.appendEntry(customType, data));
    if (agent === 'default') {
      parentAgentState.setActive('default');
      applyParentTools();
      return { ok: true };
    }

    const eligibility = resolveMegamind();
    parentAgentState.setActive(eligibility.eligible ? 'megamind' : 'default');
    if (!eligibility.eligible) ctx.ui.notify(`pi-arsenal: Megamind unavailable; using Default. ${eligibility.reason}`, 'warning');
    applyParentTools();
    return { ok: true };
  };

  pi.on('session_start', (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();
    const role = roleState.classify(entries);
    if (role.kind === 'invalid-child') {
      pi.setActiveTools([]);
      ctx.ui.notify(`pi-arsenal: ${role.error}`, 'error');
      return;
    }
    if (role.kind === 'child') {
      // Parent-agent entries carry no meaning in a child session and are never restored here.
      applyChildTools(role.identity.agent, ctx);
      return;
    }

    const config = dependencies.config.getMultiverse();
    const preferred = parentAgentState.restore(entries, config.defaultAgent);
    if (preferred === 'default') {
      parentAgentState.setActive('default');
      applyParentTools();
      return;
    }

    const eligibility = resolveMegamind();
    parentAgentState.setActive(eligibility.eligible ? 'megamind' : 'default');
    if (!eligibility.eligible) ctx.ui.notify(`pi-arsenal: Megamind unavailable; using Default. ${eligibility.reason}`, 'warning');
    applyParentTools();
  });

  pi.on('before_agent_start', (event, ctx) => {
    const role = roleState.get();
    if (role.kind === 'invalid-child') return;
    if (role.kind === 'child') {
      const resolved = resolveChild(role.identity.agent);
      if (!resolved.success) {
        ctx.ui.notify(`pi-arsenal: ${resolved.error}`, 'error');
        return;
      }
      return { systemPrompt: resolved.definition.prompt };
    }

    if (parentAgentState.getActive() !== 'megamind') {
      applyParentTools();
      return;
    }
    const eligibility = resolveMegamind();
    if (!eligibility.eligible) {
      parentAgentState.setActive('default');
      applyParentTools();
      ctx.ui.notify(`pi-arsenal: Megamind unavailable; using Default. ${eligibility.reason}`, 'warning');
      return;
    }
    applyParentTools();
    return { systemPrompt: `${event.systemPrompt}\n\n${eligibility.prompt}` };
  });

  return { roleState, parentAgentState, selectParentAgent };
}
