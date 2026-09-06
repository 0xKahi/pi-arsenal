import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

type ToolAPI = Pick<ExtensionAPI, 'getActiveTools' | 'getAllTools' | 'setActiveTools'>;

export class PiToolManager {
  private constructor() {}

  static removeActive(pi: ToolAPI, tools: readonly string[]): void {
    const current = pi.getActiveTools();
    const next = current.filter(name => !tools.includes(name));
    if (next.length !== current.length) pi.setActiveTools(next);
  }

  static addActive(pi: ToolAPI, tools: readonly string[]): void {
    const current = pi.getActiveTools();
    const next = [...new Set([...current, ...tools])];
    if (next.length !== current.length) pi.setActiveTools(next);
  }

  static overrideActive(pi: ToolAPI, tools: readonly string[]): void {
    const next = pi
      .getAllTools()
      .map(tool => tool.name)
      .filter(name => tools.includes(name));
    pi.setActiveTools(next);
  }
}
