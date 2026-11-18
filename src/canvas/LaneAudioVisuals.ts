// Fast per-frame rendering for precomputed waveform mipmaps and spectrogram tiles on the lane.
import type { SpectrogramData, WaveformData } from '../audio/AudioVisualCache';
import type { EditorState, FXWarp, LaneGeo } from '../state/EditorState';
import { fxRanges } from './RenderersFX';

interface LinearSegment {
  /** Chart time (sec) at start of segment */
  t0: number;
  /** Chart time (sec) at end of segment */
  t1: number;
  /** Screen Y at t0 */
  y0: number;
  /** Screen Y at t1 */
  y1: number;
}

function collectBeatBoundaries(state: EditorState, bLo: number, bHi: number): number[] {
  const out = [bLo];
  for (const pt of state.chart.times) {
    const b = pt.beat.value;
    if (b > bLo + 1e-9 && b < bHi - 1e-9) {
      out.push(b);
    }
  }
  out.push(bHi);
  return out;
}

function collectLinearSegments(g: LaneGeo, state: EditorState): LinearSegment[] {
  if (!g.fx) {
    const bLo = g.beatOf(g.H);
    const bHi = g.beatOf(0);
    if (!(bHi > bLo)) return [];
    const bounds = collectBeatBoundaries(state, bLo, bHi);
    const segs: LinearSegment[] = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const ba = bounds[i];
      const bb = bounds[i + 1];
      if (!(bb > ba)) continue;
      segs.push({
        t0: state.timeMap.secAtBeat(ba),
        t1: state.timeMap.secAtBeat(bb),
        y0: g.py(ba),
        y1: g.py(bb),
      });
    }
    return segs;
  }

  // FX mode: split by visible fxRanges, TimeMap BPM points, and EffectMap scroll points
  const f: FXWarp = g.fx;
  const ranges = fxRanges(g, f, state.totalSec, 4);
  if (ranges.length === 0) return [];
  const pps = g.fxPxPerSec(f);
  const yOfP = (p: number) => g.playY - (p - f.pNow) * pps;

  const segs: LinearSegment[] = [];
  for (const r of ranges) {
    const tLo = f.time.secAtBeat(r.lo);
    const tHi = f.time.secAtBeat(r.hi);
    if (!(tHi > tLo)) continue;

    const splitT = [tLo];
    for (const pt of state.chart.times) {
      const t = f.time.secAtBeat(pt.beat.value);
      if (t > tLo + 1e-7 && t < tHi - 1e-7) splitT.push(t);
    }
    for (const t of f.map.starts) {
      if (t > tLo + 1e-7 && t < tHi - 1e-7) splitT.push(t);
    }
    splitT.push(tHi);
    splitT.sort((a, b) => a - b);

    for (let i = 0; i < splitT.length - 1; i++) {
      const ta = splitT[i];
      const tb = splitT[i + 1];
      if (!(tb - ta > 1e-7)) continue;
      const midT = 0.5 * (ta + tb);
      const scroll = f.map.scrollAt(midT);
      if (Math.abs(scroll) < 1e-6) continue;
      // Evaluate p strictly inside segment (avoid jump discontinuity at left boundary ta)
      const pa = f.map.p(ta + 1e-7);
      const pb = f.map.p(tb - 1e-7);
      const ya = yOfP(pa);
      const yb = yOfP(pb);
      if (Math.max(ya, yb) < 0 || Math.min(ya, yb) > g.H) continue;
      segs.push({ t0: ta, t1: tb, y0: ya, y1: yb });
    }
  }
  return segs;
}

function drawSpectrogramSegments(
  ctx: CanvasRenderingContext2D,
  g: LaneGeo,
  spec: SpectrogramData,
  segs: LinearSegment[],
  offSec: number
): void {
  if (spec.tiles.length === 0 || segs.length === 0) return;

  ctx.save();
  ctx.beginPath();
  ctx.rect(g.trackL, 0, g.trackW, g.H);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 0.9;

  const tiles = spec.tiles;
  const tileDur = tiles[0].t1 - tiles[0].t0;

  for (const seg of segs) {
    const s0 = seg.t0 - offSec;
    const s1 = seg.t1 - offSec;
    const ds = s1 - s0;
    if (!(ds > 1e-9)) continue;
    if (s1 <= 0 || s0 >= spec.duration) continue;

    const c0 = Math.max(0, s0);
    const c1 = Math.min(spec.duration, s1);
    if (!(c1 > c0)) continue;

    const firstTile = Math.max(0, Math.floor(c0 / tileDur));
    const lastTile = Math.min(tiles.length - 1, Math.floor((c1 - 1e-7) / tileDur));

    for (let ti = firstTile; ti <= lastTile; ti++) {
      const tile = tiles[ti];
      const u0 = Math.max(c0, tile.t0);
      const u1 = Math.min(c1, tile.t1);
      if (!(u1 > u0)) continue;

      const tileSpan = tile.t1 - tile.t0;
      if (!(tileSpan > 1e-9)) continue;

      // Tile image top (row 0) = tile.t1, bottom (row H) = tile.t0
      const sy = ((tile.t1 - u1) / tileSpan) * tile.height;
      const sh = ((u1 - u0) / tileSpan) * tile.height;

      const yU0 = seg.y0 + ((u0 - s0) / ds) * (seg.y1 - seg.y0);
      const yU1 = seg.y0 + ((u1 - s0) / ds) * (seg.y1 - seg.y0);

      if (yU1 < yU0) {
        // Normal upward time direction: yU1 is top, yU0 is bottom
        const dh = yU0 - yU1;
        if (dh > 0.1 && sh > 0.05) {
          ctx.drawImage(tile.image, 0, sy, tile.width, sh, g.trackL, yU1, g.trackW, dh);
        }
      } else if (yU1 > yU0) {
        // Reversed scroll in FX mode: flip vertically
        const dh = yU1 - yU0;
        if (dh > 0.1 && sh > 0.05) {
          ctx.save();
          ctx.translate(0, yU0 + yU1);
          ctx.scale(1, -1);
          ctx.drawImage(tile.image, 0, sy, tile.width, sh, g.trackL, yU0, g.trackW, dh);
          ctx.restore();
        }
      }
    }
  }

  ctx.restore();
}

function drawWaveformSegments(
  ctx: CanvasRenderingContext2D,
  g: LaneGeo,
  wf: WaveformData,
  segs: LinearSegment[],
  offSec: number
): void {
  if (wf.levels.length === 0 || segs.length === 0) return;

  const cx = g.px(127.5);
  const maxHalfW = g.trackW * 0.48;
  const rowStep = 1.5;

  ctx.save();
  ctx.beginPath();
  ctx.rect(g.trackL, 0, g.trackW, g.H);
  ctx.clip();

  ctx.beginPath();

  for (const seg of segs) {
    const s0 = seg.t0 - offSec;
    const s1 = seg.t1 - offSec;
    const ds = s1 - s0;
    if (!(ds > 1e-9)) continue;
    if (s1 <= 0 || s0 >= wf.duration) continue;

    const dy = seg.y1 - seg.y0;
    const absDy = Math.abs(dy);
    if (absDy < 0.5) continue;

    // Pick coarsest mipmap level where buckets are <= ~half the scanline window
    const secPerStep = (ds / absDy) * rowStep;
    let level = wf.levels[0];
    for (let l = wf.levels.length - 1; l >= 0; l--) {
      const lv = wf.levels[l];
      if (1.0 / lv.rate <= secPerStep * 0.5) {
        level = lv;
        break;
      }
    }

    const peaks = level.peaks;
    const rate = level.rate;
    const nPeaks = peaks.length;
    const halfWin = secPerStep * 0.5;

    const yMin = Math.max(0, Math.min(seg.y0, seg.y1));
    const yMax = Math.min(g.H, Math.max(seg.y0, seg.y1));
    const startY = Math.ceil(yMin / rowStep) * rowStep;

    for (let y = startY; y <= yMax; y += rowStep) {
      const sCenter = s0 + ((y - seg.y0) / dy) * ds;
      const sa = sCenter - halfWin;
      const sb = sCenter + halfWin;
      if (sb <= 0 || sa >= wf.duration) continue;

      const i0 = Math.max(0, Math.floor(sa * rate));
      const i1 = Math.min(nPeaks - 1, Math.floor(sb * rate));
      if (i1 < i0) continue;

      let maxPeak = 0;
      for (let idx = i0; idx <= i1; idx++) {
        const p = peaks[idx];
        if (p > maxPeak) maxPeak = p;
      }

      if (maxPeak > 1) {
        const hw = (maxPeak / 255) * maxHalfW;
        ctx.moveTo(cx - hw, y);
        ctx.lineTo(cx + hw, y);
      }
    }
  }

  ctx.strokeStyle = 'rgba(72, 170, 214, 0.36)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

export function drawAudioVisuals(
  ctx: CanvasRenderingContext2D,
  g: LaneGeo,
  state: EditorState
): void {
  const showSpec = state.showSpectrogram && state.audioVisuals.spectrogram !== null;
  const showWave = state.showWaveform && state.audioVisuals.waveform !== null;
  if (!showSpec && !showWave) return;

  const segs = collectLinearSegments(g, state);
  if (segs.length === 0) return;
  const offSec = state.chart.offsetMs / 1000.0;

  if (showSpec && state.audioVisuals.spectrogram) {
    drawSpectrogramSegments(ctx, g, state.audioVisuals.spectrogram, segs, offSec);
  }
  if (showWave && state.audioVisuals.waveform) {
    drawWaveformSegments(ctx, g, state.audioVisuals.waveform, segs, offSec);
  }
}
