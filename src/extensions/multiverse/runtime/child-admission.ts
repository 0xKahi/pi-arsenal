import type { ChildInteraction } from '../results/child-interaction.types.ts';

export class ChildAdmissionRegistry {
  private readonly active = new Set<string>();

  acquire(childSessionId: string): () => void {
    if (this.active.has(childSessionId)) throw new Error(`Child session "${childSessionId}" already has an active Multiverse writer.`);
    this.active.add(childSessionId);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active.delete(childSessionId);
    };
  }
}

export function validateDistinctContinueTargets(references: Array<Pick<ChildInteraction, 'childSessionId'>>): void {
  const seen = new Set<string>();
  for (const reference of references) {
    if (seen.has(reference.childSessionId)) throw new Error(`Duplicate continuation target "${reference.childSessionId}" in one batch.`);
    seen.add(reference.childSessionId);
  }
}
