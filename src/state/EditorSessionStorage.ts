// IndexedDB persistence for the active editing session (chart, song audio, background image).
// Allows restoring the exact editing state across page reloads until Quit is pressed.

export interface StoredSessionChart {
  mcText: string;
  mcName: string;
  oggFileName: string;
  bgFileName: string;
  updatedAt: number;
}

export interface StoredSessionMedia {
  fileName: string;
  data: ArrayBuffer;
}

export interface LoadedEditorSession {
  chart: StoredSessionChart;
  audio: { fileName: string; data: Uint8Array } | null;
  bg: { fileName: string; data: Uint8Array } | null;
}

/** 設定画面の「保存データ」用。中身は読み出さず、名前とサイズだけ。 */
export interface SessionStorageSummary {
  chart: { name: string; bytes: number; updatedAt: number } | null;
  audio: { fileName: string; bytes: number } | null;
  bg: { fileName: string; bytes: number } | null;
}

export type SessionSaveResult =
  | { ok: true }
  | { ok: false; quotaExceeded: boolean; message: string };

const DB_NAME = 'malody_slide_editor_session';
const DB_VERSION = 1;
const STORE_NAME = 'session';
const KEY_CHART = 'chart';
const KEY_AUDIO = 'audio';
const KEY_BG = 'bg';

export function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; code?: unknown; message?: unknown };
  if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  if (e.code === 22 || e.code === 1014) return true;
  if (typeof e.message === 'string' && /quota/i.test(e.message)) return true;
  return false;
}

function buildSaveError(err: unknown): SessionSaveResult {
  if (isQuotaExceededError(err)) {
    return {
      ok: false,
      quotaExceeded: true,
      message: '保存できる容量が足りません。不要なデータやブラウザの空き容量を確認してください',
    };
  }
  const detail =
    err instanceof Error && err.message
      ? err.message
      : typeof err === 'object' && err !== null && 'name' in err
        ? String((err as { name: unknown }).name)
        : '';
  return {
    ok: false,
    quotaExceeded: false,
    message: detail
      ? `編集状態の保存に失敗しました (${detail})`
      : '編集状態の保存に失敗しました',
  };
}

function openDB(): Promise<{ db: IDBDatabase | null; error: unknown }> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve({ db: null, error: new Error('IndexedDB を利用できません') });
  }
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve({ db: req.result, error: null });
      req.onerror = () => resolve({ db: null, error: req.error });
      req.onblocked = () => resolve({ db: null, error: new Error('IndexedDB がブロックされています') });
    } catch (err) {
      resolve({ db: null, error: err });
    }
  });
}

function toStandaloneBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function runWriteTransaction(
  op: (store: IDBObjectStore, captureError: (err: unknown) => void) => void
): Promise<SessionSaveResult> {
  return openDB().then(({ db, error }) => {
    if (!db) return buildSaveError(error);
    return new Promise<SessionSaveResult>((resolve) => {
      let settled = false;
      let capturedError: unknown = null;
      const captureError = (err: unknown) => {
        if (err && !capturedError) capturedError = err;
      };
      const finish = (result: SessionSaveResult) => {
        if (settled) return;
        settled = true;
        try {
          db.close();
        } catch {
          // Ignore close errors
        }
        resolve(result);
      };
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        tx.oncomplete = () => finish({ ok: true });
        tx.onerror = () => {
          captureError(tx.error);
          finish(buildSaveError(capturedError));
        };
        tx.onabort = () => {
          captureError(tx.error);
          finish(buildSaveError(capturedError));
        };
        op(store, captureError);
      } catch (err) {
        finish(buildSaveError(err));
      }
    });
  });
}

async function clearStore(): Promise<void> {
  const { db } = await openDB();
  if (!db) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        db.close();
      } catch {
        // Ignore close errors
      }
      resolve();
    };
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = finish;
      tx.onerror = finish;
      tx.onabort = finish;
    } catch {
      finish();
    }
  });
}

let currentEpoch = 0;
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueueSessionWrite(
  epoch: number,
  fn: () => Promise<SessionSaveResult>
): Promise<SessionSaveResult> {
  const next = writeQueue.then(
    () => (epoch !== currentEpoch ? ({ ok: true } as const) : fn()),
    () => (epoch !== currentEpoch ? ({ ok: true } as const) : fn())
  );
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export const EditorSessionStorage = {
  async loadSession(): Promise<LoadedEditorSession | null> {
    const { db } = await openDB();
    if (!db) return null;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: LoadedEditorSession | null) => {
        if (settled) return;
        settled = true;
        try {
          db.close();
        } catch {
          // Ignore close errors
        }
        resolve(value);
      };
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const chartReq = store.get(KEY_CHART);
        const audioReq = store.get(KEY_AUDIO);
        const bgReq = store.get(KEY_BG);
        tx.oncomplete = () => {
          const chart = chartReq.result as StoredSessionChart | undefined;
          if (!chart || typeof chart.mcText !== 'string') {
            finish(null);
            return;
          }
          const rawAudio = audioReq.result as StoredSessionMedia | undefined;
          const rawBg = bgReq.result as StoredSessionMedia | undefined;
          finish({
            chart: {
              mcText: chart.mcText,
              mcName: typeof chart.mcName === 'string' ? chart.mcName : 'chart.mc',
              oggFileName: typeof chart.oggFileName === 'string' ? chart.oggFileName : '',
              bgFileName: typeof chart.bgFileName === 'string' ? chart.bgFileName : '',
              updatedAt: typeof chart.updatedAt === 'number' ? chart.updatedAt : Date.now(),
            },
            audio:
              rawAudio && rawAudio.data instanceof ArrayBuffer
                ? {
                    fileName: typeof rawAudio.fileName === 'string' ? rawAudio.fileName : '',
                    data: new Uint8Array(rawAudio.data),
                  }
                : null,
            bg:
              rawBg && rawBg.data instanceof ArrayBuffer
                ? {
                    fileName: typeof rawBg.fileName === 'string' ? rawBg.fileName : '',
                    data: new Uint8Array(rawBg.data),
                  }
                : null,
          });
        };
        tx.onerror = () => finish(null);
        tx.onabort = () => finish(null);
      } catch {
        finish(null);
      }
    });
  },

  async getSummary(): Promise<SessionStorageSummary | null> {
    const { db } = await openDB();
    if (!db) return null;
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: SessionStorageSummary | null) => {
        if (settled) return;
        settled = true;
        try {
          db.close();
        } catch {
          // Ignore close errors
        }
        resolve(value);
      };
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const chartReq = store.get(KEY_CHART);
        const audioReq = store.get(KEY_AUDIO);
        const bgReq = store.get(KEY_BG);
        tx.oncomplete = () => {
          const chart = chartReq.result as StoredSessionChart | undefined;
          const audio = audioReq.result as StoredSessionMedia | undefined;
          const bg = bgReq.result as StoredSessionMedia | undefined;
          finish({
            chart:
              chart && typeof chart.mcText === 'string'
                ? {
                    name: typeof chart.mcName === 'string' ? chart.mcName : 'chart.mc',
                    bytes: new Blob([chart.mcText]).size,
                    updatedAt: typeof chart.updatedAt === 'number' ? chart.updatedAt : 0,
                  }
                : null,
            audio:
              audio && audio.data instanceof ArrayBuffer
                ? { fileName: typeof audio.fileName === 'string' ? audio.fileName : '', bytes: audio.data.byteLength }
                : null,
            bg:
              bg && bg.data instanceof ArrayBuffer
                ? { fileName: typeof bg.fileName === 'string' ? bg.fileName : '', bytes: bg.data.byteLength }
                : null,
          });
        };
        tx.onerror = () => finish(null);
        tx.onabort = () => finish(null);
      } catch {
        finish(null);
      }
    });
  },

  saveFullSession(params: {
    mcText: string;
    mcName: string;
    audioData: Uint8Array | null;
    audioFileName: string;
    bgData: Uint8Array | null;
    bgFileName: string;
  }): Promise<SessionSaveResult> {
    currentEpoch += 1;
    const epoch = currentEpoch;
    const chartRecord: StoredSessionChart = {
      mcText: params.mcText,
      mcName: params.mcName,
      oggFileName: params.audioFileName,
      bgFileName: params.bgFileName,
      updatedAt: Date.now(),
    };
    const audioRecord: StoredSessionMedia | null = params.audioData
      ? { fileName: params.audioFileName, data: toStandaloneBuffer(params.audioData) }
      : null;
    const bgRecord: StoredSessionMedia | null = params.bgData
      ? { fileName: params.bgFileName, data: toStandaloneBuffer(params.bgData) }
      : null;

    return enqueueSessionWrite(epoch, () =>
      runWriteTransaction((store, captureError) => {
        const r1 = store.put(chartRecord, KEY_CHART);
        r1.onerror = () => captureError(r1.error);
        const r2 = audioRecord ? store.put(audioRecord, KEY_AUDIO) : store.delete(KEY_AUDIO);
        r2.onerror = () => captureError(r2.error);
        const r3 = bgRecord ? store.put(bgRecord, KEY_BG) : store.delete(KEY_BG);
        r3.onerror = () => captureError(r3.error);
      })
    );
  },

  saveChart(params: {
    mcText: string;
    mcName: string;
    oggFileName: string;
    bgFileName: string;
  }): Promise<SessionSaveResult> {
    const epoch = currentEpoch;
    const chartRecord: StoredSessionChart = {
      mcText: params.mcText,
      mcName: params.mcName,
      oggFileName: params.oggFileName,
      bgFileName: params.bgFileName,
      updatedAt: Date.now(),
    };
    return enqueueSessionWrite(epoch, () =>
      runWriteTransaction((store, captureError) => {
        const r = store.put(chartRecord, KEY_CHART);
        r.onerror = () => captureError(r.error);
      })
    );
  },

  saveAudio(data: Uint8Array | null, fileName: string): Promise<SessionSaveResult> {
    const epoch = currentEpoch;
    const audioRecord: StoredSessionMedia | null = data
      ? { fileName, data: toStandaloneBuffer(data) }
      : null;
    return enqueueSessionWrite(epoch, () =>
      runWriteTransaction((store, captureError) => {
        const r = audioRecord ? store.put(audioRecord, KEY_AUDIO) : store.delete(KEY_AUDIO);
        r.onerror = () => captureError(r.error);
      })
    );
  },

  saveBackground(data: Uint8Array | null, fileName: string): Promise<SessionSaveResult> {
    const epoch = currentEpoch;
    const bgRecord: StoredSessionMedia | null = data
      ? { fileName, data: toStandaloneBuffer(data) }
      : null;
    return enqueueSessionWrite(epoch, () =>
      runWriteTransaction((store, captureError) => {
        const r = bgRecord ? store.put(bgRecord, KEY_BG) : store.delete(KEY_BG);
        r.onerror = () => captureError(r.error);
      })
    );
  },

  clearSession(): Promise<void> {
    currentEpoch += 1;
    const next = writeQueue.then(clearStore, clearStore);
    writeQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  },
};
