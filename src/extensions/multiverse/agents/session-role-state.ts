import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { type SubagentIdentity, SubagentIdentityHandler } from './session-identity.ts';

export type SessionRole = { kind: 'parent' } | { kind: 'child'; identity: SubagentIdentity } | { kind: 'invalid-child'; error: string };

export class SessionRoleState {
  private role: SessionRole = { kind: 'parent' };

  classify(entries: readonly SessionEntry[]): SessionRole {
    const result = SubagentIdentityHandler.parse(entries);
    switch (result.kind) {
      case 'none':
        this.role = { kind: 'parent' };
        break;
      case 'child':
        this.role = { kind: 'child', identity: result.identity };
        break;
      case 'invalid':
        this.role = { kind: 'invalid-child', error: result.error };
        break;
    }
    return this.role;
  }

  get(): SessionRole {
    return this.role;
  }

  isChild(): boolean {
    return this.role.kind === 'child';
  }
}
