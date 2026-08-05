import { readFile, rename, symlink, unlink, writeFile } from 'node:fs/promises';

export class Atomic {
  static async write({ filePath, data }: { filePath: string; data: unknown }): Promise<void> {
    const tempPath = `${filePath}.tmp.${process.pid}`;
    try {
      await writeFile(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });
      await rename(tempPath, filePath);
    } catch (error) {
      try {
        await unlink(tempPath);
      } catch {}
      throw error;
    }
  }

  static async copy({ sourcePath, targetPath }: { sourcePath: string; targetPath: string }): Promise<void> {
    const tempPath = `${targetPath}.tmp.${process.pid}`;
    try {
      const sourceBytes = await readFile(sourcePath);
      await writeFile(tempPath, sourceBytes, { mode: 0o600 });
      await rename(tempPath, targetPath);
    } catch (error) {
      try {
        await unlink(tempPath);
      } catch {}
      throw error;
    }
  }

  static async symlink({ target, linkPath }: { target: string; linkPath: string }): Promise<void> {
    const tempLink = `${linkPath}.tmp.${process.pid}`;
    try {
      await symlink(target, tempLink);
      await rename(tempLink, linkPath);
    } catch (error) {
      try {
        await unlink(tempLink);
      } catch {}
      throw error;
    }
  }
}
