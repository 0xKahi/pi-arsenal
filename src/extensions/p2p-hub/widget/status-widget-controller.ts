import type { ExtensionUIContext } from '@earendil-works/pi-coding-agent';
import { STATUS_WIDGET_KEY } from '../constants';
import { FormatUtil } from '../format.util';
import type { P2pHubState } from '../p2p-hub-state';

export class P2PWidgetController {
  static clearWidget(ui: ExtensionUIContext) {
    P2PWidgetController.updateWidget({ ui, content: undefined });
  }

  static renderWidget(ui: ExtensionUIContext, state: P2pHubState) {
    if (!state.isConnected()) {
      P2PWidgetController.clearWidget(ui);
      return;
    }
    const content = P2PWidgetController.getWidgetContent(state);
    P2PWidgetController.updateWidget({ ui, content });
  }

  private static getWidgetContent(state: P2pHubState): string[] {
    const roster = state.getRoster();
    const rows = roster.map(entry => {
      const dot = FormatUtil.statusDot(entry.status);
      const model = entry.identity.model ? ` ${entry.identity.model}` : '';
      const bar = entry.identity.context ? ` ${FormatUtil.formatContextBar(entry.identity.context)}` : '';
      return ` ${dot} ${entry.identity.name}${model}${bar}`;
    });

    const title = ` ${state.getHubName()} `;
    const countLabel = ` ${roster.length} `;
    // Content width: the span between the two frame corners, sized to fit the
    // widest row, the title, and the count label.
    const contentWidth = Math.max(title.length + 2, countLabel.length + 2, ...rows.map(row => row.length), 20);

    const top = `┏━${title}${'━'.repeat(Math.max(0, contentWidth - 1 - title.length))}┓`;
    const bottomFill = Math.max(0, contentWidth - 1 - countLabel.length);
    const bottom = `┗${'━'.repeat(bottomFill)}${countLabel}━┛`;
    const paddedRows = rows.map(row => row.padEnd(contentWidth));

    return [top, ...paddedRows, bottom];
  }

  private static updateWidget({ ui, content }: { ui: ExtensionUIContext; content: string[] | undefined }) {
    ui.setWidget(STATUS_WIDGET_KEY, content, { placement: 'belowEditor' });
  }
}
