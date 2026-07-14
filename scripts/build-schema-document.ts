import { z } from 'zod';
import { ConfigSchema } from '../src/schemas/config.schema';

export function createConfigJsonSchema(): Record<string, unknown> {
  const jsonSchema = z.toJSONSchema(ConfigSchema, {
    target: 'draft-7',
    unrepresentable: 'any',
    io: 'input',
  }) as Record<string, unknown>;

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://raw.githubusercontent.com/0xKahi/pi-arsenal/main/assets/config.schema.json',
    title: 'Pi Arsenal Extension Configuration',
    description: 'Configuration schema for the pi-arsenal extension',
    ...jsonSchema,
  };
}
