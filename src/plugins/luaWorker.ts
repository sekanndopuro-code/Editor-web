// Web Worker host for running Lua plugins off the main UI thread.
// Installs LuaEngineSource (Lua -> JS transpiler + stdlib + Editor API + LuaHost) once in the Worker scope.

import { installLuaEngine } from './LuaEngineSource';
import { LuaSuspendError, PluginBridgeWorker } from './PluginBridgeWorker';
import type { LuaWorkerRequest, LuaWorkerResponse, PluginInfo } from './PluginTypes';

interface LuaHostGlobal {
  inspect(listJSON: string): string;
  run(src: string, chunk: string): string;
}

const g = globalThis as unknown as {
  LuaHost?: LuaHostGlobal;
  __native?: (name: string, argsJSON: string) => string;
};

let engineInstalled = false;
let activeBridge: PluginBridgeWorker | null = null;

function ensureEngine(): LuaHostGlobal {
  if (!engineInstalled) {
    g.__native = (name: string, argsJSON: string): string => {
      if (activeBridge) return activeBridge.handle(name, argsJSON);
      if (name === 'poll') return '[false]';
      return '[null]';
    };
    installLuaEngine(globalThis);
    engineInstalled = true;
  }
  if (!g.LuaHost) {
    throw new Error('LuaHost の初期化に失敗しました');
  }
  return g.LuaHost;
}

function post(msg: LuaWorkerResponse): void {
  self.postMessage(msg);
}

self.addEventListener('message', (ev: MessageEvent<LuaWorkerRequest>) => {
  const req = ev.data;
  if (!req) return;

  if (req.type === 'inspect') {
    const out: Record<string, PluginInfo> = {};
    try {
      activeBridge = null;
      const host = ensureEngine();
      for (const item of req.items) {
        const info: PluginInfo = {
          name: '',
          mode: null,
          type: null,
          require: '',
          hasRun: false,
          hasTool: false,
          icon: '',
          error: '検査に失敗しました',
        };
        try {
          const raw = host.inspect(JSON.stringify([{ id: item.id, name: item.name, src: item.source }]));
          const arr = JSON.parse(raw) as Array<{
            ok?: boolean;
            name?: string;
            mode?: number | null;
            type?: number | null;
            require?: string;
            hasRun?: boolean;
            hasTool?: boolean;
            icon?: string;
            error?: string;
          }>;
          const first = arr[0];
          if (first) {
            info.name = typeof first.name === 'string' ? first.name : '';
            info.mode = typeof first.mode === 'number' ? first.mode : null;
            info.type = typeof first.type === 'number' ? first.type : null;
            info.require = typeof first.require === 'string' ? first.require : '';
            info.hasRun = Boolean(first.hasRun);
            info.hasTool = Boolean(first.hasTool);
            info.icon = typeof first.icon === 'string' ? first.icon : '';
            info.error = first.ok ? '' : typeof first.error === 'string' ? first.error : 'エラー';
          }
        } catch (err) {
          info.error = err instanceof Error ? err.message : String(err);
        }
        out[item.id] = info;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const item of req.items) {
        out[item.id] = {
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
    }
    post({ type: 'inspectResult', id: req.id, results: out });
    return;
  }

  if (req.type === 'run') {
    const bridge = new PluginBridgeWorker(
      req.snapshot,
      req.pluginName,
      {
        onLog: (chunk) => post({ type: 'log', id: req.id, text: chunk }),
        onNotice: (text) => post({ type: 'notice', id: req.id, text }),
      },
      req.promptAnswers ?? []
    );
    activeBridge = bridge;
    try {
      const host = ensureEngine();
      const raw = host.run(req.source, req.fileName);
      const parsed = JSON.parse(raw) as { ok?: boolean; aborted?: boolean; error?: string };
      let result: Extract<LuaWorkerResponse, { type: 'runResult' }>['result'];
      if (parsed.ok) {
        result = { status: 'ok' };
      } else if (parsed.aborted) {
        result = { status: 'aborted' };
      } else {
        result = { status: 'failed', message: parsed.error || '不明なエラー' };
      }
      post({
        type: 'runResult',
        id: req.id,
        result,
        log: bridge.takeLog(),
        unsupported: bridge.takeUnsupported(),
        notified: bridge.wasNotified(),
        patch: parsed.ok ? bridge.buildPatch() : undefined,
      });
    } catch (err) {
      if (
        err instanceof LuaSuspendError ||
        (err && typeof err === 'object' && '__luaSuspend' in err && 'prompt' in err)
      ) {
        const prompt = (err as LuaSuspendError).prompt;
        post({ type: 'suspend', id: req.id, prompt });
        return;
      }
      post({
        type: 'runResult',
        id: req.id,
        result: {
          status: 'failed',
          message: err instanceof Error ? err.message : String(err),
        },
        log: bridge.takeLog(),
        unsupported: bridge.takeUnsupported(),
        notified: bridge.wasNotified(),
      });
    } finally {
      activeBridge = null;
    }
  }
});
