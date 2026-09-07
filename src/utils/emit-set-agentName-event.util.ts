import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

type SetAgentNameEventOpts = {
  name: string;
  color?: string;
};

export function emitSetAgentNameEvent(pi: ExtensionAPI, opts: SetAgentNameEventOpts): void {
  pi.events.emit('pi.qol.event:set-agent-name', {
    agentName: opts.name.toUpperCase(),
    ...(opts.color ? { color: opts.color } : {}),
  });
}
