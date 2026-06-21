import type { ObjectValues } from './types';

export const EXTENSION_ID = 'pi-arsenal';

const SUB_EXTENSION_IDS = {
  hashline_diff: 'hashline_diff',
} as const;

export type SubExtentionIds = ObjectValues<typeof SUB_EXTENSION_IDS>;

export const piVimKeyEventId = (type: SubExtentionIds, extra: string[] = []) => {
  let id = `pi.vimKeys.event:${EXTENSION_ID}.${type}`;
  extra.forEach(val => {
    id = `${id}.${val}`;
  });
  return id;
};

export const COLOR_HEX_REGEX = /^#[0-9a-fA-F]{6}$/;
