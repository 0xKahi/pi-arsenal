import type { ExtensionAPI, Skill } from '@earendil-works/pi-coding-agent';

export function getAvailableSkillNames(pi: Pick<ExtensionAPI, 'getCommands'>): string[] {
  return pi
    .getCommands()
    .filter(command => command.source === 'skill' && command.name.startsWith('skill:'))
    .map(command => command.name.slice('skill:'.length));
}

export function filterSkillsByName(skills: readonly Skill[], allowedNames: readonly string[]): Skill[] {
  const allowed = new Set(allowedNames);
  return skills.filter(skill => allowed.has(skill.name));
}
