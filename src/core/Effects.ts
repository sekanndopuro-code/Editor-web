// Effects.swift :: EffectMap (via 1.txt Phase 1)

export interface EffectEvent {
  t: number;
  scroll: number | null;
  jumpMs: number;
}

export interface TimeRange {
  lo: number;
  hi: number;
}

/**
 * effect (scroll / jump) による「表示位置 P(t)」の関数
 */
export class EffectMap {
  readonly starts: number[];
  readonly bases: number[];
  readonly slopes: number[];
  readonly negFrom: number;

  static readonly none = new EffectMap([], [], [], Infinity); // Effects.swift :: EffectMap.none

  constructor(starts: number[], bases: number[], slopes: number[], negFrom: number) {
    this.starts = starts;
    this.bases = bases;
    this.slopes = slopes;
    this.negFrom = negFrom;
  }

  get isEmpty(): boolean {
    return this.starts.length === 0;
  }

  static make(events: EffectEvent[]): EffectMap {
    if (events.length === 0) return EffectMap.none;
    const sorted = [...events].sort((a, b) => a.t - b.t);
    const merged: EffectEvent[] = [];
    for (const e of sorted) {
      const last = merged[merged.length - 1];
      if (last && Math.abs(last.t - e.t) < 1e-9) { // Effects.swift :: EffectMap.make(_:)
        if (e.scroll !== null) last.scroll = e.scroll;
        last.jumpMs += e.jumpMs;
      } else {
        merged.push({ t: e.t, scroll: e.scroll, jumpMs: e.jumpMs });
      }
    }

    const starts: number[] = [];
    const bases: number[] = [];
    const slopes: number[] = [];
    let slope = 1.0; // Effects.swift :: EffectMap.make(_:) initial scroll slope
    let neg = Infinity; // Effects.swift :: EffectMap.make(_:) initial negFrom

    for (const e of merged) {
      let pHere: number;
      if (starts.length > 0) {
        const idx = starts.length - 1;
        pHere = bases[idx] + slopes[idx] * (e.t - starts[idx]);
      } else {
        pHere = e.t;
      }
      if (e.scroll !== null) slope = e.scroll;
      const jumpSec = (e.jumpMs / 1000) * slope; // Effects.swift :: EffectMap.make(_:) ms -> sec
      if (slope < 0 || jumpSec < 0) neg = Math.min(neg, e.t); // Effects.swift :: EffectMap.make(_:)
      starts.push(e.t);
      bases.push(pHere + jumpSec);
      slopes.push(slope);
    }

    return new EffectMap(starts, bases, slopes, neg);
  }

  private segmentAt(t: number): number | null {
    if (this.starts.length === 0 || t < this.starts[0]) return null;
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  p(t: number): number {
    const k = this.segmentAt(t);
    if (k === null) return t;
    return this.bases[k] + this.slopes[k] * (t - this.starts[k]);
  }

  scrollAt(t: number): number {
    const k = this.segmentAt(t);
    if (k === null) return 1.0; // Effects.swift :: EffectMap.scroll(at:)
    return this.slopes[k];
  }

  timeRanges(lo: number, hi: number): TimeRange[] {
    if (this.starts.length === 0) return [{ lo, hi }];
    const first = this.starts[0];
    const out: TimeRange[] = [];
    if (lo < first) out.push({ lo, hi: Math.min(hi, first) });

    for (let k = 0; k < this.starts.length; k++) {
      const ts = this.starts[k];
      const te = k + 1 < this.starts.length ? this.starts[k + 1] : Infinity;
      const s = this.slopes[k];
      const b = this.bases[k];
      if (s === 0) { // Effects.swift :: EffectMap.timeRanges(p:_:)
        if (b >= lo && b <= hi) out.push({ lo: ts, hi: te });
        continue;
      }
      let t1 = ts + (lo - b) / s;
      let t2 = ts + (hi - b) / s;
      if (s < 0) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      const a = Math.max(t1, ts);
      const c = Math.min(t2, te);
      if (a <= c) out.push({ lo: a, hi: c });
    }
    return out;
  }
}
