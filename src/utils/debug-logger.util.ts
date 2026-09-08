import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

export class DebugLoggerUtil {
  static logToMarkdown(fileName: string, { header, contents }: { header: string; contents: string[] }) {
    const data = [header, ...contents, ''];
    const content = data.join('\n');
    const filePath = resolve(process.cwd(), `${fileName}.md`);

    appendFileSync(filePath, content, 'utf8');
  }
}
