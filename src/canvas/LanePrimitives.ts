// Renderers.swift :: LaneRenderer primitives, line styles, note shapes, and vertical time numbers
import { formatEffectValue } from '../core/ChartModel';
import { SwiftColors, rgba01 } from '../state/EditorConstants';
import type { EditorState, LaneGeo } from '../state/EditorState';

export const BAR_LIFT = 8; // Renderers.swift :: LaneRenderer.barLift
export const TAP_H = 11.5; // Renderers.swift :: LaneRenderer.tapH
export const DRAW_SLIDE_HEAD_BAR = false; // Renderers.swift :: LaneRenderer.drawSlideHeadBar
export const DRAW_SEG_RINGS = true; // Renderers.swift :: LaneRenderer.drawSegRings

export function gcdInt(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return Math.max(1, x);
}

export function smallestPrime(d: number): number {
  // Renderers.swift :: smallestPrime(_:)
  if (d < 4) return Math.max(d, 1); // Renderers.swift :: smallestPrime
  let p = 2;
  while (p * p <= d) {
    if (d % p === 0) return p;
    p += 1;
  }
  return d;
}

export function lineStyle(rem: number, den: number): [string, number] {
  // Renderers.swift :: lineStyle(rem:den:)
  if (rem === 0) return [rgba01(1, 1, 1, 0.8), 1.4]; // Renderers.swift :: lineStyle (beat)
  const g = gcdInt(rem, den);
  const rd = den / g;
  switch (rd) {
    case 2:
      return [rgba01(0.0, 0.9, 0.9, 0.7), 1.1]; // Renderers.swift :: lineStyle (1/2)
    case 4:
      return [rgba01(0.85, 0.3, 0.85, 0.6), 1.0]; // Renderers.swift :: lineStyle (1/4)
    case 3:
    case 6:
    case 12:
      return [rgba01(0.4, 0.85, 0.5, 0.5), 1.0]; // Renderers.swift :: lineStyle (1/3, 1/6, 1/12)
    case 8:
      return [rgba01(1, 1, 1, 0.3), 0.8]; // Renderers.swift :: lineStyle (1/8)
    default:
      return [rgba01(1, 1, 1, 0.18), 0.7]; // Renderers.swift :: lineStyle (default)
  }
}

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, rad);
}

export function drawNumber(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  anchor: 'leading' | 'center',
  size: number,
  scaleX: number,
  alpha: number
): void {
  // Renderers.swift :: drawNumber(_:_:at:anchor:size:scaleX:alpha:)
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scaleX, 1);
  ctx.font = `400 ${size}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`; // Renderers.swift :: drawNumber
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`; // Renderers.swift :: drawNumber
  ctx.textBaseline = 'middle';
  ctx.textAlign = anchor === 'leading' ? 'left' : 'center';
  ctx.fillText(s, 0, 0);
  ctx.restore();
}

export function drawVLines(ctx: CanvasRenderingContext2D, g: LaneGeo, lines: number): void {
  // Renderers.swift :: LaneRenderer.drawVLines
  const n = Math.max(1, lines);
  for (let k = 0; k <= n; k++) {
    const x = g.px((255.0 * k) / n);
    const edge = k === 0 || k === n;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, g.H);
    ctx.strokeStyle = `rgba(255, 255, 255, ${edge ? 0.8 : 0.62})`; // Renderers.swift :: LaneRenderer.drawVLines
    ctx.lineWidth = edge ? 1.2 : 0.8; // Renderers.swift :: LaneRenderer.drawVLines
    ctx.stroke();
  }
  const cx = g.px(127.5); // Renderers.swift :: LaneRenderer.drawVLines
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, g.H);
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.28)'; // Renderers.swift :: LaneRenderer.drawVLines (Color.red.opacity(0.28))
  ctx.lineWidth = 1; // Renderers.swift :: LaneRenderer.drawVLines
  ctx.stroke();
}

export function drawHLines(
  ctx: CanvasRenderingContext2D,
  g: LaneGeo,
  den: number,
  from?: number,
  to?: number,
  pxPerBeat?: number,
  within = false
): void {
  // Renderers.swift :: LaneRenderer.drawHLines
  const b0 = from ?? g.beatOf(g.H);
  const b1 = to ?? g.beatOf(0);
  const ppb = pxPerBeat ?? g.ppb;

  let d = Math.max(1, den);
  while (d > 1 && ppb / d < 6) {
    // Renderers.swift :: LaneRenderer.drawHLines (min 6pt spacing)
    d = Math.trunc(d / smallestPrime(d));
  }
  const t0 = Math.floor(b0 * d);
  const t1 = Math.ceil(b1 * d);
  if (t1 < t0 || t1 - t0 > 800) return; // Renderers.swift :: LaneRenderer.drawHLines (max 800 lines)
  for (let t = t0; t <= t1; t++) {
    if (t < 0) continue;
    const b = t / d;
    if (within && (b < b0 || b > b1)) continue;
    const y = g.py(b);
    const rem = ((t % d) + d) % d;
    const [color, lw] = lineStyle(rem, d);
    ctx.beginPath();
    ctx.moveTo(g.trackL, y);
    ctx.lineTo(g.trackL + g.trackW, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

export function drawLabels(
  ctx: CanvasRenderingContext2D,
  g: LaneGeo,
  from?: number,
  to?: number,
  pxPerBeat?: number,
  midRange: [number, number] | null = null,
  size = 20.5 // Renderers.swift :: LaneRenderer.drawLabels
): void {
  // Renderers.swift :: LaneRenderer.drawLabels
  const lo = from ?? g.beatOf(g.H);
  const hi = to ?? g.beatOf(0);
  const ppb = pxPerBeat ?? g.ppb;

  const b0 = Math.max(0, Math.floor(lo) - 1);
  const b1 = Math.ceil(hi);
  if (b1 < b0 || b1 - b0 > 200) return; // Renderers.swift :: LaneRenderer.drawLabels
  let step = 1;
  while (ppb * step < size * 0.88) step *= 2; // Renderers.swift :: LaneRenderer.drawLabels
  for (let b = b0; b <= b1; b++) {
    if (b % step !== 0) continue;
    const m = b + step / 2.0;
    if (midRange && (m < midRange[0] || m > midRange[1])) continue;
    const y = g.py(m);
    if (y < -12 || y > g.H + 12) continue; // Renderers.swift :: LaneRenderer.drawLabels
    drawNumber(ctx, String(b), 6.5, y, 'leading', size, 0.77, 0.75); // Renderers.swift :: LaneRenderer.drawLabels
  }
}

export function drawBPM(ctx: CanvasRenderingContext2D, g: LaneGeo, s: EditorState): void {
  // Renderers.swift :: LaneRenderer.drawBPM
  for (const tp of s.chart.times) {
    if (tp.beat.value <= 0) continue;
    const y = g.py(tp.beat.value);
    if (y < -20 || y > g.H + 20) continue; // Renderers.swift :: LaneRenderer.drawBPM
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(g.trackL, y);
    ctx.lineTo(g.trackL + g.trackW, y);
    ctx.strokeStyle = 'rgba(255, 255, 0, 0.35)'; // Renderers.swift :: LaneRenderer.drawBPM
    ctx.lineWidth = 1; // Renderers.swift :: LaneRenderer.drawBPM
    ctx.setLineDash([6, 4]); // Renderers.swift :: LaneRenderer.drawBPM
    ctx.stroke();
    ctx.restore();

    const fs = s.compactLayout ? 16 : 11; // Renderers.swift :: LaneRenderer.drawBPM
    const dy = s.compactLayout ? 13 : 9; // Renderers.swift :: LaneRenderer.drawBPM
    ctx.save();
    ctx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = 'rgba(255, 255, 0, 0.8)'; // Renderers.swift :: LaneRenderer.drawBPM
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillText(`BPM ${tp.bpm.toFixed(2)}`, g.trackL + g.trackW - 4, y - dy); // Renderers.swift :: LaneRenderer.drawBPM
    ctx.restore();
  }
}

export function drawEffects(ctx: CanvasRenderingContext2D, g: LaneGeo, s: EditorState): void {
  // Renderers.swift :: LaneRenderer.drawEffects
  if (s.chart.effects.length === 0) return;
  const rows: { beat: number; items: typeof s.chart.effects }[] = [];
  for (const e of s.chart.effects) {
    const b = e.beat.value;
    const y = g.py(b);
    if (y < -20 || y > g.H + 20) continue; // Renderers.swift :: LaneRenderer.drawEffects
    const hit = rows.find((r) => Math.abs(r.beat - b) < 1e-9);
    if (hit) hit.items.push(e);
    else rows.push({ beat: b, items: [e] });
  }
  for (const row of rows) {
    const y = g.py(row.beat);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(g.trackL, y);
    ctx.lineTo(g.trackL + g.trackW, y);
    ctx.strokeStyle = rgba01(0.35, 0.65, 1.0, 0.6); // Renderers.swift :: LaneRenderer.drawEffects
    ctx.lineWidth = 1; // Renderers.swift :: LaneRenderer.drawEffects
    ctx.setLineDash([6, 4]); // Renderers.swift :: LaneRenderer.drawEffects
    ctx.lineDashOffset = 5; // Renderers.swift :: LaneRenderer.drawEffects
    ctx.stroke();
    ctx.restore();

    const items = [...row.items].sort((a, b) => (a.kind === 'scroll' && b.kind !== 'scroll' ? -1 : 0));
    const text = items.map((e) => `${e.kind} ${formatEffectValue(e.value)}`).join(' ');
    const fs = s.compactLayout ? 16 : 11; // Renderers.swift :: LaneRenderer.drawEffects
    const dy = s.compactLayout ? 13 : 9; // Renderers.swift :: LaneRenderer.drawEffects
    ctx.save();
    ctx.font = `${fs}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillStyle = rgba01(0.35, 0.65, 1.0, 0.95); // Renderers.swift :: LaneRenderer.drawEffects
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(text, g.trackL + 4, y - dy); // Renderers.swift :: LaneRenderer.drawEffects
    ctx.restore();
  }
}

export function drawPlayline(ctx: CanvasRenderingContext2D, g: LaneGeo): void {
  // Renderers.swift :: LaneRenderer.drawPlayline
  ctx.beginPath();
  ctx.moveTo(g.trackL, g.playY);
  ctx.lineTo(g.trackL + g.trackW, g.playY);
  ctx.strokeStyle = SwiftColors.laneCyan; // Renderers.swift :: LaneRenderer.drawPlayline
  ctx.lineWidth = 2.5; // Renderers.swift :: LaneRenderer.drawPlayline
  ctx.stroke();
}

export function drawTap(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  selected: boolean
): void {
  // Renderers.swift :: LaneRenderer.drawTap
  const outer = selected ? SwiftColors.selTapOuter : SwiftColors.tapOuter;
  const mid = selected ? SwiftColors.selTapMid : SwiftColors.tapMid;
  const core = selected ? SwiftColors.selTapCore : SwiftColors.tapCore;
  const glow = selected ? SwiftColors.selTapGlow : SwiftColors.tapGlow;

  roundedRectPath(ctx, x, y, w, h, 3.2); // Renderers.swift :: LaneRenderer.drawTap (cornerRadius: 3.2)
  ctx.strokeStyle = glow;
  ctx.lineWidth = 4; // Renderers.swift :: LaneRenderer.drawTap
  ctx.stroke();
  ctx.fillStyle = outer;
  ctx.fill();

  if (w > 8) {
    // Renderers.swift :: LaneRenderer.drawTap
    roundedRectPath(ctx, x + 1.5, y + 1.5, w - 3.0, Math.max(0, h - 3.0), 1.8); // Renderers.swift :: drawTap inset 1.5
    ctx.fillStyle = mid;
    ctx.fill();

    roundedRectPath(ctx, x + 3.0, y + 3.0, w - 6.0, Math.max(0, h - 6.0), 0.8); // Renderers.swift :: drawTap inset 3.0
    ctx.fillStyle = core;
    ctx.fill();
  }
}

function wipePath(
  ctx: CanvasRenderingContext2D,
  xL: number,
  xR: number,
  yMid: number,
  h: number,
  t: number,
  delta: number
): void {
  // Renderers.swift :: LaneRenderer.wipePath
  const len = Math.sqrt(h * h + t * t);
  const tipDX = (delta * len) / h;
  const cornerDX = t + (delta * (len - t)) / h;
  const top = yMid - h + delta;
  const bottom = yMid + h - delta;
  ctx.beginPath();
  ctx.moveTo(xL + tipDX, yMid);
  ctx.lineTo(xL + cornerDX, top);
  ctx.lineTo(xR - cornerDX, top);
  ctx.lineTo(xR - tipDX, yMid);
  ctx.lineTo(xR - cornerDX, bottom);
  ctx.lineTo(xL + cornerDX, bottom);
  ctx.closePath();
}

export function drawWipe(
  ctx: CanvasRenderingContext2D,
  xL: number,
  xR: number,
  yMid: number,
  selected: boolean
): void {
  // Renderers.swift :: LaneRenderer.drawWipe
  const outer = selected ? SwiftColors.selWipeOuter : SwiftColors.wipeOuter;
  const mid = selected ? SwiftColors.selWipeMid : SwiftColors.wipeMid;
  const core = selected ? SwiftColors.selWipeCore : SwiftColors.wipeCore;
  const glow = selected ? SwiftColors.selWipeGlow : SwiftColors.wipeGlow;

  const h = 6.0; // Renderers.swift :: LaneRenderer.drawWipe
  const cap = 4.0; // Renderers.swift :: LaneRenderer.drawWipe
  const bx0 = xL + cap;
  const bx1 = xR - cap;
  const width = bx1 - bx0;
  if (width < 6) {
    // Renderers.swift :: LaneRenderer.drawWipe
    roundedRectPath(ctx, xL, yMid - h, Math.max(2, xR - xL), h * 2, 2); // Renderers.swift :: LaneRenderer.drawWipe
    ctx.fillStyle = outer;
    ctx.fill();
    return;
  }
  const t = Math.min(3.4, width / 2 - 1.5); // Renderers.swift :: LaneRenderer.drawWipe
  wipePath(ctx, bx0, bx1, yMid, h, t, 0);
  ctx.strokeStyle = glow;
  ctx.lineWidth = 4; // Renderers.swift :: LaneRenderer.drawWipe
  ctx.stroke();
  ctx.fillStyle = outer;
  ctx.fill();

  wipePath(ctx, bx0, bx1, yMid, h, t, 2.0); // Renderers.swift :: LaneRenderer.drawWipe
  ctx.fillStyle = mid;
  ctx.fill();

  wipePath(ctx, bx0, bx1, yMid, h, t, 3.5); // Renderers.swift :: LaneRenderer.drawWipe
  ctx.fillStyle = core;
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(xL + 3.2, yMid - 4.5); // Renderers.swift :: LaneRenderer.drawWipe (left arrow)
  ctx.lineTo(xL + 0.8, yMid);
  ctx.lineTo(xL + 3.2, yMid + 4.5);
  ctx.moveTo(xR - 3.2, yMid - 4.5); // Renderers.swift :: LaneRenderer.drawWipe (right arrow)
  ctx.lineTo(xR - 0.8, yMid);
  ctx.lineTo(xR - 3.2, yMid + 4.5);
  ctx.strokeStyle = outer;
  ctx.lineWidth = 1.6; // Renderers.swift :: LaneRenderer.drawWipe
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.stroke();
  ctx.restore();
}
