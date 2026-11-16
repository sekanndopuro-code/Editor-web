// IndexedDB persistence for user-imported Lua plugins and their bundled assets (images, etc.).
// Mirrors Swift's Documents/Plugins/ directory layout: relative paths such as "<folder>/<file>.lua" or "<folder>/<sub/img.png>".

export interface StoredPluginFile {
  path: string; // e.g. "myplugin/main.lua" or "myplugin/icon.png"
  folder: string; // parent directory path relative to Plugins root, e.g. "myplugin" or "myplugin/assets"
  data: ArrayBuffer;
}

const DB_NAME = 'malody_slide_editor_plugins';
const DB_VERSION = 1;
const STORE_NAME = 'files';

function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'path' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function parentFolderOf(relPath: string): string {
  const idx = relPath.lastIndexOf('/');
  return idx >= 0 ? relPath.slice(0, idx) : '';
}

export function fileNameOf(relPath: string): string {
  const idx = relPath.lastIndexOf('/');
  return idx >= 0 ? relPath.slice(idx + 1) : relPath;
}

export const PluginStorage = {
  async loadAllFiles(): Promise<StoredPluginFile[]> {
    const db = await openDB();
    if (!db) return [];
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => {
          const list = Array.isArray(req.result) ? (req.result as StoredPluginFile[]) : [];
          resolve(list);
        };
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      } finally {
        db.close();
      }
    });
  },

  async putFiles(files: StoredPluginFile[]): Promise<boolean> {
    if (files.length === 0) return true;
    const db = await openDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const f of files) {
          store.put(f);
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      } finally {
        db.close();
      }
    });
  },

  async deletePaths(paths: string[]): Promise<void> {
    if (paths.length === 0) return;
    const db = await openDB();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const p of paths) {
          store.delete(p);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
        tx.onabort = () => resolve();
      } catch {
        resolve();
      } finally {
        db.close();
      }
    });
  },
};
