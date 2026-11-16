// LuaEngine.swift ported to Web Worker orchestration.
// Runs LuaEngineSource (Lua -> JS transpiler + stdlib + Editor API) inside a dedicated Web Worker
// so heavy scripts never freeze the UI and pressing 「停止」 can immediately terminate execution.
// Interactive UI prompts (GetUserInput / GetUserOption / ReadBytesSelect / ShowImagePreview) and
// async DecodeImage suspend Worker execution cleanly and replay with accumulated answers.

import { base64ToBytes, bytesToBase64, decodeImageBytesToGray } from './PluginImageTools';
import type {
  LuaWorkerRequest,
  LuaWorkerResponse,
  PluginInfo,
  PluginPromptAnswer,
  PluginPromptRequest,
  PluginRunResult,
  PluginSnapshot,
  WorkerPatch,
} from './PluginTypes';

export interface InspectInput {
  id: string;
  name: string;
  source: string;
}

export interface RunOutcome {
  result: PluginRunResult;
  log: string;
  unsupported: string[];
  notified: boolean;
  patch?: WorkerPatch;
}

export interface RunningPluginHandle {
  readonly promise: Promise<RunOutcome>;
  stop(): void;
}

let requestSeq = 0;

function createLuaWorker(): Worker {
  return new Worker(new URL('./luaWorker.ts', import.meta.url), { type: 'module' });
}

export const LuaEngine = {
  /**
   * 読み込み時の検査 (PluginName などを読む。譜面には触らない)
   */
  inspect(inputs: InspectInput[]): Promise<Record<string, PluginInfo>> {
    if (inputs.length === 0) return Promise.resolve({});
    return new Promise((resolve) => {
      const id = ++requestSeq;
      let settled = false;
      let worker: Worker;
      try {
        worker = createLuaWorker();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const fallback: Record<string, PluginInfo> = {};
        for (const item of inputs) {
          fallback[item.id] = {
            name: '',
            mode: null,
            type: null,
            require: '',
            hasRun: false,
            hasTool: false,
            icon: '',
            error: msg,
          };
        }
        resolve(fallback);
        return;
      }

      // 10秒たっても終わらないとき (トップレベルで無限ループなど) は打ち切る (LuaEngine.swift :: inspect)
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        worker.terminate();
        const fallback: Record<string, PluginInfo> = {};
        for (const item of inputs) {
          fallback[item.id] = {
            name: '',
            mode: null,
            type: null,
            require: '',
            hasRun: false,
            hasTool: false,
            icon: '',
            error: '検査がタイムアウトしました',
          };
        }
        resolve(fallback);
      }, 10_000);

      const finish = (results: Record<string, PluginInfo>) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        worker.terminate();
        resolve(results);
      };

      worker.onmessage = (ev: MessageEvent<LuaWorkerResponse>) => {
        const msg = ev.data;
        if (msg?.type === 'inspectResult' && msg.id === id) {
          finish(msg.results);
        }
      };

      worker.onerror = (ev) => {
        const errMsg = ev.message || 'Lua エンジンの起動に失敗しました';
        const fallback: Record<string, PluginInfo> = {};
        for (const item of inputs) {
          fallback[item.id] = {
            name: '',
            mode: null,
            type: null,
            require: '',
            hasRun: false,
            hasTool: false,
            icon: '',
            error: errMsg,
          };
        }
        finish(fallback);
      };

      const req: LuaWorkerRequest = { type: 'inspect', id, items: inputs };
      worker.postMessage(req);
    });
  },

  /**
   * プラグインの Run() を別スレッド (Web Worker) で実行する。
   * 戻り値の stop() を呼ぶと即座に Worker を停止し aborted として終了する。
   */
  run(params: {
    source: string;
    fileName: string;
    pluginName: string;
    snapshot: PluginSnapshot;
    onLog?: (chunk: string) => void;
    onNotice?: (text: string) => void;
    onPrompt?: (prompt: PluginPromptRequest) => Promise<string | null>;
  }): RunningPluginHandle {
    let activeRunId = ++requestSeq;
    let settled = false;
    let worker: Worker | null = null;
    const promptAnswers: PluginPromptAnswer[] = [];
    const decodeCache = new Map<string, string | null>();
    let resolveFn!: (outcome: RunOutcome) => void;

    const promise = new Promise<RunOutcome>((resolve) => {
      resolveFn = resolve;
    });

    const settle = (outcome: RunOutcome) => {
      if (settled) return;
      settled = true;
      worker?.terminate();
      worker = null;
      resolveFn(outcome);
    };

    try {
      worker = createLuaWorker();
    } catch (err) {
      settle({
        result: {
          status: 'failed',
          message: err instanceof Error ? err.message : 'Lua エンジンを起動できませんでした',
        },
        log: '',
        unsupported: [],
        notified: false,
      });
      return {
        promise,
        stop: () => {},
      };
    }

    const dispatchRun = () => {
      if (settled || !worker) return;
      activeRunId = ++requestSeq;
      const req: LuaWorkerRequest = {
        type: 'run',
        id: activeRunId,
        source: params.source,
        fileName: params.fileName,
        pluginName: params.pluginName,
        snapshot: params.snapshot,
        promptAnswers: [...promptAnswers],
      };
      worker.postMessage(req);
    };

    const handleSuspend = async (prompt: PluginPromptRequest) => {
      let value: string | null = null;
      if (prompt.kind === 'decodeImage') {
        const cacheKey = `${prompt.width}x${prompt.height}:${prompt.imageBase64.length}:${prompt.imageBase64.slice(0, 64)}`;
        if (decodeCache.has(cacheKey) && prompt.imageBase64.length <= 2048) {
          value = decodeCache.get(cacheKey) ?? null;
        } else {
          const bytes = base64ToBytes(prompt.imageBase64);
          const gray = await decodeImageBytesToGray(bytes, prompt.width, prompt.height);
          value = gray ? bytesToBase64(gray) : null;
          if (prompt.imageBase64.length <= 2048) {
            decodeCache.set(cacheKey, value);
          }
        }
      } else if (params.onPrompt) {
        value = await params.onPrompt(prompt);
      }

      if (settled) return;
      promptAnswers.push({ kind: prompt.kind, value });
      dispatchRun();
    };

    worker.onmessage = (ev: MessageEvent<LuaWorkerResponse>) => {
      const msg = ev.data;
      if (!msg || msg.id !== activeRunId || settled) return;
      if (msg.type === 'log') {
        params.onLog?.(msg.text);
      } else if (msg.type === 'notice') {
        params.onNotice?.(msg.text);
      } else if (msg.type === 'suspend') {
        void handleSuspend(msg.prompt);
      } else if (msg.type === 'runResult') {
        settle({
          result: msg.result,
          log: msg.log,
          unsupported: msg.unsupported,
          notified: msg.notified,
          patch: msg.patch,
        });
      }
    };

    worker.onerror = (ev) => {
      settle({
        result: {
          status: 'failed',
          message: ev.message || 'Lua 実行中にエラーが発生しました',
        },
        log: '',
        unsupported: [],
        notified: false,
      });
    };

    dispatchRun();

    return {
      promise,
      stop: () => {
        settle({
          result: { status: 'aborted' },
          log: '',
          unsupported: [],
          notified: false,
        });
      },
    };
  },
};
