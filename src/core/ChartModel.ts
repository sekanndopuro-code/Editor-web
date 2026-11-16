// ChartModel.swift :: Note / TimePoint / EffectPoint / TimeMap / ChartData (via 1.txt Phase 1)
import { Beat } from './Beat';

export type NoteID = number;

let noteIdCounter = 0; // ChartModel.swift :: NoteIDGenerator
export function nextNoteID(): NoteID {
  noteIdCounter += 1; // ChartModel.swift :: NoteIDGenerator.next
  return noteIdCounter;
}

export interface Seg {
  beat: Beat;
  x: number;
}

export interface Note {
  beat: Beat;
  x: number;
  w: number;
  type?: number;
  segs: Seg[];
  extra: Record<string, unknown>;
  id: NoteID;
}

export function isWipeNote(n: Note): boolean {
  return n.type === 4; // ChartModel.swift :: Note.isWipe
}

export function isSlideNote(n: Note): boolean {
  return n.segs.length > 0; // ChartModel.swift :: Note.isSlide
}

export function noteSpan(n: Note): { lo: number; hi: number } {
  const s = n.beat.value;
  let lo = s;
  let hi = s;
  for (const g of n.segs) {
    const v = s + g.beat.value;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return { lo, hi };
}

export function cloneNote(n: Note, newId = false): Note {
  return {
    beat: n.beat,
    x: n.x,
    w: n.w,
    type: n.type,
    segs: n.segs.map((s) => ({ beat: s.beat, x: s.x })),
    extra: structuredClone(n.extra),
    id: newId ? nextNoteID() : n.id,
  };
}

export interface TimePoint {
  beat: Beat;
  bpm: number;
}

export type EffectKind = 'scroll' | 'jump';

export interface EffectPoint {
  beat: Beat;
  kind: EffectKind;
  value: number;
  extra: Record<string, unknown>;
}

export function formatEffectValue(value: number): string {
  if (value === Math.round(value) && Math.abs(value) < 1e15) { // ChartModel.swift :: EffectPoint.valueText
    return String(Math.trunc(value));
  }
  return String(value);
}

/**
 * beat <-> 秒 の変換 (BPM変化対応)
 */
export class TimeMap {
  private readonly bs: number[] = [];
  private readonly spb: number[] = [];
  private readonly secs: number[] = [];

  constructor(pts: TimePoint[]) {
    let list = [...pts].sort((a, b) => Beat.compare(a.beat, b.beat));
    if (list.length === 0) list = [{ beat: Beat.zero, bpm: 120 }]; // ChartModel.swift :: TimeMap.init default BPM
    let t = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i].beat.value;
      if (i > 0) t += (b - this.bs[i - 1]) * this.spb[i - 1];
      this.bs.push(b);
      this.spb.push(60.0 / Math.max(1.0, list[i].bpm)); // ChartModel.swift :: TimeMap.init sec per beat
      this.secs.push(t);
    }
  }

  private static lastIndexNotAfter(x: number, a: number[]): number {
    let lo = 1;
    let hi = a.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (a[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }

  secAtBeat(b: number): number {
    const i = TimeMap.lastIndexNotAfter(b, this.bs);
    return this.secs[i] + (b - this.bs[i]) * this.spb[i];
  }

  beatAtSec(s: number): number {
    const i = TimeMap.lastIndexNotAfter(s, this.secs);
    return this.bs[i] + (s - this.secs[i]) / this.spb[i];
  }

  indexAtBeat(b: number): number {
    return TimeMap.lastIndexNotAfter(b, this.bs);
  }

  get firstSecPerBeat(): number {
    return this.spb[0] ?? 0.5; // ChartModel.swift :: TimeMap.firstSecPerBeat
  }
}

function asInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'boolean') return v ? 1 : 0; // JSONValue.swift :: intValue
  return undefined;
}

function asDouble(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0; // JSONValue.swift :: doubleValue
  return undefined;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function noteFromJSON(dict: Record<string, unknown>): Note | null {
  const b = Beat.fromJSON(dict.beat);
  if (!b) return null;
  const x = asInt(dict.x) ?? 0;  // ChartModel.swift :: Note.fromJSON default x
  const w = asInt(dict.w) ?? 64; // ChartModel.swift :: Note.fromJSON default w
  const type = asInt(dict.type);
  const segs: Seg[] = [];
  if (Array.isArray(dict.seg)) {
    for (const s of dict.seg) {
      if (!isPlainObject(s)) continue;
      const sb = Beat.fromJSON(s.beat);
      if (sb) segs.push({ beat: sb, x: asInt(s.x) ?? 0 }); // ChartModel.swift :: Note.fromJSON seg
    }
  }
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dict)) {
    if (k !== 'beat' && k !== 'x' && k !== 'w' && k !== 'type' && k !== 'seg') {
      extra[k] = v;
    }
  }
  return { beat: b, x, w, type, segs, extra, id: nextNoteID() };
}

function noteToJSON(n: Note): Record<string, unknown> {
  const d: Record<string, unknown> = { ...n.extra };
  d.beat = n.beat.json;
  d.x = n.x;
  d.w = n.w;
  if (n.type !== undefined && n.type !== 0) d.type = n.type; // ChartModel.swift :: Note.toJSON
  if (n.segs.length > 0) {
    d.seg = n.segs.map((s) => ({ beat: s.beat.json, x: s.x }));
  }
  return d;
}

/**
 * キーを昇順に並べてコンパクトな JSON 文字列にする (Swift 版 JSONValue の書き出し仕様に合わせる)
 */
function stringifySorted(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Cannot serialize non-finite number');
    }
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stringifySorted(v)).join(',') + ']';
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const v = value[k];
      if (v === undefined) continue;
      parts.push(`${JSON.stringify(k)}:${stringifySorted(v)}`);
    }
    return '{' + parts.join(',') + '}';
  }
  return JSON.stringify(value);
}

export class ChartData {
  root: Record<string, unknown>;
  times: TimePoint[];
  private _notes: Note[];
  soundEntries: Record<string, unknown>[];
  effects: EffectPoint[];
  otherEffects: Record<string, unknown>[];
  hadEffectKey: boolean;
  notesRevision = 0;

  constructor(params: {
    root: Record<string, unknown>;
    times: TimePoint[];
    notes: Note[];
    soundEntries: Record<string, unknown>[];
    effects?: EffectPoint[];
    otherEffects?: Record<string, unknown>[];
    hadEffectKey?: boolean;
  }) {
    this.root = params.root;
    this.times = params.times;
    this._notes = params.notes;
    this.soundEntries = params.soundEntries;
    this.effects = params.effects ?? [];
    this.otherEffects = params.otherEffects ?? [];
    this.hadEffectKey = params.hadEffectKey ?? false;
  }

  get notes(): Note[] {
    return this._notes;
  }

  set notes(value: Note[]) {
    this._notes = value;
    this.notesRevision += 1; // ChartModel.swift :: ChartData.notes didSet
  }

  bumpNotesRevision(): void {
    this.notesRevision += 1; // ChartModel.swift :: ChartData.notesRevision
  }

  static parse(jsonText: string): ChartData {
    const cleaned = jsonText.startsWith('\uFEFF') ? jsonText.slice(1) : jsonText; // ChartModel.swift :: ChartData.parse BOM
    const parsed: unknown = JSON.parse(cleaned);
    if (!isPlainObject(parsed)) throw new Error('Invalid mc JSON');

    const root: Record<string, unknown> = { ...parsed };

    const times: TimePoint[] = [];
    if (Array.isArray(root.time)) {
      for (const e of root.time) {
        if (!isPlainObject(e)) continue;
        const b = Beat.fromJSON(e.beat);
        const bpm = asDouble(e.bpm);
        if (b && bpm !== undefined) times.push({ beat: b, bpm });
      }
    }
    if (times.length === 0) times.push({ beat: Beat.zero, bpm: 120 }); // ChartModel.swift :: ChartData.parse default BPM

    const notes: Note[] = [];
    const sounds: Record<string, unknown>[] = [];
    if (Array.isArray(root.note)) {
      for (const e of root.note) {
        if (!isPlainObject(e)) continue;
        if (e.sound !== undefined) {
          sounds.push(e);
        } else {
          const n = noteFromJSON(e);
          if (n) notes.push(n);
        }
      }
    }

    const effects: EffectPoint[] = [];
    const others: Record<string, unknown>[] = [];
    const hadKey = root.effect !== undefined;
    if (Array.isArray(root.effect)) {
      for (const e of root.effect) {
        if (!isPlainObject(e)) continue;
        const b = Beat.fromJSON(e.beat);
        if (!b) {
          others.push(e);
          continue;
        }
        const rest: Record<string, unknown> = { ...e };
        delete rest.beat;
        let found = false;
        const sv = asDouble(e.scroll);
        if (sv !== undefined) {
          delete rest.scroll;
          effects.push({ beat: b, kind: 'scroll', value: sv, extra: {} });
          found = true;
        }
        const jv = asDouble(e.jump);
        if (jv !== undefined) {
          delete rest.jump;
          effects.push({ beat: b, kind: 'jump', value: jv, extra: {} });
          found = true;
        }
        if (!found) {
          others.push(e);
          continue;
        }
        if (Object.keys(rest).length > 0 && effects.length > 0) {
          effects[effects.length - 1].extra = rest;
        }
      }
    }

    delete root.note;
    delete root.time;
    delete root.effect;

    return new ChartData({
      root,
      times,
      notes,
      soundEntries: sounds,
      effects,
      otherEffects: others,
      hadEffectKey: hadKey,
    });
  }

  serialized(): string {
    const sortedNotes = [...this._notes].sort((a, b) => Beat.compare(a.beat, b.beat));
    const noteObjects = sortedNotes.map(noteToJSON).concat(this.soundEntries);

    const sortedEffects = [...this.effects]
      .sort((a, b) => Beat.compare(a.beat, b.beat))
      .map((e) => ({
        ...e.extra,
        beat: e.beat.json,
        [e.kind]: e.value,
      }));
    const fxObjects: Record<string, unknown>[] = (
      sortedEffects as Record<string, unknown>[]
    ).concat(this.otherEffects);
    const writeEffect = fxObjects.length > 0 || this.hadEffectKey;

    const out: Record<string, unknown> = { ...this.root };
    out.time = [...this.times]
      .sort((a, b) => Beat.compare(a.beat, b.beat))
      .map((t) => ({ beat: t.beat.json, bpm: t.bpm }));
    out.note = noteObjects;
    if (writeEffect) out.effect = fxObjects;
    else delete out.effect;

    return stringifySorted(out);
  }

  cloneForSnapshot(): { notes: Note[]; times: TimePoint[]; effects: EffectPoint[] } {
    return {
      notes: this._notes.map((n) => cloneNote(n, false)),
      times: this.times.map((t) => ({ beat: t.beat, bpm: t.bpm })),
      effects: this.effects.map((e) => ({
        beat: e.beat,
        kind: e.kind,
        value: e.value,
        extra: structuredClone(e.extra),
      })),
    };
  }

  metaString(path: string[]): string {
    let cur: unknown = this.root.meta;
    for (const k of path) {
      if (!isPlainObject(cur)) return '';
      cur = cur[k];
    }
    return typeof cur === 'string' ? cur : '';
  }

  setMetaString(path: string[], v: string): void {
    const meta: Record<string, unknown> = isPlainObject(this.root.meta)
      ? { ...this.root.meta }
      : {};
    if (path.length === 1) {
      meta[path[0]] = v;
    } else if (path.length === 2) {
      const sub: Record<string, unknown> = isPlainObject(meta[path[0]])
        ? { ...(meta[path[0]] as Record<string, unknown>) }
        : {};
      sub[path[1]] = v;
      meta[path[0]] = sub;
    }
    this.root.meta = meta;
  }

  get soundFile(): string {
    const v = this.soundEntries[0]?.sound;
    return typeof v === 'string' ? v : '';
  }

  set soundFile(newValue: string) {
    if (this.soundEntries.length === 0) {
      this.soundEntries = [{ beat: [0, 0, 1], sound: newValue, vol: 100, offset: 0, type: 1 }]; // ChartModel.swift :: soundFile default sound entry
    } else {
      this.soundEntries[0].sound = newValue;
    }
  }

  get offsetMs(): number {
    return asInt(this.soundEntries[0]?.offset) ?? 0; // ChartModel.swift :: ChartData.offsetMs
  }

  set offsetMs(newValue: number) {
    if (this.soundEntries.length === 0) {
      this.soundEntries = [{ beat: [0, 0, 1], sound: '', vol: 100, offset: newValue, type: 1 }]; // ChartModel.swift :: offsetMs default sound entry
    } else {
      this.soundEntries[0].offset = newValue;
    }
  }

  testInt(key: string): number | undefined {
    const extra = this.root.extra;
    if (!isPlainObject(extra)) return undefined;
    const test = extra.test;
    if (!isPlainObject(test)) return undefined;
    return asInt(test[key]);
  }

  setTest(key: string, value: number): void {
    const extra: Record<string, unknown> = isPlainObject(this.root.extra)
      ? { ...this.root.extra }
      : {};
    const test: Record<string, unknown> = isPlainObject(extra.test)
      ? { ...extra.test }
      : {};
    test[key] = Math.trunc(value);
    extra.test = test;
    this.root.extra = extra;
  }
}
