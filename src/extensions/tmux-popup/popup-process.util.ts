import { spawn } from 'node:child_process';

export type PopupLaunchResult = { success: true } | { success: false; error: string };

/**
 * Launch a detached tmux display-popup process.
 *
 * Invokes tmux with the configured dimensions and `-E`, passing the popup
 * shell command as a single argument. The child is detached, its stdio is
 * ignored, and the returned promise resolves as soon as the process spawns.
 */
export function launchTmuxPopup(width: number, height: number, popupCommand: string): Promise<PopupLaunchResult> {
  return new Promise(resolve => {
    const child = spawn('tmux', ['display-popup', '-w', `${width}%`, '-h', `${height}%`, '-E', popupCommand], {
      detached: true,
      stdio: 'ignore',
    });

    child.on('spawn', () => {
      child.unref();
      resolve({ success: true });
    });

    child.on('error', error => {
      resolve({ success: false, error: `Failed to start tmux popup: ${error.message}` });
    });
  });
}
