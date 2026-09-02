import type { Api, Model } from '@earendil-works/pi-ai';
import { clampThinkingLevel } from '@earendil-works/pi-ai/compat';
import type { ReasoningLevel } from '../../../schemas/shared-config.schema.ts';

export function resolveChildReasoning(
  model: Model<Api>,
  requested: ReasoningLevel | undefined,
  parentReasoning: ReasoningLevel | undefined,
): ReasoningLevel {
  return clampThinkingLevel(model, requested ?? parentReasoning ?? 'medium');
}
