import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { STATUS_WIDGET_KEY } from '../constants';
import type { P2pHubState } from '../p2p-hub-state';
import { renderStatusWidgetLines } from './status-widget.util';

/**
 * Sync the below-editor status box to the current connection state.
 * Uses `setWidget(..., { placement: 'belowEditor' })` exclusively - never
 * touches `setFooter`, so custom footers installed by other plugins are
 * never affected. Hides the widget entirely when disconnected.
 */
export function updateStatusWidget(ui: ExtensionUIContext, state: P2pHubState): void {
  if (!state.isConnected()) {
    ui.setWidget(STATUS_WIDGET_KEY, undefined, { placement: 'belowEditor' });
    return;
  }
  const lines = renderStatusWidgetLines(state.getRoster());
  ui.setWidget(STATUS_WIDGET_KEY, lines, { placement: 'belowEditor' });
}

/** Remove the widget unconditionally, for use during deactivation/disable. */
export function clearStatusWidget(ui: ExtensionUIContext): void {
  ui.setWidget(STATUS_WIDGET_KEY, undefined, { placement: 'belowEditor' });
}
