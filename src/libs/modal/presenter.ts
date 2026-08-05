import type { ExtensionUIContext, KeybindingsManager, Theme } from '@earendil-works/pi-coding-agent';
import type { Component, TUI } from '@earendil-works/pi-tui';
import type { ModalFrame } from './modal-dialog';

/** Semantic presentation choices for host-mounted modal dialogs. */
export type ModalLayout = 'inline' | 'overlay';

export type ModalComponentFactory<TResult> = (
  tui: TUI,
  theme: Theme,
  keybindings: KeybindingsManager,
  done: (result: TResult) => void,
  frame: ModalFrame,
) => Component & { dispose?(): void };

/**
 * Mount a modal with a coordinated renderer frame and host presentation.
 *
 * The dialog factory receives the resolved frame while this helper owns the
 * host-specific overlay options, preventing consumers from configuring only
 * one half of an inline/overlay layout.
 */
export function presentModal<TResult>(ui: ExtensionUIContext, layout: ModalLayout, factory: ModalComponentFactory<TResult>): Promise<TResult> {
  const frame: ModalFrame = layout === 'overlay' ? 'bordered' : 'inline';
  const options =
    layout === 'overlay'
      ? {
          overlay: true,
          overlayOptions: {
            anchor: 'center' as const,
            width: '85%' as const,
            margin: 1,
          },
        }
      : undefined;

  return ui.custom((tui, theme, keybindings, done) => factory(tui, theme, keybindings, done, frame), options);
}
