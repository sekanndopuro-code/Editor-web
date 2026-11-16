// PluginBridge.swift ported to run synchronously inside the Lua Web Worker against a chart snapshot.
// Mutations stay isolated inside the Worker and are committed back to the main thread in 1 Undo step on completion.

import { Beat, gcdInt } from '../core/Beat';
import { TimeMap } from '../core/ChartModel';
import type {
  PluginPromptAnswer,
  PluginPromptRequest,
  PluginSnapshot,
  SerializedBeat,
  SerializedEffectPoint,
  SerializedNote,
  SerializedTimePoint,
  WorkerPatch,
} from './PluginTypes';

export class LuaSuspendError extends Error {
  readonly __luaSuspend = true;
  readonly prompt: PluginPromptRequest;
  constructor(prompt: PluginPromptRequest) {
    super('__luaSuspend');
    this.prompt = prompt;
  }
}

interface WorkerSeg {
  beat: Beat;
  x: number;
}

interface WorkerNote {
  id: number;
  beat: Beat;
  x: number;
  w: number;
  type?: number;
  segs: WorkerSeg[];
  extra: Record<string, unknown>;
}

interface WorkerTimePoint {
  beat: Beat;
  bpm: number;
}

interface WorkerEffectPoint {
  beat: Beat;
  kind: 'scroll' | 'jump';
  value: number;
  extra: Record<string, unknown>;
}

export interface BridgeCallbacks {
  onLog?: (chunk: string) => void;
  onNotice?: (msg: string) => void;
}

const NULL_JSON = '[null]';
const BULK_HOLDS_TAG = '@@BM_ADD_HOLDS@@';
const BULK_WIPES_TAG = '@@MSE_ADD_WIPES@@';

export class PluginBridgeWorker {
  readonly pluginName: string;
  private readonly callbacks: BridgeCallbacks;

  private readonly notes: WorkerNote[];
  private readonly times: WorkerTimePoint[];
  private readonly effects: WorkerEffectPoint[];
  private readonly selectedSet: Set<number>;
  private orderIDs: number[];
  private readonly currentSecValue: number;
  private readonly currentBeatValue: number;
  private readonly divide: number;
  private readonly widthUnits: number;
  private gridLines: number;
  private readonly meta: Record<string, unknown>;

  private timeMap: TimeMap;
  private timeMapDirty = false;

  private dirty = false;
  private selectedChanged = false;
  private orderChanged = false;
  private gridChanged = false;
  private seekToBeat?: SerializedBeat;

  private indexMap = new Map<number, number>();
  private sortedCache: number[] | null = null;
  private pendingSlides = new Set<number>();
  private nextTempId = 0;

  private logText = '';
  private unsupportedList: string[] = [];
  private notified = false;
  private readonly promptAnswers: PluginPromptAnswer[];
  private promptCursor = 0;

  constructor(
    snapshot: PluginSnapshot,
    pluginName: string,
    callbacks: BridgeCallbacks = {},
    promptAnswers: PluginPromptAnswer[] = []
  ) {
    this.pluginName = pluginName;
    this.callbacks = callbacks;
    this.promptAnswers = promptAnswers;

    this.notes = snapshot.notes.map((n) => ({
      id: n.id,
      beat: new Beat(n.beat[0], n.beat[1], n.beat[2]),
      x: n.x,
      w: n.w,
      type: n.type,
      segs: n.segs.map((s) => ({
        beat: new Beat(s.beat[0], s.beat[1], s.beat[2]),
        x: s.x,
      })),
      extra: n.extra,
    }));
    this.times = snapshot.times.map((t) => ({
      beat: new Beat(t.beat[0], t.beat[1], t.beat[2]),
      bpm: t.bpm,
    }));
    this.effects = snapshot.effects.map((e) => ({
      beat: new Beat(e.beat[0], e.beat[1], e.beat[2]),
      kind: e.kind,
      value: e.value,
      extra: e.extra,
    }));
    this.selectedSet = new Set(snapshot.selectedIDs);
    this.orderIDs = [...snapshot.orderIDs];
    this.currentSecValue = snapshot.currentSec;
    this.currentBeatValue = snapshot.currentBeat;
    this.divide = snapshot.divide;
    this.widthUnits = snapshot.widthUnits;
    this.gridLines = snapshot.gridLines;
    this.meta = snapshot.meta;
    this.timeMap = new TimeMap(this.times);
  }

  // MARK: - Beat / coercion helpers (PluginBridge.swift)

  static makeBeat(m: number, n: number, d: number): Beat {
    if (!Number.isFinite(m) || !Number.isFinite(n) || !Number.isFinite(d) || d < 1) {
      return Beat.zero;
    }
    if (d > 4_194_304 || Math.abs(m) > 100_000 || Math.abs(n) > 4_000_000_000) {
      const v = Math.max(-100_000, Math.min(100_000, m + n / d));
      return PluginBridgeWorker.reduced(Math.round(v * 1_048_576), 1_048_576);
    }
    const mi = Math.trunc(m);
    const ni = Math.trunc(n);
    const di = Math.trunc(d);
    return PluginBridgeWorker.reduced(mi * di + ni, di);
  }

  private static reduced(t: number, d: number): Beat {
    const g = gcdInt(t, d);
    return Beat.ticks(Math.trunc(t / g), Math.trunc(d / g));
  }

  private parseArgs(s: string): unknown[] {
    try {
      const parsed: unknown = JSON.parse(s);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private num(a: unknown[], i: number): number {
    const v = a[i];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    return 0;
  }

  private intv(a: unknown[], i: number): number {
    const d = this.num(a, i);
    if (!Number.isFinite(d)) return 0;
    return Math.trunc(Math.max(-1_000_000_000, Math.min(1_000_000_000, d)));
  }

  private text(a: unknown[], i: number): string {
    const v = a[i];
    return typeof v === 'string' ? v : '';
  }

  private flag(a: unknown[], i: number): boolean {
    const v = a[i];
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    return false;
  }

  private clampInt(v: number, lo: number, hi: number): number {
    if (!Number.isFinite(v)) return lo;
    return Math.trunc(Math.max(lo, Math.min(hi, Math.round(v))));
  }

  private json(v: unknown): string {
    try {
      return JSON.stringify([v === undefined ? null : v]);
    } catch {
      return NULL_JSON;
    }
  }

  private beatArr(b: Beat): SerializedBeat {
    return [b.m, b.n, b.d];
  }

  // MARK: - Note lookup & mutation tracking

  private noteIndex(idText: string): number | null {
    if (!/^-?\d+$/.test(idText)) return null;
    const u = Number.parseInt(idText, 10);
    const cached = this.indexMap.get(u);
    if (cached !== undefined && cached < this.notes.length && this.notes[cached].id === u) {
      return cached;
    }
    this.indexMap.clear();
    for (let i = 0; i < this.notes.length; i++) {
      this.indexMap.set(this.notes[i].id, i);
    }
    return this.indexMap.get(u) ?? null;
  }

  private sortedIDs(): number[] {
    if (this.sortedCache) return this.sortedCache;
    const ids = [...this.notes]
      .sort((x, y) => {
        const c = Beat.compare(x.beat, y.beat);
        return c !== 0 ? c : x.x - y.x;
      })
      .map((n) => n.id);
    this.sortedCache = ids;
    return ids;
  }

  private tailBeat(n: WorkerNote): Beat {
    const last = n.segs[n.segs.length - 1];
    return last ? n.beat.add(last.beat) : n.beat;
  }

  private typeCode(n: WorkerNote): number {
    if (n.segs.length > 0 || this.pendingSlides.has(n.id)) return 2048;
    return n.type === 4 ? 1024 : 1;
  }

  private touch(): void {
    this.dirty = true;
    this.sortedCache = null;
  }

  private getTimeMap(): TimeMap {
    if (this.timeMapDirty) {
      this.timeMap = new TimeMap(this.times);
      this.timeMapDirty = false;
    }
    return this.timeMap;
  }

  private snapBeat(v: number): Beat {
    return Beat.nearest(Math.max(0, v), this.divide);
  }

  private isReplaying(): boolean {
    return this.promptCursor < this.promptAnswers.length;
  }

  private consumeOrSuspend(prompt: PluginPromptRequest): string {
    if (this.promptCursor < this.promptAnswers.length) {
      const ans = this.promptAnswers[this.promptCursor];
      this.promptCursor += 1;
      if (ans.value === null) return NULL_JSON;
      if (prompt.kind === 'choice') {
        const idx = Number.parseInt(ans.value, 10);
        return Number.isFinite(idx) ? this.json(idx) : NULL_JSON;
      }
      return this.json(ans.value);
    }
    throw new LuaSuspendError(prompt);
  }

  // MARK: - Bulk helpers

  private addHolds(v: number[], den: number): number {
    const n = Math.trunc(v.length / 3);
    if (n === 0) return 0;
    this.touch();
    const first = this.notes.length;
    for (let k = 0; k < n; k++) {
      const head = Math.max(0, v[k * 3]);
      const x = Math.max(0, Math.min(255, v[k * 3 + 1]));
      const dur = Math.max(1, v[k * 3 + 2]);
      const headBeat = PluginBridgeWorker.makeBeat(Math.trunc(head / den), head % den, den);
      const durBeat = PluginBridgeWorker.makeBeat(Math.trunc(dur / den), dur % den, den);
      this.nextTempId -= 1;
      const note: WorkerNote = {
        id: this.nextTempId,
        beat: headBeat,
        x,
        w: 1,
        type: undefined,
        segs: [{ beat: durBeat, x: 0 }],
        extra: {},
      };
      this.notes.push(note);
      this.indexMap.set(note.id, first + k);
    }
    return n;
  }

  private addWipes(v: number[]): number {
    const n = Math.trunc(v.length / 5);
    if (n === 0) return 0;
    this.touch();
    const first = this.notes.length;
    for (let k = 0; k < n; k++) {
      let b = PluginBridgeWorker.makeBeat(v[k * 5], v[k * 5 + 1], v[k * 5 + 2]);
      if (b.value < 0) b = Beat.zero;
      this.nextTempId -= 1;
      const note: WorkerNote = {
        id: this.nextTempId,
        beat: b,
        x: this.clampInt(v[k * 5 + 3], 0, 255),
        w: this.clampInt(v[k * 5 + 4], 1, 255),
        type: 4,
        segs: [],
        extra: {},
      };
      this.notes.push(note);
      this.indexMap.set(note.id, first + k);
    }
    return n;
  }

  // MARK: - Main native entry (PluginBridge.swift :: handle)

  handle(name: string, argsJSON: string): string {
    const a = this.parseArgs(argsJSON);
    switch (name) {
      case 'poll':
        // Cancellation is handled immediately by worker.terminate() on the main thread
        return '[false]';

      case 'log': {
        const s = this.text(a, 0);
        const emit = !this.isReplaying();
        this.logText += s;
        if (s && emit) this.callbacks.onLog?.(s);
        return NULL_JSON;
      }

      case 'unsupported': {
        const fnName = this.text(a, 0);
        if (fnName && !this.unsupportedList.includes(fnName)) {
          this.unsupportedList.push(fnName);
        }
        return NULL_JSON;
      }

      case 'message': {
        const s = this.text(a, 0);
        if (!s) return NULL_JSON;
        const emit = !this.isReplaying();
        const line = `[メッセージ] ${s}\n`;
        this.logText += line;
        this.notified = true;
        if (emit) {
          this.callbacks.onLog?.(line);
          this.callbacks.onNotice?.(s);
        }
        return NULL_JSON;
      }

      case 'tip': {
        const s = this.text(a, 0);
        if (!s) return NULL_JSON;
        const emit = !this.isReplaying();
        this.notified = true;
        if (emit) {
          this.callbacks.onNotice?.(s);
        }
        return NULL_JSON;
      }

      case 'input': {
        const title = this.text(a, 0);
        if (title.startsWith(BULK_HOLDS_TAG)) {
          const parts = title.split(' ');
          const den = parts.length >= 2 ? Number.parseInt(parts[1], 10) : NaN;
          if (!Number.isSafeInteger(den) || den < 1 || den > 1_048_576) return NULL_JSON;
          const raw = this.text(a, 1);
          const nums = raw === '' ? [] : raw.split(',').map((s) => Number.parseInt(s, 10) || 0);
          if (nums.length < 3) return this.json('ok 0');
          return this.json(`ok ${this.addHolds(nums, den)}`);
        }
        if (title.startsWith(BULK_WIPES_TAG)) {
          const raw = this.text(a, 1);
          const nums = raw === '' ? [] : raw.split(',').map((s) => Number.parseFloat(s) || 0);
          if (nums.length < 5) return this.json('ok 0');
          if (nums.length % 5 !== 0) return NULL_JSON;
          return this.json(`ok ${this.addWipes(nums)}`);
        }
        return this.consumeOrSuspend({
          kind: 'input',
          message: title,
          defaultText: this.text(a, 1),
        });
      }

      case 'option': {
        const title = this.text(a, 0);
        const rawOpts = Array.isArray(a[1]) ? a[1] : [];
        const options = rawOpts.map((v) => (typeof v === 'string' ? v : String(v ?? '')));
        if (options.length === 0) return NULL_JSON;
        return this.consumeOrSuspend({
          kind: 'choice',
          message: title,
          options,
        });
      }

      case 'readBytes': {
        const title = this.text(a, 0);
        const source = this.text(a, 1);
        const fromPhotos = source === 'photo' || source === 'photos';
        return this.consumeOrSuspend({
          kind: 'filePick',
          message: title,
          fromPhotos,
        });
      }

      case 'imagePreview': {
        const title = this.text(a, 0);
        const imageBase64 = this.text(a, 1);
        if (!imageBase64) return NULL_JSON;
        return this.consumeOrSuspend({
          kind: 'imagePreview',
          message: title,
          imageBase64,
          length: this.num(a, 2),
          ticks: this.intv(a, 3),
          threshold: this.intv(a, 4),
          invert: this.intv(a, 5) !== 0,
        });
      }

      case 'decodeImage': {
        const imageBase64 = this.text(a, 0);
        const width = this.intv(a, 1);
        const height = this.intv(a, 2);
        if (
          !imageBase64 ||
          width < 1 ||
          height < 1 ||
          width > 4096 ||
          height > 65536 ||
          width * height > 64_000_000
        ) {
          return NULL_JSON;
        }
        return this.consumeOrSuspend({
          kind: 'decodeImage',
          imageBase64,
          width,
          height,
        });
      }

      case 'clickX':
      case 'spriteAdd':
      case 'spriteSet':
      case 'spriteRemove':
        return NULL_JSON;

      case 'clickBeat':
      case 'clickBeatFree':
        return this.json([0, 0, 1]);

      // ---- 情報の取得 ----
      case 'currentTimeMs':
        return this.json(this.currentSecValue * 1000.0);

      case 'currentBeat':
        return this.json(this.beatArr(this.snapBeat(this.currentBeatValue)));

      case 'divide':
        return this.json(this.divide);

      case 'ordered': {
        const ids: string[] = [];
        for (const id of this.orderIDs) {
          if (this.noteIndex(String(id)) !== null) ids.push(String(id));
        }
        return this.json(ids);
      }

      case 'clearOrder':
        if (this.orderIDs.length > 0) {
          this.orderIDs = [];
          this.orderChanged = true;
        }
        return NULL_JSON;

      case 'selected': {
        const ids = this.notes
          .filter((n) => this.selectedSet.has(n.id))
          .sort((x, y) => {
            const c = Beat.compare(x.beat, y.beat);
            return c !== 0 ? c : x.x - y.x;
          })
          .map((n) => String(n.id));
        return this.json(ids);
      }

      case 'noteCount':
        return this.json(this.notes.length);

      case 'chartInfo': {
        const key = this.text(a, 0);
        let v: unknown = this.meta[key];
        if (v === undefined && typeof this.meta.song === 'object' && this.meta.song !== null) {
          v = (this.meta.song as Record<string, unknown>)[key];
        }
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          return this.json(v);
        }
        return NULL_JSON;
      }

      case 'clearSelect':
        if (this.selectedSet.size > 0) {
          this.selectedSet.clear();
          this.selectedChanged = true;
        }
        return NULL_JSON;

      case 'noteAt': {
        const ids = this.sortedIDs();
        const i = this.intv(a, 0);
        if (i >= 0 && i < ids.length) return this.json(String(ids[i]));
        return NULL_JSON;
      }

      case 'noteTime': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return this.json(0.0);
        const n = this.notes[i];
        const b = this.flag(a, 1) ? n.beat : this.tailBeat(n);
        return this.json(this.getTimeMap().secAtBeat(b.value) * 1000.0);
      }

      case 'noteBeat': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        const n = this.notes[i];
        return this.json(this.beatArr(this.flag(a, 1) ? n.beat : this.tailBeat(n)));
      }

      case 'noteX': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return this.json(0);
        return this.json(this.notes[i].x);
      }

      case 'noteW': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return this.json(0);
        return this.json(this.notes[i].w);
      }

      case 'noteType': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return this.json(1);
        return this.json(this.typeCode(this.notes[i]));
      }

      case 'segCount': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return this.json(0);
        return this.json(this.notes[i].segs.length);
      }

      case 'segBeat': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        const j = this.intv(a, 1);
        const segs = this.notes[i].segs;
        if (j < 0 || j >= segs.length) return NULL_JSON;
        return this.json(this.beatArr(segs[j].beat));
      }

      case 'segX': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return this.json(0);
        const j = this.intv(a, 1);
        const segs = this.notes[i].segs;
        if (j < 0 || j >= segs.length) return this.json(0);
        return this.json(segs[j].x);
      }

      case 'segAll': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        const segs = this.notes[i].segs;
        const flat: number[] = [];
        for (const g of segs) {
          flat.push(g.beat.m, g.beat.n, g.beat.d, g.x);
        }
        return this.json(flat);
      }

      case 'timeCount':
        return this.json(this.times.length);

      case 'timeAt': {
        const i = this.intv(a, 0);
        if (i < 0 || i >= this.times.length) return NULL_JSON;
        const t = this.times[i];
        return this.json([t.beat.m, t.beat.n, t.beat.d, t.bpm]);
      }

      case 'effectCount':
        return this.json(this.effects.length);

      case 'effectAt': {
        const i = this.intv(a, 0);
        if (i < 0 || i >= this.effects.length) return NULL_JSON;
        const e = this.effects[i];
        return this.json([e.beat.m, e.beat.n, e.beat.d, e.kind, e.value]);
      }

      // ---- ノーツの編集 ----
      case 'addNote': {
        this.touch();
        const t = this.intv(a, 0);
        this.nextTempId -= 1;
        const note: WorkerNote = {
          id: this.nextTempId,
          beat: this.snapBeat(this.currentBeatValue),
          x: 127,
          w: Math.max(1, this.widthUnits),
          type: t === 1024 ? 4 : undefined,
          segs: [],
          extra: {},
        };
        this.notes.push(note);
        this.indexMap.set(note.id, this.notes.length - 1);
        if (t === 2048) this.pendingSlides.add(note.id);
        return this.json(String(note.id));
      }

      case 'deleteNote': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        const id = this.notes[i].id;
        this.notes.splice(i, 1);
        this.indexMap.clear();
        this.pendingSlides.delete(id);
        if (this.selectedSet.delete(id)) this.selectedChanged = true;
        return NULL_JSON;
      }

      case 'setNoteBeat': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        let b = PluginBridgeWorker.makeBeat(this.num(a, 1), this.num(a, 2), this.num(a, 3));
        if (b.value < 0) b = Beat.zero;
        this.notes[i].beat = b;
        return NULL_JSON;
      }

      case 'setNoteX': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        this.notes[i].x = this.clampInt(this.num(a, 1), 0, 255);
        return NULL_JSON;
      }

      case 'setNoteW': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        this.notes[i].w = this.clampInt(this.num(a, 1), 1, 255);
        return NULL_JSON;
      }

      case 'addSeg': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        const b = PluginBridgeWorker.makeBeat(this.num(a, 1), this.num(a, 2), this.num(a, 3));
        const segs = this.notes[i].segs;
        let pos = segs.length;
        while (pos > 0 && segs[pos - 1].beat.greaterThan(b)) pos -= 1;
        segs.splice(pos, 0, { beat: b, x: 0 });
        this.pendingSlides.delete(this.notes[i].id);
        return this.json(pos);
      }

      case 'appendSeg': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        const b = PluginBridgeWorker.makeBeat(this.num(a, 1), this.num(a, 2), this.num(a, 3));
        this.notes[i].segs.push({ beat: b, x: 0 });
        this.pendingSlides.delete(this.notes[i].id);
        return this.json(this.notes[i].segs.length - 1);
      }

      case 'setSegX': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        const j = this.intv(a, 1);
        const segs = this.notes[i].segs;
        if (j < 0 || j >= segs.length) return NULL_JSON;
        this.touch();
        segs[j].x = this.clampInt(this.num(a, 2), -100_000, 100_000);
        return NULL_JSON;
      }

      case 'delSeg': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        const segs = this.notes[i].segs;
        const wasSlide = segs.length > 0;
        const idxArg = a[1];
        if (typeof idxArg === 'number' && Number.isFinite(idxArg)) {
          const j = Math.trunc(idxArg);
          if (j >= 0 && j < segs.length) segs.splice(j, 1);
        } else {
          this.notes[i].segs = [];
        }
        if (wasSlide && this.notes[i].segs.length === 0) {
          this.pendingSlides.add(this.notes[i].id);
        }
        return NULL_JSON;
      }

      case 'setSegs': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        const arr = a[1];
        if (!Array.isArray(arr)) return NULL_JSON;
        this.touch();
        const segs: WorkerSeg[] = [];
        for (let k = 0; k + 3 < arr.length; k += 4) {
          const m = typeof arr[k] === 'number' ? arr[k] : 0;
          const n = typeof arr[k + 1] === 'number' ? arr[k + 1] : 0;
          const d = typeof arr[k + 2] === 'number' ? arr[k + 2] : 1;
          const xv = typeof arr[k + 3] === 'number' ? arr[k + 3] : 0;
          segs.push({
            beat: PluginBridgeWorker.makeBeat(m, n, d),
            x: this.clampInt(xv, -100_000, 100_000),
          });
        }
        const noteID = this.notes[i].id;
        this.notes[i].segs = segs;
        if (segs.length === 0) this.pendingSlides.add(noteID);
        else this.pendingSlides.delete(noteID);
        return NULL_JSON;
      }

      case 'deleteNotes': {
        const list = a[0];
        if (!Array.isArray(list)) return NULL_JSON;
        const doomed = new Set<number>();
        for (const v of list) {
          if (typeof v === 'string' && this.noteIndex(v) !== null) {
            doomed.add(Number.parseInt(v, 10));
          }
        }
        if (doomed.size === 0) return NULL_JSON;
        this.touch();
        for (let i = this.notes.length - 1; i >= 0; i--) {
          if (doomed.has(this.notes[i].id)) {
            this.notes.splice(i, 1);
          }
        }
        this.indexMap.clear();
        for (const id of doomed) {
          this.pendingSlides.delete(id);
          if (this.selectedSet.delete(id)) this.selectedChanged = true;
        }
        return NULL_JSON;
      }

      case 'select': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        const id = this.notes[i].id;
        if (this.flag(a, 1)) {
          if (!this.selectedSet.has(id)) {
            this.selectedSet.add(id);
            this.selectedChanged = true;
          }
        } else {
          if (this.selectedSet.delete(id)) {
            this.selectedChanged = true;
          }
        }
        return NULL_JSON;
      }

      // ---- BPM・エフェクト ----
      case 'addTime': {
        const b = PluginBridgeWorker.makeBeat(this.num(a, 0), this.num(a, 1), this.num(a, 2));
        if (b.value < 0) return NULL_JSON;
        this.touch();
        this.timeMapDirty = true;
        const bpm = Math.max(10.0, Math.min(3000.0, this.num(a, 3)));
        const idx = this.times.findIndex((t) => t.beat.equals(b));
        if (idx >= 0) this.times[idx].bpm = bpm;
        else this.times.push({ beat: b, bpm });
        this.times.sort((x, y) => Beat.compare(x.beat, y.beat));
        return NULL_JSON;
      }

      case 'delTime': {
        const idx = this.intv(a, 0);
        if (idx <= 0 || idx >= this.times.length) return NULL_JSON;
        this.touch();
        this.timeMapDirty = true;
        this.times.splice(idx, 1);
        return NULL_JSON;
      }

      case 'addEffect': {
        const b = PluginBridgeWorker.makeBeat(this.num(a, 0), this.num(a, 1), this.num(a, 2));
        const value = this.num(a, 4);
        const kind = this.text(a, 3);
        if (b.value < 0 || !Number.isFinite(value) || (kind !== 'scroll' && kind !== 'jump')) {
          return NULL_JSON;
        }
        this.touch();
        const idx = this.effects.findIndex((e) => e.beat.equals(b) && e.kind === kind);
        if (idx >= 0) this.effects[idx].value = value;
        else this.effects.push({ beat: b, kind, value, extra: {} });
        this.effects.sort((x, y) => Beat.compare(x.beat, y.beat));
        return NULL_JSON;
      }

      case 'delEffect': {
        const idx = this.intv(a, 0);
        if (idx < 0 || idx >= this.effects.length) return NULL_JSON;
        this.touch();
        this.effects.splice(idx, 1);
        return NULL_JSON;
      }

      // ---- 画面 ----
      case 'setGrid':
        this.gridLines = Math.max(1, Math.min(255, this.intv(a, 0)));
        this.gridChanged = true;
        return NULL_JSON;

      case 'seekTo': {
        const b = PluginBridgeWorker.makeBeat(this.num(a, 0), this.num(a, 1), this.num(a, 2));
        this.seekToBeat = this.beatArr(b);
        return NULL_JSON;
      }

      case 'batch':
      default:
        return NULL_JSON;
    }
  }

  takeLog(): string {
    return this.logText;
  }

  takeUnsupported(): string[] {
    return this.unsupportedList;
  }

  wasNotified(): boolean {
    return this.notified;
  }

  buildPatch(): WorkerPatch {
    const patch: WorkerPatch = {
      dirty: this.dirty,
      selectedIDs: [...this.selectedSet],
      selectedChanged: this.selectedChanged,
      orderIDs: this.orderIDs,
      orderChanged: this.orderChanged,
      gridLines: this.gridLines,
      gridChanged: this.gridChanged,
      seekToBeat: this.seekToBeat,
    };
    if (this.dirty) {
      patch.notes = this.notes.map((n): SerializedNote => ({
        id: n.id,
        beat: this.beatArr(n.beat),
        x: n.x,
        w: n.w,
        type: n.type,
        segs: n.segs.map((s) => ({ beat: this.beatArr(s.beat), x: s.x })),
        extra: n.extra,
      }));
      patch.times = this.times.map((t): SerializedTimePoint => ({
        beat: this.beatArr(t.beat),
        bpm: t.bpm,
      }));
      patch.effects = this.effects.map((e): SerializedEffectPoint => ({
        beat: this.beatArr(e.beat),
        kind: e.kind,
        value: e.value,
        extra: e.extra,
      }));
    }
    return patch;
  }
}
