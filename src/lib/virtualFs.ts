import type { VirtualFile } from '../types/artifact';

/** In-memory virtual filesystem for generated project artifacts */
export class VirtualFS {
  private files: Map<string, VirtualFile> = new Map();

  write(path: string, content: string, language = 'typescript'): void {
    this.files.set(path, { path, content, language });
  }

  read(path: string): VirtualFile | undefined {
    return this.files.get(path);
  }

  exists(path: string): boolean {
    return this.files.has(path);
  }

  delete(path: string): boolean {
    return this.files.delete(path);
  }

  list(prefix = ''): VirtualFile[] {
    return Array.from(this.files.values())
      .filter((f) => f.path.startsWith(prefix))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  toArray(): VirtualFile[] {
    return this.list();
  }

  clear(): void {
    this.files.clear();
  }

  merge(files: VirtualFile[]): void {
    for (const f of files) {
      this.write(f.path, f.content, f.language);
    }
  }
}
