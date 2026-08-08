import type { P2pCouncilState } from './p2p-council-state';

const P2P_COUNCIL_SERVICE_SYMBOL = Symbol.for('pi-arsenal.p2p-council.service');
export const P2P_COUNCIL_SERVICE_VERSION = 1;

interface P2pCouncilServiceCarrier {
  version: typeof P2P_COUNCIL_SERVICE_VERSION;
  service: P2pCouncilState;
}

type GlobalWithP2pCouncil = typeof globalThis & {
  [P2P_COUNCIL_SERVICE_SYMBOL]?: unknown;
};

function globalCarrier(): GlobalWithP2pCouncil {
  return globalThis as GlobalWithP2pCouncil;
}

export function resolveP2pCouncilService(): P2pCouncilState | undefined {
  const value = globalCarrier()[P2P_COUNCIL_SERVICE_SYMBOL];
  if (!value || typeof value !== 'object') return undefined;
  const carrier = value as Partial<P2pCouncilServiceCarrier>;
  return carrier.version === P2P_COUNCIL_SERVICE_VERSION ? carrier.service : undefined;
}

export function installP2pCouncilService(service: P2pCouncilState): P2pCouncilState {
  const existing = resolveP2pCouncilService();
  if (existing) return existing;

  const stale = globalCarrier()[P2P_COUNCIL_SERVICE_SYMBOL] as { service?: { dispose?: () => void } } | undefined;
  try {
    stale?.service?.dispose?.();
  } catch {
    // An incompatible stale implementation is best-effort cleanup only.
  }

  globalCarrier()[P2P_COUNCIL_SERVICE_SYMBOL] = { version: P2P_COUNCIL_SERVICE_VERSION, service } satisfies P2pCouncilServiceCarrier;
  service.subscribeToDispose(() => clearP2pCouncilService(service));
  return service;
}

export function clearP2pCouncilService(service?: P2pCouncilState): void {
  const current = resolveP2pCouncilService();
  if (service && current !== service) return;
  delete globalCarrier()[P2P_COUNCIL_SERVICE_SYMBOL];
}

/** @internal Test/lifecycle helper that also closes any retained transport. */
export function resetP2pCouncilService(): void {
  const service = resolveP2pCouncilService();
  clearP2pCouncilService(service);
  service?.dispose();
}
