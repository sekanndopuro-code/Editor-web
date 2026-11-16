// PluginSession.swift ported for synchronous interactive tool plugin sessions (PluginType = 2).
// Runs in an isolated LuaHost scope per session on the main thread so drag events stay frame-synced
// and 1 click/drag gesture cleanly maps to 1 Undo step.

import { installLuaEngine } from './LuaEngineSource';
import { PluginBridgeMain } from './PluginBridgeMain';
import type { PluginItem } from './PluginStore';
import type { EditorState, LaneGeo, Point2D } from '../state/EditorState';

interface InteractiveLuaHost {
  start(src: string, chunk: string): string;
  call(name: string): string;
  stop(): string;
}

interface ParsedCallResult {
  ok: boolean;
  called: boolean;
  aborted: boolean;
  error: string;
}

export class PluginSession {
  readonly item: PluginItem;
  readonly bridge: PluginBridgeMain;
  private readonly state: EditorState;
  private host: InteractiveLuaHost | null = null;
  private lastError = '';

  constructor(item: PluginItem, state: EditorState) {
    this.item = item;
    this.state = state;
    this.bridge = new PluginBridgeMain(state, item.title, item.folder);
  }

  start(): boolean {
    const scope: Record<string, unknown> = {
      __native: (name: string, argsJSON: string) => this.bridge.handle(name, argsJSON),
    };
    try {
      installLuaEngine(scope as unknown as typeof globalThis);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.report(`Lua エンジンを起動できませんでした: ${msg}`);
      return false;
    }

    const host = scope.LuaHost as InteractiveLuaHost | undefined;
    if (!host) {
      this.report('Lua エンジンを起動できませんでした');
      return false;
    }
    this.host = host;

    this.bridge.setDeadline(performance.now() + 3000);
    let raw = '';
    try {
      raw = host.start(this.item.source, this.item.fileName);
    } catch (err) {
      raw = JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.bridge.setDeadline(null);
      this.bridge.flushMain();
    }

    const r = this.parse(raw);
    if (!r.ok) {
      this.report(r.error || 'プラグインを読み込めませんでした');
      this.host = null;
      return false;
    }

    this.call('OnActive');
    return true;
  }

  call(name: string): void {
    const host = this.host;
    if (!host) return;

    this.bridge.setDeadline(performance.now() + 2000);
    let raw = '';
    try {
      raw = host.call(name);
    } catch (err) {
      raw = JSON.stringify({
        ok: false,
        called: true,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.bridge.setDeadline(null);
      this.bridge.flushMain();
    }

    const r = this.parse(raw);
    if (r.ok) {
      this.lastError = '';
      return;
    }
    if (name === 'OnDeactive') return;
    if (r.aborted) {
      this.report(`${name} に時間が掛かりすぎたので止めました`);
    } else {
      this.report(`${name}: ${r.error}`);
    }
  }

  stop(): void {
    this.call('OnDeactive');
    this.bridge.cancel();
    try {
      this.host?.stop();
    } catch {
      // ignore teardown errors
    }
    this.host = null;
  }

  setClick(p: Point2D, g: LaneGeo, state: EditorState): void {
    const x = Math.max(0.0, Math.min(255.0, g.xOf(p.x)));
    const free = Math.max(0.0, g.beatOf(p.y));
    this.bridge.setClick(x, state.snapBeat(free), free);
  }

  private parse(raw: string): ParsedCallResult {
    try {
      const obj = JSON.parse(raw) as {
        ok?: boolean;
        called?: boolean;
        aborted?: boolean;
        error?: string;
      };
      return {
        ok: Boolean(obj.ok),
        called: Boolean(obj.called),
        aborted: Boolean(obj.aborted),
        error: typeof obj.error === 'string' ? obj.error : '',
      };
    } catch {
      return {
        ok: false,
        called: false,
        aborted: false,
        error: '実行結果を読み取れませんでした',
      };
    }
  }

  private report(msg: string): void {
    if (msg === this.lastError) return;
    this.lastError = msg;
    const full = `「${this.item.title}」: ${msg}`;
    this.state.pluginLog += `[エラー] ${msg}\n`;
    this.state.showToast(full, Math.min(6.0, 2.5 + full.length * 0.05));
    this.state.emitUI();
  }
}
