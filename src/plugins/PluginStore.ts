// PluginStore.swift ported to browser (IndexedDB persistence + JSZip package extraction + async inspection).
// Keeps the 6 built-in plugins at the top and persists imported .lua / .zip packages (+ bundled images) across reloads.

import JSZip from 'jszip';
import { BUILTIN_PLUGINS } from './BuiltinPlugins';
import { LuaEngine } from './LuaEngine';
import {
  PluginStorage,
  fileNameOf,
  parentFolderOf,
  type StoredPluginFile,
} from './PluginStorage';
import type { PluginInfo } from './PluginTypes';

const MAX_ZIP_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;

/** 設定画面の「保存データ」用。IndexedDB に保存されているプラグインを、一番上のフォルダ単位でまとめたもの。 */
export interface PluginFileSummary {
  path: string; // 保存パス (一番上のフォルダ名から)
  name: string; // フォルダ内での名前 (サブフォルダがあれば含む)
  bytes: number;
  isLua: boolean;
  title: string | null; // lua のとき、プラグイン一覧に出る名前
}

export interface PluginPackageSummary {
  folder: string; // 保存先の一番上のフォルダ名 (取り込んだ lua / zip の名前)
  titles: string[]; // このフォルダにある lua プラグインの名前
  luaCount: number;
  assetCount: number; // lua 以外 (画像など) のファイル数
  bytes: number;
}

export class PluginItem {
  readonly id: string; // "builtin/<fileName>" or "user/<relPath>"
  readonly fileName: string;
  readonly source: string;
  readonly isBuiltin: boolean;
  readonly folder: string; // relative folder path for assets, "" for builtins
  readonly relPath: string; // relative path from Plugins root, "" for builtins
  info: PluginInfo | null;

  constructor(params: {
    id: string;
    fileName: string;
    source: string;
    isBuiltin: boolean;
    folder?: string;
    relPath?: string;
    info?: PluginInfo | null;
  }) {
    this.id = params.id;
    this.fileName = params.fileName;
    this.source = params.source;
    this.isBuiltin = params.isBuiltin;
    this.folder = params.folder ?? '';
    this.relPath = params.relPath ?? '';
    this.info = params.info ?? null;
  }

  get title(): string {
    const n = this.info?.name;
    if (n && n.length > 0) return n;
    const dot = this.fileName.lastIndexOf('.');
    return dot > 0 ? this.fileName.slice(0, dot) : this.fileName;
  }

  get subtitle(): string {
    const i = this.info;
    if (!i) return '読み込み中…';
    if (i.error.length > 0) return `エラー: ${i.error}`;
    const parts: string[] = [];
    if (this.isInteractive) parts.push('操作型');
    if (i.mode !== null) parts.push(`mode ${i.mode}`);
    if (i.require.length > 0) parts.push(`v${i.require}`);
    parts.push(this.fileName);
    return parts.join(' · ');
  }

  get isRunnable(): boolean {
    const i = this.info;
    if (!i) return false;
    return i.error.length === 0 && (i.hasRun || i.hasTool);
  }

  get isInteractive(): boolean {
    const i = this.info;
    if (!i) return false;
    return i.hasTool && (i.type === 2 || !i.hasRun);
  }

  get hasError(): boolean {
    const i = this.info;
    if (!i) return false;
    return i.error.length > 0;
  }
}

export function decodePluginSource(data: Uint8Array): string {
  try {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(data);
    return s.startsWith('\uFEFF') ? s.slice(1) : s;
  } catch {
    // Fallback to Shift_JIS (common in Japanese Malody Lua plugins) then Latin-1
  }
  try {
    return new TextDecoder('shift_jis', { fatal: true }).decode(data);
  } catch {
    return new TextDecoder('iso-8859-1').decode(data);
  }
}

export function safePluginFolderName(s: string): string {
  const cleaned = s.replace(/[/\\:*?"<>|]/g, '_').trim();
  return cleaned.length === 0 ? 'plugin' : cleaned;
}

function splitFileNameExt(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return { stem: name, ext: '' };
  return { stem: name.slice(0, dot), ext: name.slice(dot + 1).toLowerCase() };
}

export async function extractPluginZip(
  zipBytes: Uint8Array
): Promise<Array<{ path: string; data: Uint8Array }>> {
  const zip = await JSZip.loadAsync(zipBytes);
  const out: Array<{ path: string; data: Uint8Array }> = [];
  let totalBytes = 0;

  const entries = Object.values(zip.files);
  for (const entry of entries) {
    if (entry.dir) continue;
    const norm = entry.name.replace(/\\/g, '/');
    if (norm.startsWith('__MACOSX/')) continue;
    const base = fileNameOf(norm);
    if (base === '.DS_Store' || base.startsWith('._')) continue;
    const parts = norm.split('/').filter((p) => p !== '.' && p.length > 0);
    if (norm.startsWith('/') || parts.length === 0 || parts.includes('..')) {
      throw new Error(`不正なファイル名があります (${entry.name})`);
    }
    const data = await entry.async('uint8array');
    totalBytes += data.byteLength;
    if (totalBytes > MAX_ZIP_UNCOMPRESSED_BYTES) {
      throw new Error('展開すると大きすぎます (64MB まで)');
    }
    out.push({ path: parts.join('/'), data });
  }
  return out;
}

export class PluginStore {
  static readonly shared = new PluginStore();

  items: PluginItem[] = [];
  private inspecting = new Set<string>();
  private listeners = new Set<() => void>();
  private storedFiles = new Map<string, StoredPluginFile>(); // relPath -> StoredPluginFile
  private iconUrlCache = new Map<string, string>(); // relPath -> blob URL
  private spriteImageCache = new Map<string, HTMLImageElement>(); // relPath -> decoded HTMLImageElement
  private missingAssets = new Set<string>();
  private initPromise: Promise<void>;

  private constructor() {
    this.items = BUILTIN_PLUGINS.map(
      (e) =>
        new PluginItem({
          id: `builtin/${e.fileName}`,
          fileName: e.fileName,
          source: e.source,
          isBuiltin: true,
          folder: '',
          relPath: '',
          info: null,
        })
    );
    this.inspectPending();
    this.initPromise = this.loadPersistedUserItems();
  }

  ready(): Promise<void> {
    return this.initPromise;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  private resolveStoredAsset(folder: string, assetName: string): StoredPluginFile | null {
    const trimmed = assetName.trim();
    if (!trimmed) return null;
    // Block directory traversal (../) just like PluginImageCache in PluginSession.swift
    const norm = trimmed.replace(/\\/g, '/').replace(/^\/+/, '');
    if (norm.split('/').includes('..')) return null;

    const candidatePath = folder ? `${folder}/${norm}` : norm;
    let file = this.storedFiles.get(candidatePath);
    if (!file) {
      const prefix = folder ? `${folder}/` : '';
      const lowerTarget = norm.toLowerCase();
      const baseTarget = fileNameOf(norm).toLowerCase();
      for (const [p, entry] of this.storedFiles.entries()) {
        if (prefix && !p.startsWith(prefix)) continue;
        const relInside = prefix ? p.slice(prefix.length) : p;
        if (relInside.toLowerCase() === lowerTarget || fileNameOf(p).toLowerCase() === baseTarget) {
          file = entry;
          break;
        }
      }
    }
    return file ?? null;
  }

  getAssetUrl(folder: string, assetName: string): string | null {
    const file = this.resolveStoredAsset(folder, assetName);
    if (!file) return null;

    const cached = this.iconUrlCache.get(file.path);
    if (cached) return cached;
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;

    const url = URL.createObjectURL(new Blob([file.data]));
    this.iconUrlCache.set(file.path, url);
    return url;
  }

  getSpriteImage(folder: string, assetName: string, onLoad?: () => void): HTMLImageElement | null {
    const file = this.resolveStoredAsset(folder, assetName);
    if (!file) return null;

    const cached = this.spriteImageCache.get(file.path);
    if (cached) return cached;
    if (this.missingAssets.has(file.path)) return null;

    const url = this.getAssetUrl(folder, assetName);
    if (!url || typeof Image === 'undefined') return null;

    const img = new Image();
    img.onload = () => {
      onLoad?.();
    };
    img.onerror = () => {
      this.spriteImageCache.delete(file.path);
      this.missingAssets.add(file.path);
    };
    img.src = url;
    this.spriteImageCache.set(file.path, img);
    return img;
  }

  getIconUrl(item: PluginItem): string | null {
    if (item.isBuiltin) return null;
    const iconName = item.info?.icon?.trim() ?? '';
    if (!iconName) return null;
    return this.getAssetUrl(item.folder, iconName);
  }

  private revokeIconUrl(relPath: string): void {
    const existing = this.iconUrlCache.get(relPath);
    if (existing && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
      URL.revokeObjectURL(existing);
    }
    this.iconUrlCache.delete(relPath);
    this.spriteImageCache.delete(relPath);
    this.missingAssets.delete(relPath);
  }

  private async loadPersistedUserItems(): Promise<void> {
    const files = await PluginStorage.loadAllFiles();
    if (files.length === 0) return;

    this.storedFiles.clear();
    const luaEntries: Array<{ relPath: string; fileName: string; folder: string; source: string }> = [];

    for (const f of files) {
      this.storedFiles.set(f.path, f);
      if (f.path.toLowerCase().endsWith('.lua')) {
        const src = decodePluginSource(new Uint8Array(f.data));
        luaEntries.push({
          relPath: f.path,
          fileName: fileNameOf(f.path),
          folder: f.folder,
          source: src,
        });
      }
    }

    luaEntries.sort((a, b) => a.relPath.localeCompare(b.relPath, undefined, { sensitivity: 'base' }));

    const builtin = this.items.filter((it) => it.isBuiltin);
    const oldUser = new Map<string, PluginItem>();
    for (const it of this.items) {
      if (!it.isBuiltin) oldUser.set(it.id, it);
    }

    const userItems = luaEntries.map((e) => {
      const id = `user/${e.relPath}`;
      const prev = oldUser.get(id);
      return new PluginItem({
        id,
        fileName: e.fileName,
        source: e.source,
        isBuiltin: false,
        folder: e.folder,
        relPath: e.relPath,
        info: prev && prev.source === e.source ? prev.info : null,
      });
    });

    this.items = [...builtin, ...userItems];
    this.sortUserItems();
    this.notify();
    this.inspectPending();
  }

  inspectPending(): void {
    const todo = this.items.filter((it) => it.info === null && !this.inspecting.has(it.id));
    if (todo.length === 0) return;
    for (const it of todo) this.inspecting.add(it.id);
    const inputs = todo.map((it) => ({ id: it.id, name: it.fileName, source: it.source }));
    void LuaEngine.inspect(inputs).then((results) => {
      for (const it of this.items) {
        const res = results[it.id];
        if (res) it.info = res;
      }
      for (const id of Object.keys(results)) {
        this.inspecting.delete(id);
      }
      this.sortUserItems();
      this.notify();
    });
  }

  /**
   * 選んだファイル (.lua / .zip / 画像など) を取り込む (PluginStore.swift :: importFiles)。
   * 検査に通ったプラグインだけ一覧に加えて、ブラウザ (IndexedDB) に保存する。
   */
  async importFiles(files: File[]): Promise<string> {
    await this.initPromise;

    const luaFiles: Array<{ name: string; data: Uint8Array }> = [];
    const otherFiles: Array<{ name: string; data: Uint8Array }> = [];
    const zipFiles: Array<{ name: string; data: Uint8Array }> = [];
    const problems: string[] = [];

    for (const file of files) {
      let data: Uint8Array;
      try {
        const buf = await file.arrayBuffer();
        data = new Uint8Array(buf);
      } catch {
        problems.push(`${file.name}: 読み込めませんでした`);
        continue;
      }
      const { ext } = splitFileNameExt(file.name);
      if (ext === 'lua') {
        luaFiles.push({ name: file.name, data });
      } else if (ext === 'zip') {
        zipFiles.push({ name: file.name, data });
      } else {
        otherFiles.push({ name: file.name, data });
      }
    }

    const packages: Array<{ folder: string; files: Array<{ path: string; data: Uint8Array }> }> = [];
    if (luaFiles.length > 0) {
      const firstStem = splitFileNameExt(luaFiles[0].name).stem;
      const folder = safePluginFolderName(firstStem);
      packages.push({
        folder,
        files: [
          ...luaFiles.map((f) => ({ path: f.name, data: f.data })),
          ...otherFiles.map((f) => ({ path: f.name, data: f.data })),
        ],
      });
    } else if (otherFiles.length > 0 && zipFiles.length === 0) {
      problems.push('lua ファイルが選ばれていません (画像だけは追加できません)');
    }

    for (const zf of zipFiles) {
      try {
        const entries = await extractPluginZip(zf.data);
        const folder = safePluginFolderName(splitFileNameExt(zf.name).stem);
        packages.push({ folder, files: entries });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '解凍できませんでした';
        problems.push(`${zf.name}: ${msg}`);
      }
    }

    return this.installPackages(packages, problems);
  }

  private async installPackages(
    packages: Array<{ folder: string; files: Array<{ path: string; data: Uint8Array }> }>,
    initialProblems: string[]
  ): Promise<string> {
    const problems = [...initialProblems];
    const stagedFiles: StoredPluginFile[] = [];
    const pkgRoots: string[] = [];
    const candidates: PluginItem[] = [];

    for (const pkg of packages) {
      pkgRoots.push(pkg.folder);
      for (const f of pkg.files) {
        const parts = f.path
          .replace(/\\/g, '/')
          .split('/')
          .filter((p) => p !== '.' && p.length > 0);
        if (parts.length === 0 || parts.includes('..')) {
          problems.push(`${f.path}: 不正なファイル名です`);
          continue;
        }
        const relPath = `${pkg.folder}/${parts.join('/')}`;
        const folder = parentFolderOf(relPath);
        const buf = f.data.buffer.slice(f.data.byteOffset, f.data.byteOffset + f.data.byteLength) as ArrayBuffer;
        const stored: StoredPluginFile = { path: relPath, folder, data: buf };
        stagedFiles.push(stored);

        if (relPath.toLowerCase().endsWith('.lua')) {
          const src = decodePluginSource(f.data);
          candidates.push(
            new PluginItem({
              id: `user/${relPath}`,
              fileName: parts[parts.length - 1],
              source: src,
              isBuiltin: false,
              folder,
              relPath,
              info: null,
            })
          );
        }
      }
    }

    if (candidates.length === 0) {
      if (problems.length === 0) problems.push('lua ファイルがありません');
      return PluginStore.formatSummary([], problems);
    }

    const inspectResults = await LuaEngine.inspect(
      candidates.map((c) => ({ id: c.id, name: c.fileName, source: c.source }))
    );

    const added: string[] = [];
    const acceptedLuaPaths = new Set<string>();
    const acceptedRoots = new Set<string>();

    for (const item of candidates) {
      const info = inspectResults[item.id];
      if (!info) {
        problems.push(`${item.fileName}: 検査に失敗しました`);
        continue;
      }
      if (info.error.length > 0) {
        problems.push(`${item.fileName}: ${info.error}`);
        continue;
      }
      if (!info.hasRun && !info.hasTool) {
        problems.push(`${item.fileName}: Run() も OnActive() もありません`);
        continue;
      }
      item.info = info;
      acceptedLuaPaths.add(item.relPath);
      const topFolder = item.relPath.split('/')[0];
      if (topFolder) acceptedRoots.add(topFolder);

      const idx = this.items.findIndex((x) => x.id === item.id);
      if (idx >= 0) this.items[idx] = item;
      else this.items.push(item);
      added.push(item.title);
    }

    // Only persist valid .lua files and assets belonging to folders that contain >= 1 valid .lua
    const filesToPersist: StoredPluginFile[] = [];
    for (const sf of stagedFiles) {
      const topFolder = sf.path.split('/')[0];
      const isLua = sf.path.toLowerCase().endsWith('.lua');
      const keep = isLua
        ? acceptedLuaPaths.has(sf.path)
        : acceptedRoots.has(topFolder) || this.hasUserLuaInRoot(topFolder);
      if (keep) {
        this.revokeIconUrl(sf.path);
        this.storedFiles.set(sf.path, sf);
        filesToPersist.push(sf);
      }
    }

    if (filesToPersist.length > 0) {
      await PluginStorage.putFiles(filesToPersist);
    }

    // Prune any pre-existing empty package roots touched during overwrite
    const toDelete: string[] = [];
    for (const root of pkgRoots) {
      if (!this.hasUserLuaInRoot(root)) {
        for (const p of this.storedFiles.keys()) {
          if (p.startsWith(`${root}/`)) {
            toDelete.push(p);
          }
        }
      }
    }
    if (toDelete.length > 0) {
      for (const p of toDelete) {
        this.revokeIconUrl(p);
        this.storedFiles.delete(p);
      }
      await PluginStorage.deletePaths(toDelete);
    }

    this.sortUserItems();
    this.notify();
    return PluginStore.formatSummary(added, problems);
  }

  private hasUserLuaInRoot(rootFolder: string): boolean {
    if (!rootFolder) return false;
    return this.items.some(
      (it) => !it.isBuiltin && (it.relPath === rootFolder || it.relPath.startsWith(`${rootFolder}/`))
    );
  }

  async remove(item: PluginItem): Promise<void> {
    if (item.isBuiltin) return;
    await this.initPromise;

    this.items = this.items.filter((x) => x.id !== item.id);

    const toDelete = new Set<string>();
    if (item.relPath) {
      toDelete.add(item.relPath);
      const topFolder = item.relPath.split('/')[0];
      if (topFolder && !this.hasUserLuaInRoot(topFolder)) {
        for (const p of this.storedFiles.keys()) {
          if (p.startsWith(`${topFolder}/`) || p === topFolder) {
            toDelete.add(p);
          }
        }
      } else if (item.folder) {
        const stillHasLuaInSubdir = this.items.some(
          (x) => !x.isBuiltin && (x.folder === item.folder || x.folder.startsWith(`${item.folder}/`))
        );
        if (!stillHasLuaInSubdir) {
          for (const p of this.storedFiles.keys()) {
            if (p.startsWith(`${item.folder}/`)) {
              toDelete.add(p);
            }
          }
        }
      }
    }

    for (const p of toDelete) {
      this.revokeIconUrl(p);
      this.storedFiles.delete(p);
    }
    await PluginStorage.deletePaths([...toDelete]);
    this.notify();
  }

  /** 保存済みのファイルを、一番上のフォルダごとにまとめて返す (設定画面の一覧用)。 */
  getPackageSummaries(): PluginPackageSummary[] {
    const map = new Map<string, PluginPackageSummary>();
    for (const [p, f] of this.storedFiles.entries()) {
      const folder = p.split('/')[0];
      let entry = map.get(folder);
      if (!entry) {
        entry = { folder, titles: [], luaCount: 0, assetCount: 0, bytes: 0 };
        map.set(folder, entry);
      }
      if (p.toLowerCase().endsWith('.lua')) entry.luaCount += 1;
      else entry.assetCount += 1;
      entry.bytes += f.data.byteLength;
    }
    for (const it of this.items) {
      if (it.isBuiltin) continue;
      const entry = map.get(it.relPath.split('/')[0]);
      if (entry) entry.titles.push(it.title);
    }
    return [...map.values()].sort((a, b) =>
      a.folder.localeCompare(b.folder, undefined, { sensitivity: 'base' })
    );
  }

  /** フォルダの中のファイル (lua・画像など) を1つずつ返す。 */
  getPackageFiles(folder: string): PluginFileSummary[] {
    const titleByPath = new Map<string, string>();
    for (const it of this.items) {
      if (!it.isBuiltin) titleByPath.set(it.relPath, it.title);
    }
    const out: PluginFileSummary[] = [];
    for (const [p, f] of this.storedFiles.entries()) {
      if (!p.startsWith(`${folder}/`)) continue;
      const isLua = p.toLowerCase().endsWith('.lua');
      out.push({
        path: p,
        name: p.slice(folder.length + 1),
        bytes: f.data.byteLength,
        isLua,
        title: isLua ? (titleByPath.get(p) ?? null) : null,
      });
    }
    out.sort((a, b) =>
      a.isLua === b.isLua
        ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
        : a.isLua
          ? -1
          : 1
    );
    return out;
  }

  /** ファイルを1つだけ消す (lua なら一覧からも外れる)。ほかのファイルには触らない。 */
  async removeFile(path: string): Promise<void> {
    if (!path) return;
    await this.initPromise;
    this.items = this.items.filter((x) => x.isBuiltin || x.relPath !== path);
    this.revokeIconUrl(path);
    this.storedFiles.delete(path);
    await PluginStorage.deletePaths([path]);
    this.notify();
  }

  /** 一番上のフォルダごと、プラグイン本体と画像などを全部消す (設定画面の「削除」)。 */
  async removePackage(folder: string): Promise<void> {
    if (!folder) return;
    await this.initPromise;

    this.items = this.items.filter(
      (x) => x.isBuiltin || !(x.relPath === folder || x.relPath.startsWith(`${folder}/`))
    );

    const toDelete: string[] = [];
    for (const p of this.storedFiles.keys()) {
      if (p === folder || p.startsWith(`${folder}/`)) toDelete.push(p);
    }
    for (const p of toDelete) {
      this.revokeIconUrl(p);
      this.storedFiles.delete(p);
    }
    await PluginStorage.deletePaths(toDelete);
    this.notify();
  }

  static formatSummary(added: string[], failed: string[]): string {
    const lines: string[] = [];
    if (added.length > 0) {
      lines.push('追加しました:');
      for (const a of added) lines.push(`・${a}`);
    }
    if (failed.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('追加できなかったファイル:');
      for (const f of failed) lines.push(`・${f}`);
    }
    if (lines.length === 0) lines.push('追加するファイルがありません');
    return lines.join('\n');
  }

  private sortUserItems(): void {
    const builtin = this.items.filter((x) => x.isBuiltin);
    const user = this.items
      .filter((x) => !x.isBuiltin)
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    this.items = [...builtin, ...user];
  }
}
