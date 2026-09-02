import type { Api, Model } from '@earendil-works/pi-ai';
import type { ModelRegistry } from '@earendil-works/pi-coding-agent';
import type { ModelConfig } from '../../../schemas/shared-config.schema.ts';

export type SubagentModelConfig = Partial<ModelConfig>;

type RequestAuth =
  | { ok: true; apiKey?: string; headers?: Record<string, string | null>; baseUrl?: string; env?: Record<string, string> }
  | { ok: false; error: string };

export type ModelResolutionResult =
  | { success: true; model: Model<Api>; auth: Extract<RequestAuth, { ok: true }>; failures: string[] }
  | { success: false; error: string; failures: string[] };

export interface ModelResolutionRegistry {
  find(provider: string, modelId: string): Model<Api> | undefined;
  getApiKeyAndHeaders(model: Model<Api>): Promise<RequestAuth>;
}

export async function resolveSubagentModel(input: {
  configured?: SubagentModelConfig;
  parentModel?: Model<Api>;
  registry: ModelResolutionRegistry | Pick<ModelRegistry, 'find' | 'getApiKeyAndHeaders'>;
}): Promise<ModelResolutionResult> {
  const failures: string[] = [];
  const candidates: Model<Api>[] = [];
  const configured = input.configured;

  if (configured && (configured.provider || configured.modelId)) {
    const provider = configured.provider ?? input.parentModel?.provider;
    const modelId = configured.modelId ?? input.parentModel?.id;
    if (!provider || !modelId) {
      failures.push('Configured subagent model is incomplete and cannot inherit missing fields because no parent model is selected.');
    } else {
      const model = input.registry.find(provider, modelId);
      if (model) candidates.push(model);
      else failures.push(`Configured model ${provider}/${modelId} was not found.`);
    }
  }

  if (input.parentModel && !candidates.some(model => model.provider === input.parentModel?.provider && model.id === input.parentModel?.id)) {
    candidates.push(input.parentModel);
  } else if (!input.parentModel && candidates.length === 0) {
    failures.push('No parent model is selected for fallback.');
  }

  for (const model of candidates) {
    let auth: RequestAuth;
    try {
      auth = await input.registry.getApiKeyAndHeaders(model);
    } catch (error) {
      failures.push(`${model.provider}/${model.id} authentication lookup failed: ${formatError(error)}`);
      continue;
    }
    if (auth.ok) return { success: true, model, auth, failures };
    failures.push(`${model.provider}/${model.id} authentication failed: ${auth.error}`);
  }

  return {
    success: false,
    error: `No usable model candidate. ${failures.join(' ')}`,
    failures,
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
