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
