/**
 * Wire protocol for p2p-council. Adapted from the pi-link hub-and-spoke protocol
 * with identity fields (model, description) added, and a peek request/response
 * pair for read-only roster queries that never join the council as a member.
 * Remote-compaction messages from pi-link are intentionally not carried over.
 */

import { z } from 'zod';

export type P2pStatus = { kind: 'idle'; since: number } | { kind: 'thinking'; since: number } | { kind: 'tool'; toolName: string; since: number };

export type P2pContextSnapshot = { tokens: number | null; contextWindow: number };

export interface P2pIdentity {
  name: string;
  model?: string;
  description?: string;
  cwd?: string;
  context?: P2pContextSnapshot;
}

export interface RegisterMsg {
  type: 'register';
  name: string;
  model?: string;
  description?: string;
  cwd?: string;
  context?: P2pContextSnapshot;
}

export interface WelcomeMsg {
  type: 'welcome';
  assignedName: string; // possibly deduped by the council
  host: P2pIdentity;
  clients: P2pIdentity[]; // existing clients, excluding this joiner
  statuses: Record<string, P2pStatus>;
}

export interface MemberJoinedMsg {
  type: 'member_joined';
  identity: P2pIdentity;
}

export interface MemberLeftMsg {
  type: 'member_left';
  name: string;
}

export interface ChatMsg {
  type: 'chat';
  from: string;
  to: string;
  content: string;
  triggerTurn: boolean;
}

export interface PromptRequestMsg {
  type: 'prompt_request';
  id: string;
  from: string;
  to: string;
  prompt: string;
}

export interface PromptResponseMsg {
  type: 'prompt_response';
  id: string;
  from: string;
  to: string;
  response: string;
  error?: string;
}

export interface StatusUpdateMsg {
  type: 'status_update';
  name: string;
  status: P2pStatus;
  /** Canonical Pi model ID when present. */
  model?: string;
  /** Absent = no change; null = clear stored value; object = store. */
  context?: P2pContextSnapshot | null;
}

export interface ErrorMsg {
  type: 'error';
  message: string;
}

/** Sent instead of `register` to obtain a roster without joining. */
export interface PeekMsg {
  type: 'peek';
}

export interface PeekResponseMsg {
  type: 'peek_response';
  councilName: string;
  host: P2pIdentity | undefined;
  clients: P2pIdentity[];
  statuses: Record<string, P2pStatus>;
}

export type P2pMessage =
  | RegisterMsg
  | WelcomeMsg
  | MemberJoinedMsg
  | MemberLeftMsg
  | ChatMsg
  | PromptRequestMsg
  | PromptResponseMsg
  | StatusUpdateMsg
  | ErrorMsg
  | PeekMsg
  | PeekResponseMsg;

const memberNameSchema = z.string().min(1).max(128).regex(/^\S+$/);
const boundedString = (max: number) => z.string().max(max);
const contextSchema = z.object({ tokens: z.number().nullable(), contextWindow: z.number() });
const statusSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('idle'), since: z.number() }),
  z.object({ kind: z.literal('thinking'), since: z.number() }),
  z.object({ kind: z.literal('tool'), toolName: boundedString(256), since: z.number() }),
]);
const identitySchema = z.object({
  name: memberNameSchema,
  model: boundedString(256).optional(),
  description: boundedString(1000).optional(),
  cwd: boundedString(4096).optional(),
  context: contextSchema.optional(),
});
const statusesSchema = z.record(memberNameSchema, statusSchema);
const councilNameSchema = z.string().max(256);
const messageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('register'),
    name: memberNameSchema,
    model: boundedString(256).optional(),
    description: boundedString(1000).optional(),
    cwd: boundedString(4096).optional(),
    context: contextSchema.optional(),
  }),
  z.object({
    type: z.literal('welcome'),
    assignedName: memberNameSchema,
    host: identitySchema,
    clients: z.array(identitySchema),
    statuses: statusesSchema,
  }),
  z.object({ type: z.literal('member_joined'), identity: identitySchema }),
  z.object({ type: z.literal('member_left'), name: memberNameSchema }),
  z.object({ type: z.literal('chat'), from: memberNameSchema, to: memberNameSchema, content: z.string(), triggerTurn: z.boolean() }),
  z.object({ type: z.literal('prompt_request'), id: boundedString(256), from: memberNameSchema, to: memberNameSchema, prompt: z.string() }),
  z.object({
    type: z.literal('prompt_response'),
    id: boundedString(256),
    from: memberNameSchema,
    to: memberNameSchema,
    response: z.string(),
    error: boundedString(1000).optional(),
  }),
  z.object({
    type: z.literal('status_update'),
    name: memberNameSchema,
    status: statusSchema,
    model: boundedString(256).optional(),
    context: contextSchema.nullable().optional(),
  }),
  z.object({ type: z.literal('error'), message: boundedString(1000) }),
  z.object({ type: z.literal('peek') }),
  z.object({
    type: z.literal('peek_response'),
    councilName: councilNameSchema,
    host: identitySchema.optional(),
    clients: z.array(identitySchema),
    statuses: statusesSchema,
  }),
]);

export function safeParseP2pMessage(raw: string): P2pMessage | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    const result = messageSchema.safeParse(parsed);
    return result.success ? (result.data as P2pMessage) : undefined;
  } catch {
    return undefined;
  }
}
