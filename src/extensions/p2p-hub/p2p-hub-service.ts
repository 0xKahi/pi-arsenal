import type { P2pHubState } from './p2p-hub-state';

const P2P_HUB_SERVICE_SYMBOL = Symbol.for('pi-arsenal.p2p-hub.service');
export const P2P_HUB_SERVICE_VERSION = 1;

interface P2pHubServiceCarrier {
  version: typeof P2P_HUB_SERVICE_VERSION;
  service: P2pHubState;
}

type GlobalWithP2pHub = typeof globalThis & {
  [P2P_HUB_SERVICE_SYMBOL]?: unknown;
};

function globalCarrier(): GlobalWithP2pHub {
  return globalThis as GlobalWithP2pHub;
}

export function resolveP2pHubService(): P2pHubState | undefined {
  const value = globalCarrier()[P2P_HUB_SERVICE_SYMBOL];
  if (!value || typeof value !== 'object') return undefined;
  const carrier = value as Partial<P2pHubServiceCarrier>;
  return carrier.version === P2P_HUB_SERVICE_VERSION ? carrier.service : undefined;
}

export function installP2pHubService(service: P2pHubState): P2pHubState {
  const existing = resolveP2pHubService();
  if (existing) return existing;

  const stale = globalCarrier()[P2P_HUB_SERVICE_SYMBOL] as { service?: { dispose?: () => void } } | undefined;
  try {
    stale?.service?.dispose?.();
  } catch {
    // An incompatible stale implementation is best-effort cleanup only.
  }

  globalCarrier()[P2P_HUB_SERVICE_SYMBOL] = { version: P2P_HUB_SERVICE_VERSION, service } satisfies P2pHubServiceCarrier;
  service.subscribeToDispose(() => clearP2pHubService(service));
  return service;
}

export function clearP2pHubService(service?: P2pHubState): void {
  const current = resolveP2pHubService();
  if (service && current !== service) return;
  delete globalCarrier()[P2P_HUB_SERVICE_SYMBOL];
}

/** @internal Test/lifecycle helper that also closes any retained transport. */
export function resetP2pHubService(): void {
  const service = resolveP2pHubService();
  clearP2pHubService(service);
  service?.dispose();
}
