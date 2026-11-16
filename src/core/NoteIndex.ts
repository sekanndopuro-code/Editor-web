// NoteIndex.swift :: NoteIndex (via 1.txt Phase 1)
import type { Note, NoteID } from './ChartModel';

/**
 * ノーツを「拍の範囲」で素早く探すための空間索引 (二分木)
 */
export class NoteIndex {
  private los: number[] = [];
  private his: number[] = [];
  private order: number[] = [];
  private maxHi: number[] = [];
  private spatialBuilt = false;
  private builtCount = -1; // NoteIndex.swift :: NoteIndex.builtCount
  private idMap: Map<NoteID, number> | null = null;

  private buildSpatial(notes: Note[]): void {
    this.spatialBuilt = true;
    this.builtCount = notes.length;

    const ents: { lo: number; hi: number; idx: number }[] = new Array(notes.length);
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      const s = n.beat.value;
      let lo = s;
      let hi = s;
      for (const g of n.segs) {
        const v = s + g.beat.value;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      ents[i] = { lo, hi, idx: i };
    }

    ents.sort((a, b) => (a.lo !== b.lo ? a.lo - b.lo : a.idx - b.idx));

    this.los = ents.map((e) => e.lo);
    this.his = ents.map((e) => e.hi);
    this.order = ents.map((e) => e.idx);
    this.maxHi = new Array(ents.length).fill(-Infinity); // NoteIndex.swift :: NoteIndex.buildSpatial
    this.build(0, ents.length);
  }

  private build(l: number, r: number): number {
    if (l >= r) return -Infinity; // NoteIndex.swift :: NoteIndex.build
    const m = (l + r) >> 1;
    const a = this.build(l, m);
    const b = this.build(m + 1, r);
    const v = Math.max(this.his[m], a, b);
    this.maxHi[m] = v;
    return v;
  }

  indices(lo: number, hi: number, notes: Note[]): number[] {
    const out: number[] = [];
    if (notes.length === 0 || hi < lo || Number.isNaN(lo) || Number.isNaN(hi)) return out;
    if (!this.spatialBuilt || this.builtCount !== notes.length) {
      this.buildSpatial(notes);
    }
    this.collect(0, notes.length, lo, hi, out);
    out.sort((a, b) => a - b);
    return out;
  }

  private collect(l: number, r: number, qLo: number, qHi: number, out: number[]): void {
    if (l >= r) return;
    const m = (l + r) >> 1;
    if (this.maxHi[m] < qLo) return;
    this.collect(l, m, qLo, qHi, out);
    if (this.los[m] > qHi) return;
    if (this.his[m] >= qLo) out.push(this.order[m]);
    this.collect(m + 1, r, qLo, qHi, out);
  }

  positionOfID(id: NoteID, notes: Note[]): number | undefined {
    if (!this.idMap) {
      const m = new Map<NoteID, number>();
      for (let i = notes.length - 1; i >= 0; i--) {
        m.set(notes[i].id, i);
      }
      this.idMap = m;
    }
    return this.idMap.get(id);
  }
}
