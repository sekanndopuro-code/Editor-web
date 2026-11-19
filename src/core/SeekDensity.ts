// SeekDensity.swift :: SeekDensity (via 1.txt Phase 1)
import type { Note, TimeMap } from './ChartModel';

export const SeekDensity = {
  binCount: 120, // SeekDensity.swift :: SeekDensity.binCount
  levelCap: 20,  // SeekDensity.swift :: SeekDensity.levelCap

  counts(notes: Note[], timeMap: TimeMap, totalSec: number, minSec = 0): number[] {
    const out = new Array<number>(this.binCount).fill(0);
    const span = totalSec - minSec;
    if (!(span > 0)) return out;
    const scale = this.binCount / span;
    const last = this.binCount - 1;

    for (const n of notes) {
      const beat = n.beat.value;
      if (!Number.isFinite(beat)) continue;
      const sec = timeMap.secAtBeat(beat);
      if (!Number.isFinite(sec) || sec < minSec || sec > totalSec) continue;
      let k = Math.trunc((sec - minSec) * scale);
      if (k < 0) k = 0;
      if (k > last) k = last;
      out[k] += 1;
    }
    return out;
  },

  ratios(counts: number[]): number[] {
    const capped = counts.map((c) => Math.min(c, this.levelCap));
    const peak = capped.reduce((m, v) => Math.max(m, v), 0);
    if (peak <= 0) return new Array<number>(counts.length).fill(0);
    return capped.map((v) => v / peak);
  },
};
