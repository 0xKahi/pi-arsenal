import { describe, expect, it } from 'bun:test';
import type { Api, Model } from '@earendil-works/pi-ai';
import { type ModelResolutionRegistry, resolveSubagentModel } from '../../../../src/extensions/multiverse/runtime/model-resolution.ts';

const model = (provider: string, id: string) => ({ provider, id, name: id }) as Model<Api>;

const registry = (
  models: Model<Api>[],
  auth: Record<string, { ok: true; apiKey?: string; headers?: Record<string, string> } | { ok: false; error: string }>,
): ModelResolutionRegistry => ({
  find: (provider, modelId) => models.find(item => item.provider === provider && item.id === modelId),
  getApiKeyAndHeaders: async candidate => auth[`${candidate.provider}/${candidate.id}`] ?? { ok: false, error: 'no auth' },
});

describe('resolveSubagentModel', () => {
  it('prefers an authenticated configured model', async () => {
    const configured = model('configured-provider', 'configured-model');
    const parent = model('parent-provider', 'parent-model');

    const result = await resolveSubagentModel({
      configured: { provider: configured.provider, modelId: configured.id },
      parentModel: parent,
      registry: registry([configured], {
        'configured-provider/configured-model': { ok: true, apiKey: 'secret' },
        'parent-provider/parent-model': { ok: true, apiKey: 'parent' },
      }),
    });

    expect(result).toMatchObject({ success: true, model: configured, failures: [] });
  });

  it('accepts header-authenticated and keyless configured providers', async () => {
    const headerModel = model('header-provider', 'header-model');
    const headerResult = await resolveSubagentModel({
      configured: { provider: headerModel.provider, modelId: headerModel.id },
      registry: registry([headerModel], { 'header-provider/header-model': { ok: true, headers: { Authorization: 'signed' } } }),
    });
    expect(headerResult.success).toBe(true);

    const keylessModel = model('local', 'keyless');
    const keylessResult = await resolveSubagentModel({
      configured: { provider: keylessModel.provider, modelId: keylessModel.id },
      registry: registry([keylessModel], { 'local/keyless': { ok: true } }),
    });
    expect(keylessResult.success).toBe(true);
  });

  it('falls back to the parent model after configured lookup or authentication failure', async () => {
    const configured = model('configured', 'broken');
    const parent = model('parent', 'working');
    const result = await resolveSubagentModel({
      configured: { provider: configured.provider, modelId: configured.id },
      parentModel: parent,
      registry: registry([configured], {
        'configured/broken': { ok: false, error: 'expired token' },
        'parent/working': { ok: true, apiKey: 'parent-key' },
      }),
    });

    expect(result).toMatchObject({ success: true, model: parent });
    if (result.success) expect(result.failures.join('\n')).toContain('expired token');
  });

  it('inherits omitted configured fields from the parent model', async () => {
    const configured = model('parent-provider', 'alternate');
    const parent = model('parent-provider', 'parent-model');
    const result = await resolveSubagentModel({
      configured: { modelId: 'alternate' },
      parentModel: parent,
      registry: registry([configured], { 'parent-provider/alternate': { ok: true } }),
    });

    expect(result).toMatchObject({ success: true, model: configured });
  });

  it('returns accumulated reasons when no candidate works', async () => {
    const parent = model('parent', 'broken');
    const result = await resolveSubagentModel({
      configured: { provider: 'missing', modelId: 'unknown' },
      parentModel: parent,
      registry: registry([], { 'parent/broken': { ok: false, error: 'missing credential' } }),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('missing/unknown was not found');
      expect(result.error).toContain('parent/broken authentication failed');
      expect(result.error).toContain('missing credential');
    }
  });
});
