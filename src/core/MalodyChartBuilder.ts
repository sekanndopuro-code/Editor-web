// MalodyChartBuilder.swift :: MalodyChart.make(from:)
// Converts an in-memory ChartData into a playable MalodyChart structure matching MalodyChartBuilder.swift verbatim.

import { Beat } from './Beat';
import { ChartData } from './ChartModel';
import { EffectEvent, EffectMap } from './Effects';

export type PlayNoteKind = 'tap' | 'slide' | 'wipe';

export interface PlaySlidePoint {
  t: number;
  x: number;
}

export interface PlayNote {
  kind: PlayNoteKind;
  t: number;
  x: number;
  w: number;
  path?: PlaySlidePoint[];
  ribbon?: PlaySlidePoint[];
}

export interface MalodyChart {
  title: string;
  offset: number;
  notes: PlayNote[];
  effects: EffectMap;
}

export class PlayChartError extends Error {
  readonly code: 'noTiming';

  constructor(code: 'noTiming' = 'noTiming', message = 'No valid BPM timing points found') {
    super(message);
    this.name = 'PlayChartError';
    this.code = code;
  }
}

function asDouble(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0; // JSONValue.swift :: doubleValue
  return undefined;
}

function asInt(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'boolean') return v ? 1 : 0; // JSONValue.swift :: intValue
  return undefined;
}

/**
 * MalodyChartBuilder.swift :: MalodyChart.make(from:)
 * Builds PlayNote / EffectMap directly from in-memory ChartData using the exact
 * beat -> seconds accumulation order and slide monotonicity rule from Swift.
 */
export function buildMalodyChart(chart: ChartData): MalodyChart {
  // MalodyChartBuilder.swift :: MalodyChart.make(from:) -> jb(_:)
  const jb = (b: Beat): number => {
    const t = b.json;
    if (t[2] === 0) return 0;
    return t[0] + t[1] / t[2];
  };

  // MalodyChartBuilder.swift :: MalodyChart.make(from:) -> timing
  const timing = [...chart.times]
    .sort((a, b) => Beat.compare(a.beat, b.beat))
    .map((tp) => ({ beat: jb(tp.beat), bpm: tp.bpm }))
    .filter((tp) => tp.bpm > 0)
    .sort((a, b) => a.beat - b.beat);

  const head = timing[0];
  if (!head) {
    throw new PlayChartError('noTiming'); // MalodyChartBuilder.swift :: PlayChartError.noTiming
  }

  // MalodyChartBuilder.swift :: MalodyChart.make(from:) -> cum
  const cum = new Array<number>(timing.length).fill(0);
  let t = 0.0;
  let pb = head.beat;
  let bpm = head.bpm;
  for (let k = 1; k < Math.max(1, timing.length); k++) {
    const e = timing[k];
    t += ((e.beat - pb) * 60) / bpm; // MalodyChartBuilder.swift :: MalodyChart.make(from:)
    pb = e.beat;
    bpm = e.bpm;
    cum[k] = t;
  }

  // MalodyChartBuilder.swift :: MalodyChart.make(from:) -> sec(_:)
  const sec = (b: number): number => {
    let lo = 1;
    let hi = timing.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (timing[mid].beat < b) lo = mid + 1;
      else hi = mid;
    }
    const k = lo - 1;
    return cum[k] + ((b - timing[k].beat) * 60) / timing[k].bpm;
  };

  // MalodyChartBuilder.swift :: MalodyChart.make(from:) -> notes
  const notes: PlayNote[] = [];
  let offset = 0.0;
  const sortedNotes = [...chart.notes].sort((a, b) => Beat.compare(a.beat, b.beat));
  for (const n of sortedNotes) {
    if (n.type === 1) {
      offset = (asDouble(n.extra.offset) ?? 0) / 1000; // MalodyChartBuilder.swift :: MalodyChart.make(from:) sound note offset
      continue;
    }
    const x = n.x;
    const w = n.w;
    const b = jb(n.beat);
    const t0 = sec(b);
    if (n.type === 4) {
      notes.push({ kind: 'wipe', t: t0, x, w }); // MalodyChartBuilder.swift :: PlayNote(kind: .wipe)
    } else if (n.segs.length > 0) {
      const all: PlaySlidePoint[] = [{ t: t0, x }];
      for (const s of n.segs) {
        all.push({ t: sec(b + jb(s.beat)), x: x + s.x }); // MalodyChartBuilder.swift :: relative seg beat & x
      }
      const path: PlaySlidePoint[] = [all[0]];
      for (let i = 1; i < all.length; i++) {
        const p = all[i];
        if (p.t < path[path.length - 1].t - 0.000001) break; // MalodyChartBuilder.swift :: monotonic slide cutoff (-0.000001)
        path.push(p);
      }
      notes.push({ kind: 'slide', t: t0, x, w, path, ribbon: all }); // MalodyChartBuilder.swift :: PlayNote(kind: .slide)
    } else {
      notes.push({ kind: 'tap', t: t0, x, w }); // MalodyChartBuilder.swift :: PlayNote(kind: .tap)
    }
  }

  // MalodyChartBuilder.swift :: MalodyChart.make(from:) -> soundEntries override
  for (const s of chart.soundEntries) {
    if (asInt(s.type) === 1) {
      offset = (asDouble(s.offset) ?? 0) / 1000;
    }
  }
  notes.sort((a, b) => a.t - b.t); // MalodyChartBuilder.swift :: MalodyChart.make(from:) note time sort

  // MalodyChartBuilder.swift :: MalodyChart.make(from:) -> effects
  const events: EffectEvent[] = [];
  const sortedEffects = [...chart.effects].sort((a, b) => Beat.compare(a.beat, b.beat));
  for (const e of sortedEffects) {
    if (e.beat.json[2] === 0) continue;
    const b = jb(e.beat);
    events.push({
      t: sec(b),
      scroll: e.kind === 'scroll' ? e.value : null,
      jumpMs: e.kind === 'jump' ? e.value : 0,
    });
  }

  return {
    title: chart.metaString(['song', 'title']),
    offset,
    notes,
    effects: EffectMap.make(events),
  };
}
