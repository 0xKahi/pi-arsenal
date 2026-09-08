import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

type SetAgentNameEventOpts = {
  name: string;
  color?: string;
  delay?: number;
};

export function emitSetAgentNameEvent(pi: ExtensionAPI, opts: SetAgentNameEventOpts): void {
  const emit = (): void => {
    pi.events.emit('pi.qol.event:set-agent-name', {
      agentName: opts.name.toUpperCase(),
      ...(opts.color ? { color: opts.color } : {}),
    });
  };

  if (opts.delay && opts.delay > 0) {
    setTimeout(emit, opts.delay);
    return;
  }

  emit();
}
