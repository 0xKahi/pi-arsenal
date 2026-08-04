import { existsSync, readFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { EXTENSION_ID, type SubExtentionIds } from '../constants';

const SHELL_VAR_REGEX = /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;
const PROMPT_FOLDER = 'prompts';
const PACKAGE_NAME = '@0xkahi/pi-arsenal';

export type FileSearchResult = {
  exists: boolean;
  path: string;
};

type FindConfigInput = { type: 'global' } | { type: 'project'; cwd: string };

export class PathUtil {
  /**
   * Expand shell-style variables in a path string.
   * Supports: `~`, `$HOME`, `$USER`, `$VAR`, `${VAR}`.
   */
  static expandPath(rawPath: string): string {
    let result = rawPath;

    result = result.replace(SHELL_VAR_REGEX, (_match, braced, bare) => {
      const name = braced ?? bare;
      if (name === 'HOME') return homedir();
      if (name === 'USER') return userInfo().username;
      return process.env[name] ?? _match;
    });

    if (result === '~' || result.startsWith('~/') || result.startsWith('~\\')) {
      result = path.join(homedir(), result.slice(1));
    }

    return result;
  }

  static findFile(filePath: string): FileSearchResult {
    if (existsSync(filePath)) {
      return { exists: true, path: filePath };
    }
    return { exists: false, path: filePath };
  }

  static findExtensionConfig(input: FindConfigInput): FileSearchResult {
    switch (input.type) {
      case 'global': {
        return PathUtil.findFile(PathUtil.getExtensionConfig([getAgentDir()]));
      }
      case 'project': {
        return PathUtil.findFile(PathUtil.getExtensionConfig([input.cwd, '.pi']));
      }
    }
  }

  static findPiAuthConfig(): FileSearchResult {
    return PathUtil.findFile(path.join(getAgentDir(), 'auth.json'));
  }

  static findPromptFolder(extensionId: SubExtentionIds): FileSearchResult {
    return PathUtil.findFile(path.join(PathUtil.getPackageRoot(), PROMPT_FOLDER, extensionId));
  }

  private static getPackageRoot(): string {
    let currentPath = path.dirname(fileURLToPath(import.meta.url));

    while (true) {
      const packageJsonPath = PathUtil.findFile(path.join(currentPath, 'package.json'));

      if (packageJsonPath.exists) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath.path, 'utf8')) as { name?: string };
        if (packageJson.name === PACKAGE_NAME) {
          return currentPath;
        }
      }

      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) break;
      currentPath = parentPath;
    }

    throw new Error(`Unable to locate ${PACKAGE_NAME} package root`);
  }

  private static getExtensionConfig(paths: string[]): string {
    return path.join(...paths, 'extensions', EXTENSION_ID, 'config.json');
  }
}
