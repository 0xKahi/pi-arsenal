import type { SessionEntry } from '@earendil-works/pi-coding-agent';

export interface TranscriptBlock {
  id: string;
  kind: 'prompt' | 'assistant' | 'thinking' | 'toolCall' | 'toolResult' | 'text' | 'summary';
  timestamp: string;
  title: string;
  meta?: string;
  body: string;
  isError?: boolean;
  toolCallId?: string;
}

function textContent(content: string | readonly { type: string; text?: string }[]): string {
  return typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.map(item => (item.type === 'image' ? '[image]' : (item.text ?? ''))).join('\n')
      : '';
}

export function buildTranscriptBlocks(path: readonly SessionEntry[]): TranscriptBlock[] {
  const blocks: TranscriptBlock[] = [];
  for (const entry of path) {
    const add = (kind: TranscriptBlock['kind'], title: string, body: string, extra: Partial<TranscriptBlock> = {}) =>
      blocks.push({ id: entry.id, kind, timestamp: entry.timestamp, title, body, ...extra });
    if (entry.type === 'compaction' || entry.type === 'branch_summary') {
      add('summary', entry.type === 'compaction' ? 'Compaction' : 'Branch summary', entry.summary);
    } else if (entry.type === 'custom_message') {
      add('text', entry.customType, textContent(entry.content));
    } else if (entry.type === 'message') {
      const message = entry.message;
      if (message.role === 'user') add('prompt', 'Prompt', textContent(message.content));
      else if (message.role === 'assistant') {
        (Array.isArray(message.content) ? message.content : []).forEach((item, index) => {
          const extra = { id: `${entry.id}:${index}` };
          if (item.type === 'text') add('assistant', 'Assistant', item.text, extra);
          else if (item.type === 'thinking') add('thinking', 'Thinking', item.thinking, extra);
          else if (item.type === 'toolCall')
            add('toolCall', item.name, JSON.stringify(item.arguments === undefined ? {} : item.arguments, null, 2), {
              ...extra,
              toolCallId: item.id,
              meta: item.id,
            });
        });
      } else if (message.role === 'toolResult') {
        add('toolResult', message.toolName, textContent(message.content), { isError: message.isError, toolCallId: message.toolCallId });
      } else if (message.role === 'bashExecution') {
        add('text', 'Bash', `$ ${message.command}\n${message.output}`, {
          isError: message.cancelled || (message.exitCode !== undefined && message.exitCode !== 0),
        });
      } else if (message.role === 'custom') {
        add('text', message.customType, textContent(message.content));
      } else if (message.role === 'compactionSummary' || message.role === 'branchSummary') {
        add('summary', 'Summary', message.summary);
      }
    }
  }
  return blocks;
}
