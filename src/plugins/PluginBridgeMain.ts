// PluginBridge.swift ported for synchronous main-thread interactive tool plugins (PluginSession).
// Mutates EditorState directly on touch events, batches 1 gesture = 1 Undo step via beginGesture(),
// and manages PluginSprite overlays displayed on top of the lane.

import { Beat, gcdInt } from '../core/Beat';
import { isSlideNote, isWipeNote, nextNoteID, type Note } from '../core/ChartModel';
import type { EditorState } from '../state/EditorState';

const NULL_JSON = '[null]';
const BULK_HOLDS_TAG = '@@BM_ADD_HOLDS@@';
const BULK_WIPES_TAG = '@@MSE_ADD_WIPES@@';

export class PluginBridgeMain {
  private readonly state: EditorState;
  readonly pluginName: string;
  private readonly assetFolder: string;

  private undoPushed = false;
  private chartDirty = false;
  private uiDirty = false;
  private spriteDirty = false;

  private indexMap = new Map<number, number>();
  private sortedCache: number[] | null = null;
  private pendingSlides = new Set<number>();

  private clickXValue = 127.0;
  private clickBeatSnapped: Beat = Beat.zero;
  private clickBeatFreeValue = 0.0;
  private deadlineMs: number | null = null;
  private cancelled = false;

  constructor(state: EditorState, pluginName: string, assetFolder = '') {
    this.state = state;
    this.pluginName = pluginName;
    this.assetFolder = assetFolder;
  }

  static makeBeat(m: number, n: number, d: number): Beat {
    if (!Number.isFinite(m) || !Number.isFinite(n) || !Number.isFinite(d) || d < 1) {
      return Beat.zero;
    }
    if (d > 4_194_304 || Math.abs(m) > 100_000 || Math.abs(n) > 4_000_000_000) {
      const v = Math.max(-100_000, Math.min(100_000, m + n / d));
      return PluginBridgeMain.reduced(Math.round(v * 1_048_576), 1_048_576);
    }
    const mi = Math.trunc(m);
    const ni = Math.trunc(n);
    const di = Math.trunc(d);
    return PluginBridgeMain.reduced(mi * di + ni, di);
  }

  private static reduced(t: number, d: number): Beat {
    const g = gcdInt(t, d);
    return Beat.ticks(Math.trunc(t / g), Math.trunc(d / g));
  }

  setClick(x: number, snapped: Beat, free: number): void {
    this.clickXValue = x;
    this.clickBeatSnapped = snapped;
    this.clickBeatFreeValue = free;
  }

  setDeadline(deadlineMs: number | null): void {
    this.deadlineMs = deadlineMs;
  }

  cancel(): void {
    this.cancelled = true;
  }

  beginGesture(): void {
    this.undoPushed = false;
  }

  flushMain(): void {
    const chartWasDirty = this.chartDirty;
    const uiWasDirty = this.uiDirty;
    const spriteWasDirty = this.spriteDirty;
    this.chartDirty = false;
    this.uiDirty = false;
    this.spriteDirty = false;

    if (chartWasDirty) {
      this.state.chartChanged();
    } else if (uiWasDirty) {
      this.state.emitUI();
    } else if (spriteWasDirty) {
      this.state.emitFrame();
    }
  }

  // MARK: - Helpers

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

  private beatArr(b: Beat): [number, number, number] {
    return [b.m, b.n, b.d];
  }

  private noteIndex(idText: string): number | null {
    if (!/^-?\d+$/.test(idText)) return null;
    const u = Number.parseInt(idText, 10);
    const notes = this.state.chart.notes;
    const cached = this.indexMap.get(u);
    if (cached !== undefined && cached < notes.length && notes[cached].id === u) {
      return cached;
    }
    this.indexMap.clear();
    for (let i = 0; i < notes.length; i++) {
      this.indexMap.set(notes[i].id, i);
    }
    return this.indexMap.get(u) ?? null;
  }

  private sortedIDs(): number[] {
    if (this.sortedCache) return this.sortedCache;
    const ids = [...this.state.chart.notes]
      .sort((x, y) => {
        const c = Beat.compare(x.beat, y.beat);
        return c !== 0 ? c : x.x - y.x;
      })
      .map((n) => n.id);
    this.sortedCache = ids;
    return ids;
  }

  private tailBeat(n: Note): Beat {
    const last = n.segs[n.segs.length - 1];
    return last ? n.beat.add(last.beat) : n.beat;
  }

  private typeCode(n: Note): number {
    if (isSlideNote(n) || this.pendingSlides.has(n.id)) return 2048;
    return isWipeNote(n) ? 1024 : 1;
  }

  private touch(): void {
    if (!this.undoPushed) {
      this.state.pushUndo();
      this.undoPushed = true;
    }
    this.chartDirty = true;
    this.sortedCache = null;
  }

  private addHolds(v: number[], den: number): number {
    const n = Math.trunc(v.length / 3);
    if (n === 0) return 0;
    this.touch();
    const first = this.state.chart.notes.length;
    for (let k = 0; k < n; k++) {
      const head = Math.max(0, v[k * 3]);
      const x = Math.max(0, Math.min(255, v[k * 3 + 1]));
      const dur = Math.max(1, v[k * 3 + 2]);
      const headBeat = PluginBridgeMain.makeBeat(Math.trunc(head / den), head % den, den);
      const durBeat = PluginBridgeMain.makeBeat(Math.trunc(dur / den), dur % den, den);
      const note: Note = {
        id: nextNoteID(),
        beat: headBeat,
        x,
        w: 1,
        segs: [{ beat: durBeat, x: 0 }],
        extra: {},
      };
      this.state.chart.notes.push(note);
      this.indexMap.set(note.id, first + k);
    }
    return n;
  }

  private addWipes(v: number[]): number {
    const n = Math.trunc(v.length / 5);
    if (n === 0) return 0;
    this.touch();
    const first = this.state.chart.notes.length;
    for (let k = 0; k < n; k++) {
      let b = PluginBridgeMain.makeBeat(v[k * 5], v[k * 5 + 1], v[k * 5 + 2]);
      if (b.value < 0) b = Beat.zero;
      const note: Note = {
        id: nextNoteID(),
        beat: b,
        x: this.clampInt(v[k * 5 + 3], 0, 255),
        w: this.clampInt(v[k * 5 + 4], 1, 255),
        type: 4,
        segs: [],
        extra: {},
      };
      this.state.chart.notes.push(note);
      this.indexMap.set(note.id, first + k);
    }
    return n;
  }

  // MARK: - Main entry

  handle(name: string, argsJSON: string): string {
    const a = this.parseArgs(argsJSON);

    switch (name) {
      case 'poll':
        if (this.cancelled) return '[true]';
        if (this.deadlineMs !== null && performance.now() > this.deadlineMs) return '[true]';
        return '[false]';

      case 'log': {
        const s = this.text(a, 0);
        if (s) {
          this.state.pluginLog += s;
          this.uiDirty = true;
        }
        return NULL_JSON;
      }

      case 'unsupported':
        return NULL_JSON;

      case 'clickX':
        return this.json(this.clickXValue);

      case 'clickBeat':
        return this.json(this.beatArr(this.clickBeatSnapped));

      case 'clickBeatFree':
        return this.json(this.beatArr(Beat.nearest(this.clickBeatFreeValue, 1_048_576)));

      case 'message': {
        const s = this.text(a, 0);
        if (!s) return NULL_JSON;
        this.state.pluginLog += `[メッセージ] ${s}\n`;
        this.uiDirty = true;
        this.state.showPluginNotice(s);
        return NULL_JSON;
      }

      case 'tip': {
        const s = this.text(a, 0);
        if (!s) return NULL_JSON;
        this.state.showPluginNotice(s);
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
        // Interactive plugin on main thread: non-blocking display only (PluginBridge.swift :: dialogOnMain)
        this.flushMain();
        this.state.showPluginMessage(this.pluginName, title);
        return NULL_JSON;
      }

      case 'option':
      case 'readBytes':
      case 'imagePreview':
      case 'decodeImage':
        return NULL_JSON;

      // ---- 情報の取得 ----
      case 'currentTimeMs':
        return this.json(this.state.currentSec() * 1000.0);

      case 'currentBeat':
        return this.json(this.beatArr(this.state.snapBeat(this.state.currentBeat())));

      case 'divide':
        return this.json(this.state.snapDen);

      case 'ordered': {
        const ids: string[] = [];
        for (const id of this.state.orderIDs) {
          if (this.noteIndex(String(id)) !== null) ids.push(String(id));
        }
        return this.json(ids);
      }

      case 'clearOrder':
        if (this.state.orderIDs.length > 0) {
          this.state.orderIDs = [];
          this.uiDirty = true;
        }
        return NULL_JSON;

      case 'selected': {
        const ids = this.state.chart.notes
          .filter((n) => this.state.selectedIDs.has(n.id))
          .sort((x, y) => {
            const c = Beat.compare(x.beat, y.beat);
            return c !== 0 ? c : x.x - y.x;
          })
          .map((n) => String(n.id));
        return this.json(ids);
      }

      case 'noteCount':
        return this.json(this.state.chart.notes.length);

      case 'chartInfo': {
        const key = this.text(a, 0);
        const rawMeta = this.state.chart.root.meta;
        const meta =
          typeof rawMeta === 'object' && rawMeta !== null && !Array.isArray(rawMeta)
            ? (rawMeta as Record<string, unknown>)
            : {};
        let v: unknown = meta[key];
        if (v === undefined && typeof meta.song === 'object' && meta.song !== null) {
          v = (meta.song as Record<string, unknown>)[key];
        }
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          return this.json(v);
        }
        return NULL_JSON;
      }

      case 'clearSelect':
        if (this.state.selectedIDs.size > 0) {
          this.state.selectedIDs = new Set();
          this.uiDirty = true;
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
        const n = this.state.chart.notes[i];
        const b = this.flag(a, 1) ? n.beat : this.tailBeat(n);
        return this.json(this.state.timeMap.secAtBeat(b.value) * 1000.0);
      }

      case 'noteBeat': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        const n = this.state.chart.notes[i];
        return this.json(this.beatArr(this.flag(a, 1) ? n.beat : this.tailBeat(n)));
      }

      case 'noteX': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return this.json(0);
        return this.json(this.state.chart.notes[i].x);
      }

      case 'noteW': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return this.json(0);
        return this.json(this.state.chart.notes[i].w);
      }

      case 'noteType': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return this.json(1);
        return this.json(this.typeCode(this.state.chart.notes[i]));
      }

      case 'segCount': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return this.json(0);
        return this.json(this.state.chart.notes[i].segs.length);
      }

      case 'segBeat': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        const j = this.intv(a, 1);
        const segs = this.state.chart.notes[i].segs;
        if (j < 0 || j >= segs.length) return NULL_JSON;
        return this.json(this.beatArr(segs[j].beat));
      }

      case 'segX': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return this.json(0);
        const j = this.intv(a, 1);
        const segs = this.state.chart.notes[i].segs;
        if (j < 0 || j >= segs.length) return this.json(0);
        return this.json(segs[j].x);
      }

      case 'segAll': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        const segs = this.state.chart.notes[i].segs;
        const flat: number[] = [];
        for (const g of segs) {
          flat.push(g.beat.m, g.beat.n, g.beat.d, g.x);
        }
        return this.json(flat);
      }

      case 'timeCount':
        return this.json(this.state.chart.times.length);

      case 'timeAt': {
        const i = this.intv(a, 0);
        if (i < 0 || i >= this.state.chart.times.length) return NULL_JSON;
        const t = this.state.chart.times[i];
        return this.json([t.beat.m, t.beat.n, t.beat.d, t.bpm]);
      }

      case 'effectCount':
        return this.json(this.state.chart.effects.length);

      case 'effectAt': {
        const i = this.intv(a, 0);
        if (i < 0 || i >= this.state.chart.effects.length) return NULL_JSON;
        const e = this.state.chart.effects[i];
        return this.json([e.beat.m, e.beat.n, e.beat.d, e.kind, e.value]);
      }

      // ---- ノーツの編集 ----
      case 'addNote': {
        this.touch();
        const t = this.intv(a, 0);
        const note: Note = {
          id: nextNoteID(),
          beat: this.state.snapBeat(this.state.currentBeat()),
          x: 127,
          w: Math.max(1, this.state.widthUnits),
          type: t === 1024 ? 4 : undefined,
          segs: [],
          extra: {},
        };
        this.state.chart.notes.push(note);
        this.indexMap.set(note.id, this.state.chart.notes.length - 1);
        if (t === 2048) this.pendingSlides.add(note.id);
        return this.json(String(note.id));
      }

      case 'deleteNote': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        const id = this.state.chart.notes[i].id;
        this.state.chart.notes.splice(i, 1);
        this.indexMap.clear();
        this.pendingSlides.delete(id);
        this.state.selectedIDs.delete(id);
        return NULL_JSON;
      }

      case 'setNoteBeat': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        let b = PluginBridgeMain.makeBeat(this.num(a, 1), this.num(a, 2), this.num(a, 3));
        if (b.value < 0) b = Beat.zero;
        this.state.chart.notes[i].beat = b;
        return NULL_JSON;
      }

      case 'setNoteX': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        this.state.chart.notes[i].x = this.clampInt(this.num(a, 1), 0, 255);
        return NULL_JSON;
      }

      case 'setNoteW': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        this.state.chart.notes[i].w = this.clampInt(this.num(a, 1), 1, 255);
        return NULL_JSON;
      }

      case 'addSeg': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        const b = PluginBridgeMain.makeBeat(this.num(a, 1), this.num(a, 2), this.num(a, 3));
        const segs = this.state.chart.notes[i].segs;
        let pos = segs.length;
        while (pos > 0 && segs[pos - 1].beat.greaterThan(b)) pos -= 1;
        segs.splice(pos, 0, { beat: b, x: 0 });
        this.pendingSlides.delete(this.state.chart.notes[i].id);
        return this.json(pos);
      }

      case 'appendSeg': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        const b = PluginBridgeMain.makeBeat(this.num(a, 1), this.num(a, 2), this.num(a, 3));
        this.state.chart.notes[i].segs.push({ beat: b, x: 0 });
        this.pendingSlides.delete(this.state.chart.notes[i].id);
        return this.json(this.state.chart.notes[i].segs.length - 1);
      }

      case 'setSegX': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        const j = this.intv(a, 1);
        const segs = this.state.chart.notes[i].segs;
        if (j < 0 || j >= segs.length) return NULL_JSON;
        this.touch();
        segs[j].x = this.clampInt(this.num(a, 2), -100_000, 100_000);
        return NULL_JSON;
      }

      case 'delSeg': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        this.touch();
        const segs = this.state.chart.notes[i].segs;
        const wasSlide = segs.length > 0;
        const idxArg = a[1];
        if (typeof idxArg === 'number' && Number.isFinite(idxArg)) {
          const j = Math.trunc(idxArg);
          if (j >= 0 && j < segs.length) segs.splice(j, 1);
        } else {
          this.state.chart.notes[i].segs = [];
        }
        if (wasSlide && this.state.chart.notes[i].segs.length === 0) {
          this.pendingSlides.add(this.state.chart.notes[i].id);
        }
        return NULL_JSON;
      }

      case 'setSegs': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        const arr = a[1];
        if (!Array.isArray(arr)) return NULL_JSON;
        this.touch();
        const segs = [];
        for (let k = 0; k + 3 < arr.length; k += 4) {
          const m = typeof arr[k] === 'number' ? arr[k] : 0;
          const n = typeof arr[k + 1] === 'number' ? arr[k + 1] : 0;
          const d = typeof arr[k + 2] === 'number' ? arr[k + 2] : 1;
          const xv = typeof arr[k + 3] === 'number' ? arr[k + 3] : 0;
          segs.push({
            beat: PluginBridgeMain.makeBeat(m, n, d),
            x: this.clampInt(xv, -100_000, 100_000),
          });
        }
        const noteID = this.state.chart.notes[i].id;
        this.state.chart.notes[i].segs = segs;
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
        const notes = this.state.chart.notes;
        for (let i = notes.length - 1; i >= 0; i--) {
          if (doomed.has(notes[i].id)) notes.splice(i, 1);
        }
        this.indexMap.clear();
        for (const id of doomed) {
          this.pendingSlides.delete(id);
          this.state.selectedIDs.delete(id);
        }
        return NULL_JSON;
      }

      case 'select': {
        const i = this.noteIndex(this.text(a, 0));
        if (i === null) return NULL_JSON;
        const id = this.state.chart.notes[i].id;
        const next = new Set(this.state.selectedIDs);
        if (this.flag(a, 1)) next.add(id);
        else next.delete(id);
        this.state.selectedIDs = next;
        this.uiDirty = true;
        return NULL_JSON;
      }

      // ---- BPM・エフェクト ----
      case 'addTime': {
        const b = PluginBridgeMain.makeBeat(this.num(a, 0), this.num(a, 1), this.num(a, 2));
        if (b.value < 0) return NULL_JSON;
        this.touch();
        const bpm = Math.max(10.0, Math.min(3000.0, this.num(a, 3)));
        const idx = this.state.chart.times.findIndex((t) => t.beat.equals(b));
        if (idx >= 0) this.state.chart.times[idx].bpm = bpm;
        else this.state.chart.times.push({ beat: b, bpm });
        this.state.chart.times.sort((x, y) => Beat.compare(x.beat, y.beat));
        return NULL_JSON;
      }

      case 'delTime': {
        const idx = this.intv(a, 0);
        if (idx <= 0 || idx >= this.state.chart.times.length) return NULL_JSON;
        this.touch();
        this.state.chart.times.splice(idx, 1);
        return NULL_JSON;
      }

      case 'addEffect': {
        const b = PluginBridgeMain.makeBeat(this.num(a, 0), this.num(a, 1), this.num(a, 2));
        const value = this.num(a, 4);
        const kind = this.text(a, 3);
        if (b.value < 0 || !Number.isFinite(value) || (kind !== 'scroll' && kind !== 'jump')) {
          return NULL_JSON;
        }
        this.touch();
        const idx = this.state.chart.effects.findIndex((e) => e.beat.equals(b) && e.kind === kind);
        if (idx >= 0) this.state.chart.effects[idx].value = value;
        else this.state.chart.effects.push({ beat: b, kind, value, extra: {} });
        this.state.chart.effects.sort((x, y) => Beat.compare(x.beat, y.beat));
        return NULL_JSON;
      }

      case 'delEffect': {
        const idx = this.intv(a, 0);
        if (idx < 0 || idx >= this.state.chart.effects.length) return NULL_JSON;
        this.touch();
        this.state.chart.effects.splice(idx, 1);
        return NULL_JSON;
      }

      // ---- スプライト (レーンの上に重ねる画像) ----
      case 'spriteAdd': {
        const spriteName = this.text(a, 0);
        const image = this.text(a, 1);
        if (!spriteName) return NULL_JSON;
        const idx = this.state.pluginSprites.findIndex((sp) => sp.id === spriteName);
        if (idx >= 0) {
          this.state.pluginSprites[idx].image = image;
          this.state.pluginSprites[idx].folder = this.assetFolder;
        } else {
          this.state.pluginSprites.push({
            id: spriteName,
            image,
            folder: this.assetFolder,
            beat: 0,
            endBeat: null,
            x: 50,
            width: 10,
            visible: true,
          });
        }
        this.spriteDirty = true;
        return NULL_JSON;
      }

      case 'spriteSet': {
        const spriteName = this.text(a, 0);
        const idx = this.state.pluginSprites.findIndex((sp) => sp.id === spriteName);
        if (idx < 0) return NULL_JSON;
        const prop = this.text(a, 1);
        const value = a[2];
        const sp = this.state.pluginSprites[idx];
        switch (prop) {
          case 'Beat':
            if (Array.isArray(value) && value.length >= 3) {
              const m = typeof value[0] === 'number' ? value[0] : 0;
              const n = typeof value[1] === 'number' ? value[1] : 0;
              const d = typeof value[2] === 'number' ? value[2] : 1;
              sp.beat = d > 0 ? m + n / d : m;
            } else if (typeof value === 'number' && Number.isFinite(value)) {
              sp.beat = value;
            }
            break;
          case 'EndBeat':
            if (Array.isArray(value) && value.length >= 3) {
              const m = typeof value[0] === 'number' ? value[0] : 0;
              const n = typeof value[1] === 'number' ? value[1] : 0;
              const d = typeof value[2] === 'number' ? value[2] : 1;
              sp.endBeat = d > 0 ? m + n / d : m;
            } else if (typeof value === 'number' && Number.isFinite(value)) {
              sp.endBeat = value;
            } else {
              sp.endBeat = null;
            }
            break;
          case 'X':
            if (typeof value === 'number' && Number.isFinite(value)) sp.x = value;
            break;
          case 'Width':
            if (typeof value === 'number' && Number.isFinite(value)) sp.width = value;
            break;
          case 'Visible':
            if (typeof value === 'boolean') sp.visible = value;
            else if (typeof value === 'number') sp.visible = value !== 0;
            break;
          default:
            break;
        }
        this.spriteDirty = true;
        return NULL_JSON;
      }

      case 'spriteRemove': {
        const spriteName = this.text(a, 0);
        const next = this.state.pluginSprites.filter((sp) => sp.id !== spriteName);
        if (next.length !== this.state.pluginSprites.length) {
          this.state.pluginSprites = next;
          this.spriteDirty = true;
        }
        return NULL_JSON;
      }

      // ---- 画面 ----
      case 'setGrid':
        this.state.gridLines = Math.max(1, Math.min(255, this.intv(a, 0)));
        this.uiDirty = true;
        return NULL_JSON;

      case 'seekTo': {
        const b = PluginBridgeMain.makeBeat(this.num(a, 0), this.num(a, 1), this.num(a, 2));
        this.state.setViewBeat(b.value);
        return NULL_JSON;
      }

      case 'batch':
      default:
        return NULL_JSON;
    }
  }
}
