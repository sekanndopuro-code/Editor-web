// RenderersFX.swift :: FX mode lane rendering
import { isSlideNote, isWipeNote } from '../core/ChartModel';
import { NoteHeightConstants, SwiftColors } from '../state/EditorConstants';
import type { EditorState, FXWarp, LaneGeo } from '../state/EditorState';
import {
  drawBPM,
  drawEffects,
  drawHLines,
  drawLabels,
  drawPlayline,
  drawTap,
  drawVLines,
  drawWipe,
  roundedRectPath,
} from './LanePrimitives';
import { drawAudioVisuals } from './LaneAudioVisuals';

export interface FXRange {
  lo: number;
  hi: number;
  pxPerBeat: number;
} // RenderersFX.swift :: FXRange

const FX_MAX_BARS = 600; // RenderersFX.swift :: LaneRenderer.fxMaxBars
const FX_MAX_QUADS = 8000; // RenderersFX.swift :: LaneRenderer.fxMaxQuads
export const FX_KEEP_BEATS = 4.0; // RenderersFX.swift :: LaneRenderer.fxKeepBeats

export function fxRanges(g: LaneGeo, f: FXWarp, totalSec: number, margin = 24): FXRange[] {
  // RenderersFX.swift :: LaneRenderer.fxRanges
  const pps = g.fxPxPerSec(f);
  if (!Number.isFinite(pps) || pps <= 0) return [];
  const pLo = f.pNow - (g.H - g.playY + margin) / pps;
  const pHi = f.pNow + (g.playY + margin) / pps;
  const tMin = -1.0; // RenderersFX.swift :: fxRanges
  const tMax = totalSec + 30; // RenderersFX.swift :: fxRanges
  const out: FXRange[] = [];
  for (const r of f.map.timeRanges(pLo, pHi)) {
    const t0 = Math.max(r.lo, tMin);
    const t1 = Math.min(r.hi, tMax);
    if (!(t1 >= t0)) continue;
    const b0 = f.time.beatAtSec(t0);
    const b1 = f.time.beatAtSec(t1);
    const db = b1 - b0;
    const slope = Math.abs(f.map.scrollAt((t0 + t1) / 2));
    const px = db > 1e-9 ? (slope * (t1 - t0) * pps) / db : slope * g.ppb;
    out.push({ lo: b0, hi: b1, pxPerBeat: px });
  }
  return out;
}

function clipQuad(
  ya: number,
  xa: number,
  yb: number,
  xb: number,
  yMin: number,
  yMax: number
): { ya: number; xa: number; yb: number; xb: number } | null {
  // RenderersFX.swift :: LaneRenderer.clipQuad
  if (!Number.isFinite(ya) || !Number.isFinite(yb) || !Number.isFinite(xa) || !Number.isFinite(xb)) {
    return null;
  }
  if ((ya < yMin && yb < yMin) || (ya > yMax && yb > yMax)) return null;
  const dy = yb - ya;
  let ta = 0;
  let tb = 1;
  if (dy !== 0) {
    const t1 = (yMin - ya) / dy;
    const t2 = (yMax - ya) / dy;
    ta = Math.max(0, Math.min(t1, t2));
    tb = Math.min(1, Math.max(t1, t2));
    if (tb < ta) return null;
  }
  const dx = xb - xa;
  return { ya: ya + dy * ta, xa: xa + dx * ta, yb: ya + dy * tb, xb: xa + dx * tb };
}

function fxNumberText(v: number): string {
  // RenderersFX.swift :: LaneRenderer.fxNumberText
  if (!Number.isFinite(v)) return '-';
  if (v === Math.round(v) && Math.abs(v) < 1e9) return String(Math.trunc(v));
  let s = v.toFixed(3);
  while (s.endsWith('0')) s = s.slice(0, -1);
  if (s.endsWith('.')) s = s.slice(0, -1);
  return s;
}

function drawFXHud(ctx: CanvasRenderingContext2D, g: LaneGeo, f: FXWarp): void {
  // RenderersFX.swift :: LaneRenderer.drawFXHud
  const label = 'SC ' + fxNumberText(f.map.scrollAt(f.nowSec));
  const px = g.trackL + 6; // RenderersFX.swift :: drawFXHud
  const py = 6; // RenderersFX.swift :: drawFXHud
  const pw = label.length * 7.6 + 14; // RenderersFX.swift :: drawFXHud
  const ph = 20; // RenderersFX.swift :: drawFXHud
  roundedRectPath(ctx, px, py, pw, ph, 4); // RenderersFX.swift :: drawFXHud (cornerRadius: 4)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // RenderersFX.swift :: drawFXHud
  ctx.fill();

  ctx.save();
  ctx.font = '600 12px ui-monospace, SFMono-Regular, Menlo, monospace'; // RenderersFX.swift :: drawFXHud
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'; // RenderersFX.swift :: drawFXHud
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(label, px + 7, py + ph / 2); // RenderersFX.swift :: drawFXHud
  ctx.restore();
}

function drawFXNotes(
  ctx: CanvasRenderingContext2D,
  g: LaneGeo,
  f: FXWarp,
  state: EditorState,
  ranges: FXRange[]
): void {
  // RenderersFX.swift :: LaneRenderer.drawFXNotes
  if (ranges.length === 0) return;
  const pps = g.fxPxPerSec(f);
  const now = f.nowSec;
  const keep = FX_KEEP_BEATS > 0 ? f.time.secAtBeat(f.time.beatAtSec(now) - FX_KEEP_BEATS) : now;
  const notes = state.chart.notes;

  let cand: number[];
  if (ranges.length === 1) {
    cand = state.notesOverlapping(ranges[0].lo, ranges[0].hi);
  } else {
    const seen = new Set<number>();
    cand = [];
    for (const r of ranges) {
      for (const i of state.notesOverlapping(r.lo, r.hi)) {
        if (!seen.has(i)) {
          seen.add(i);
          cand.push(i);
        }
      }
    }
    cand.sort((a, b) => a - b);
  }
  if (cand.length === 0) return;

  const yOf = (p: number) => g.playY - (p - f.pNow) * pps;
  const topDist = g.playY / pps + 0.05; // RenderersFX.swift :: drawFXNotes
  const negFrom = f.map.negFrom;

  const xs: number[] = [];
  const ys: number[] = [];
  const ts: number[] = [];
  let quads = 0;

  for (const i of cand) {
    if (!isSlideNote(notes[i])) continue;
    if (quads >= FX_MAX_QUADS) break;
    const n = notes[i];
    const sb = n.beat.value;
    xs.length = 0;
    ys.length = 0;
    ts.length = 0;

    const headT = f.time.secAtBeat(sb);
    const headP = f.map.p(headT);
    xs.push(g.px(n.x));
    ys.push(yOf(headP));
    ts.push(headT);
    let maxT = headT;

    for (const s of n.segs) {
      const t = f.time.secAtBeat(sb + s.beat.value);
      xs.push(g.px(n.x + s.x));
      ys.push(yOf(f.map.p(t)));
      ts.push(t);
      if (t > maxT) maxT = t;
    }

    if (maxT <= keep - 1e-4) continue; // RenderersFX.swift :: drawFXNotes
    if (headT > now + 1e-4 && headP - f.pNow > topDist) continue; // RenderersFX.swift :: drawFXNotes
    const gated = maxT > negFrom;
    const hw = ((n.w / 255.0) * g.trackW) / 2.0;

    ctx.fillStyle = SwiftColors.ribbonFill;
    for (let k = 1; k < xs.length; k++) {
      if (gated && Math.max(ts[k - 1], ts[k]) <= keep) continue;
      const q = clipQuad(ys[k - 1], xs[k - 1], ys[k], xs[k], -24, g.H + 24); // RenderersFX.swift :: drawFXNotes (-24 ... H + 24)
      if (!q) continue;
      ctx.beginPath();
      ctx.moveTo(q.xa - hw, q.ya);
      ctx.lineTo(q.xa + hw, q.ya);
      ctx.lineTo(q.xb + hw, q.yb);
      ctx.lineTo(q.xb - hw, q.yb);
      ctx.closePath();
      ctx.fill();
      quads += 1;
    }
  }

  let bars = 0;
  for (const i of cand) {
    if (isSlideNote(notes[i])) continue;
    if (bars >= FX_MAX_BARS) break;
    const n = notes[i];
    const t = f.time.secAtBeat(n.beat.value);
    if (t < keep - 1e-4) continue;
    const wipe = isWipeNote(n);
    const y = yOf(f.map.p(t)) - NoteHeightConstants.lift(wipe, g.noteScale);
    if (y < -24 || y > g.H + 24) continue; // RenderersFX.swift :: drawFXNotes
    const hw = ((n.w / 255.0) * g.trackW) / 2.0;
    const cx = g.px(n.x);
    if (wipe) {
      drawWipe(ctx, cx - hw, cx + hw, y, false, g.noteScale);
    } else {
      const th = NoteHeightConstants.tapHeight(g.noteScale);
      drawTap(ctx, cx - hw, y - th / 2, hw * 2, th, false);
    }
    bars += 1;
  }
}

export function drawFX(ctx: CanvasRenderingContext2D, g: LaneGeo, state: EditorState): void {
  // RenderersFX.swift :: LaneRenderer.drawFX
  const f = g.fx;
  if (!f) return;

  ctx.fillStyle = SwiftColors.timePanel;
  ctx.fillRect(0, 0, g.trackL, g.H); // RenderersFX.swift :: LaneRenderer.drawFX
  drawAudioVisuals(ctx, g, state);
  drawVLines(ctx, g, state.gridLines);

  const ranges = fxRanges(g, f, state.totalSec);
  for (const r of ranges) {
    if (r.pxPerBeat >= 1) {
      drawHLines(ctx, g, state.snapDen, r.lo, r.hi, r.pxPerBeat, true);
    }
  }
  drawBPM(ctx, g, state);
  drawEffects(ctx, g, state);

  if (state.clipNotesToTrack) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.trackL, 0, g.trackW, g.H);
    ctx.clip();
    drawFXNotes(ctx, g, f, state, ranges);
    ctx.restore();
  } else {
    drawFXNotes(ctx, g, f, state, ranges);
  }

  drawPlayline(ctx, g);
  for (const r of ranges) {
    if (r.pxPerBeat >= 1) {
      drawLabels(
        ctx,
        g,
        r.lo,
        r.hi,
        r.pxPerBeat,
        [r.lo, Math.max(r.lo, r.hi)],
        state.compactLayout ? 28 : 20.5 // RenderersFX.swift :: LaneRenderer.drawFX
      );
    }
  }
  drawFXHud(ctx, g, f);
}
