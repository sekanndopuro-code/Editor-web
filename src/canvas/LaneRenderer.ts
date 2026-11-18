// Renderers.swift :: LaneRenderer
import { isSlideNote, isWipeNote, type Note, type NoteID } from '../core/ChartModel';
import { NoteHeightConstants, SwiftColors, rgba01 } from '../state/EditorConstants';
import type { EditorState, Ghost, LaneGeo, Point2D } from '../state/EditorState';
import { PluginStore } from '../plugins/PluginStore';
import {
  DRAW_SEG_RINGS,
  DRAW_SLIDE_HEAD_BAR,
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
import { drawFX } from './RenderersFX';

const DOT_RADIUS = 11.4; // Renderers.swift :: LaneRenderer.dotRadius

let cachedDotNormal: HTMLCanvasElement | null = null;
let cachedDotSelected: HTMLCanvasElement | null = null;

function createDotCanvas(selected: boolean): HTMLCanvasElement {
  // Renderers.swift :: LaneRenderer.dotImages
  const scale = 3; // Renderers.swift :: LaneRenderer.dotImages (fmt.scale = 3)
  const r = DOT_RADIUS;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(r * 2 * scale);
  canvas.height = Math.ceil(r * 2 * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.scale(scale, scale);

  const band = (outer: number, inner: number, col: string) => {
    ctx.beginPath();
    ctx.arc(r, r, outer, 0, Math.PI * 2);
    if (inner > 0) {
      ctx.moveTo(r + inner, r);
      ctx.arc(r, r, inner, 0, Math.PI * 2);
    }
    ctx.fillStyle = col;
    ctx.fill('evenodd'); // Renderers.swift :: LaneRenderer.dotImages (usesEvenOddFillRule = true)
  };

  band(11.4, 7.8, selected ? SwiftColors.selDotOuter : SwiftColors.dotOuter); // Renderers.swift :: LaneRenderer.dotImages
  band(7.8, 4.5, selected ? SwiftColors.selDotRing : SwiftColors.dotRing); // Renderers.swift :: LaneRenderer.dotImages
  band(4.5, 0, selected ? SwiftColors.selDotCenter : SwiftColors.dotCenter); // Renderers.swift :: LaneRenderer.dotImages
  return canvas;
}

function getDotImage(selected: boolean): HTMLCanvasElement {
  if (selected) {
    if (!cachedDotSelected) cachedDotSelected = createDotCanvas(true);
    return cachedDotSelected;
  }
  if (!cachedDotNormal) cachedDotNormal = createDotCanvas(false);
  return cachedDotNormal;
}

function stampDots(ctx: CanvasRenderingContext2D, points: Point2D[], img: HTMLCanvasElement): void {
  // Renderers.swift :: LaneRenderer.stampDots
  if (points.length === 0) return;
  const r = DOT_RADIUS;
  const seen = new Set<string>();
  for (const p of points) {
    const gx = Math.floor(p.x / 3); // Renderers.swift :: LaneRenderer.stampDots (3pt grid dedup)
    const gy = Math.floor(p.y / 3); // Renderers.swift :: LaneRenderer.stampDots
    const key = `${gx}:${gy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ctx.drawImage(img, p.x - r, p.y - r, r * 2, r * 2);
  }
}

function drawNotes(
  ctx: CanvasRenderingContext2D,
  g: LaneGeo,
  notes: Note[],
  selected: Set<NoteID> = new Set()
): void {
  // Renderers.swift :: LaneRenderer.drawNotes
  const lo = g.beatOf(g.H) - 0.05; // Renderers.swift :: LaneRenderer.drawNotes
  const hi = g.beatOf(0) + 0.05; // Renderers.swift :: LaneRenderer.drawNotes
  const dots: Point2D[] = [];
  const selDots: Point2D[] = [];

  for (const n of notes) {
    if (!isSlideNote(n)) continue;
    const isSel = selected.size > 0 && selected.has(n.id);
    const hw = ((n.w / 255.0) * g.trackW) / 2.0;
    const sb = n.beat.value;
    let prevB = sb;
    let prevX = n.x;
    const y0 = g.py(sb);
    if (y0 > -24 && y0 < g.H + 24) {
      // Renderers.swift :: LaneRenderer.drawNotes (-24 ... H + 24)
      const p0 = { x: g.px(prevX), y: y0 };
      if (isSel) selDots.push(p0);
      else dots.push(p0);
    }

    ctx.fillStyle = isSel ? SwiftColors.selRibbon : SwiftColors.ribbonFill;
    for (const s of n.segs) {
      const curB = sb + s.beat.value;
      const curX = n.x + s.x;
      if (Math.max(prevB, curB) >= lo && Math.min(prevB, curB) <= hi) {
        let ta = 0.0;
        let tb = 1.0;
        const db = curB - prevB;
        if (db !== 0) {
          const t1 = (lo - prevB) / db;
          const t2 = (hi - prevB) / db;
          ta = Math.max(0.0, Math.min(t1, t2));
          tb = Math.min(1.0, Math.max(t1, t2));
        }
        if (tb >= ta) {
          const pax = g.px(prevX + (curX - prevX) * ta);
          const pay = g.py(prevB + db * ta);
          const pbx = g.px(prevX + (curX - prevX) * tb);
          const pby = g.py(prevB + db * tb);
          ctx.beginPath();
          ctx.moveTo(pax - hw, pay);
          ctx.lineTo(pax + hw, pay);
          ctx.lineTo(pbx + hw, pby);
          ctx.lineTo(pbx - hw, pby);
          ctx.closePath();
          ctx.fill();
        }
      }
      const cy = g.py(curB);
      if (cy > -24 && cy < g.H + 24) {
        dots.push({ x: g.px(curX), y: cy }); // Renderers.swift :: LaneRenderer.drawNotes (seg dots stay normal color)
      }
      prevB = curB;
      prevX = curX;
    }
  }

  for (const n of notes) {
    if (isSlideNote(n) && !DRAW_SLIDE_HEAD_BAR) continue;
    const wipe = isWipeNote(n);
    const y = g.py(n.beat.value) - NoteHeightConstants.lift(wipe, g.noteScale);
    if (y < -24 || y > g.H + 24) continue; // Renderers.swift :: LaneRenderer.drawNotes
    const hw = ((n.w / 255.0) * g.trackW) / 2.0;
    const cx = g.px(n.x);
    const isSel = selected.size > 0 && selected.has(n.id);
    if (wipe) {
      drawWipe(ctx, cx - hw, cx + hw, y, isSel, g.noteScale);
    } else {
      const th = NoteHeightConstants.tapHeight(g.noteScale);
      drawTap(ctx, cx - hw, y - th / 2, hw * 2, th, isSel);
    }
  }

  stampDots(ctx, dots, getDotImage(false));
  stampDots(ctx, selDots, getDotImage(true));
}

function drawRange(ctx: CanvasRenderingContext2D, g: LaneGeo, s: EditorState): void {
  // Renderers.swift :: LaneRenderer.drawRange
  if (!s.rangeStart) return;
  const hiB = s.rangeEnd ?? s.rangeStart;
  const yLo = g.py(s.rangeStart.value);
  const yHi = g.py(hiB.value);
  ctx.fillStyle = 'rgba(255, 165, 0, 0.14)'; // Renderers.swift :: LaneRenderer.drawRange (Color.orange.opacity(0.14))
  ctx.fillRect(g.trackL, Math.min(yLo, yHi), g.trackW, Math.max(2, Math.abs(yLo - yHi)));
  ctx.strokeStyle = 'rgba(255, 165, 0, 0.9)'; // Renderers.swift :: LaneRenderer.drawRange (Color.orange.opacity(0.9))
  ctx.lineWidth = 2; // Renderers.swift :: LaneRenderer.drawRange
  for (const y of [yLo, yHi]) {
    ctx.beginPath();
    ctx.moveTo(g.trackL, y);
    ctx.lineTo(g.trackL + g.trackW, y);
    ctx.stroke();
  }
}

function drawOrder(ctx: CanvasRenderingContext2D, g: LaneGeo, state: EditorState): void {
  // Renderers.swift :: LaneRenderer.drawOrder
  if (!state.editing || state.orderIDs.length === 0) return;
  const rank = new Map<NoteID, number>();
  state.orderIDs.forEach((id, k) => rank.set(id, k));
  const lo = g.beatOf(g.H) - 0.05; // Renderers.swift :: LaneRenderer.drawOrder
  const hi = g.beatOf(0) + 0.05; // Renderers.swift :: LaneRenderer.drawOrder
  const allNotes = state.chart.notes;

  for (const ni of state.visibleNoteIndices(g)) {
    const n = allNotes[ni];
    const k = rank.get(n.id);
    if (!isSlideNote(n) || k === undefined) continue;
    const fill = k === 0 ? rgba01(1.0, 0.24, 0.24) : rgba01(0.35, 0.78, 1.0); // Renderers.swift :: drawOrder
    const fillRibbon = k === 0 ? rgba01(1.0, 0.24, 0.24, 0.42) : rgba01(0.35, 0.78, 1.0, 0.42); // Renderers.swift :: drawOrder
    const fillBar = k === 0 ? rgba01(1.0, 0.24, 0.24, 0.9) : rgba01(0.35, 0.78, 1.0, 0.9); // Renderers.swift :: drawOrder
    const hw = ((n.w / 255.0) * g.trackW) / 2.0;
    const sb = n.beat.value;
    let prevB = sb;
    let prevX = n.x;

    ctx.fillStyle = fillRibbon;
    for (const s of n.segs) {
      const curB = sb + s.beat.value;
      const curX = n.x + s.x;
      if (Math.max(prevB, curB) >= lo && Math.min(prevB, curB) <= hi) {
        let ta = 0.0;
        let tb = 1.0;
        const db = curB - prevB;
        if (db !== 0) {
          const t1 = (lo - prevB) / db;
          const t2 = (hi - prevB) / db;
          ta = Math.max(0.0, Math.min(t1, t2));
          tb = Math.min(1.0, Math.max(t1, t2));
        }
        if (tb >= ta) {
          const pax = g.px(prevX + (curX - prevX) * ta);
          const pay = g.py(prevB + db * ta);
          const pbx = g.px(prevX + (curX - prevX) * tb);
          const pby = g.py(prevB + db * tb);
          ctx.beginPath();
          ctx.moveTo(pax - hw, pay);
          ctx.lineTo(pax + hw, pay);
          ctx.lineTo(pbx + hw, pby);
          ctx.lineTo(pbx - hw, pby);
          ctx.closePath();
          ctx.fill();
        }
      }
      prevB = curB;
      prevX = curX;
    }

    const y0 = g.py(sb);
    if (y0 > -20 && y0 < g.H + 20) {
      // Renderers.swift :: LaneRenderer.drawOrder
      const cx = g.px(n.x);
      roundedRectPath(ctx, cx - hw, y0 - 4, hw * 2, 8, 3); // Renderers.swift :: LaneRenderer.drawOrder
      ctx.fillStyle = fillBar;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, y0, 12, 0, Math.PI * 2); // Renderers.swift :: LaneRenderer.drawOrder (24x24 badge)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'; // Renderers.swift :: LaneRenderer.drawOrder
      ctx.fill();
      ctx.strokeStyle = fill;
      ctx.lineWidth = 2; // Renderers.swift :: LaneRenderer.drawOrder
      ctx.stroke();

      ctx.save();
      ctx.font = `700 ${state.compactLayout ? 18 : 13}px -apple-system, BlinkMacSystemFont, sans-serif`; // Renderers.swift :: drawOrder
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(k + 1), cx, y0);
      ctx.restore();
    }
  }
}

function drawSprites(ctx: CanvasRenderingContext2D, g: LaneGeo, state: EditorState): void {
  // Renderers.swift :: LaneRenderer.drawSprites
  if (!state.editing || state.pluginSprites.length === 0) return;
  for (const sp of state.pluginSprites) {
    if (!sp.visible) continue;
    const img = PluginStore.shared.getSpriteImage(sp.folder, sp.image, () => state.emitFrame());
    if (!img || !img.complete || img.naturalWidth <= 0) continue;
    const w = g.trackW * (sp.width / 100.0);
    const cx = g.trackL + g.trackW * (sp.x / 100.0);
    if (sp.endBeat !== null && sp.endBeat !== undefined) {
      const y1 = g.py(sp.beat);
      const y2 = g.py(sp.endBeat);
      const top = Math.min(y1, y2);
      const h = Math.max(1, Math.abs(y2 - y1));
      if (top + h < 0 || top > g.H) continue;
      ctx.drawImage(img, cx - w / 2.0, top, w, h);
    } else {
      const aspect = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : 1.0;
      const h = w * aspect;
      const cy = g.py(sp.beat);
      if (cy < -h || cy > g.H + h) continue;
      ctx.drawImage(img, cx - w / 2.0, cy - h / 2.0, w, h);
    }
  }
}

function drawSlideModify(ctx: CanvasRenderingContext2D, g: LaneGeo, state: EditorState): void {
  // Renderers.swift :: LaneRenderer.drawSlideModify
  if (state.tool !== 'slideModify' || state.modifySlideID === null) return;
  const ni = state.indexOfNote(state.modifySlideID);
  if (ni === null) return;
  const n = state.chart.notes[ni];
  for (let j = 0; j < n.segs.length; j++) {
    const grabbed = j === state.modifySegIndex;
    if (!grabbed && !DRAW_SEG_RINGS) continue;
    const s = n.segs[j];
    const px = g.px(n.x + s.x);
    const py = g.py(n.beat.value + s.beat.value);
    if (py < -20 || py > g.H + 20) continue; // Renderers.swift :: LaneRenderer.drawSlideModify
    ctx.beginPath();
    ctx.arc(px, py, 15, 0, Math.PI * 2); // Renderers.swift :: LaneRenderer.drawSlideModify (30x30 ring)
    ctx.strokeStyle = grabbed ? '#ffffff' : SwiftColors.laneCyan;
    ctx.lineWidth = grabbed ? 3 : 2; // Renderers.swift :: LaneRenderer.drawSlideModify
    ctx.stroke();
  }
}

function drawSlideDraft(ctx: CanvasRenderingContext2D, g: LaneGeo, state: EditorState): void {
  // Renderers.swift :: LaneRenderer.drawSlideDraft
  const d = state.slideDraft;
  const last = state.slideDraftLastPoint();
  if (!d || !last) return;
  if (state.indexOfNote(d.noteID) === null) {
    ctx.save();
    ctx.globalAlpha = 0.8; // Renderers.swift :: LaneRenderer.drawSlideDraft
    drawNotes(ctx, g, [{ beat: d.beat, x: d.x, w: d.w, segs: [], extra: {}, id: d.noteID }]);
    ctx.restore();
  }
  const px = g.px(last.x);
  const py = g.py(last.beat.value);
  ctx.beginPath();
  ctx.arc(px, py, 14, 0, Math.PI * 2); // Renderers.swift :: LaneRenderer.drawSlideDraft (28x28 ring)
  ctx.strokeStyle = SwiftColors.laneCyan;
  ctx.lineWidth = 2; // Renderers.swift :: LaneRenderer.drawSlideDraft
  ctx.stroke();
}

function drawGhost(ctx: CanvasRenderingContext2D, g: LaneGeo, gh: Ghost): void {
  // Renderers.swift :: LaneRenderer.drawGhost
  const segs =
    gh.endBeat && gh.endX !== undefined
      ? [{ beat: gh.endBeat.sub(gh.beat), x: gh.endX - gh.x }]
      : [];
  const n: Note = {
    beat: gh.beat,
    x: gh.x,
    w: gh.w,
    type: gh.tool === 'wipe' ? 4 : undefined,
    segs,
    extra: {},
    id: 0,
  };
  ctx.save();
  ctx.globalAlpha = 0.55; // Renderers.swift :: LaneRenderer.drawGhost
  drawNotes(ctx, g, [n]);
  ctx.restore();
}

function drawLasso(ctx: CanvasRenderingContext2D, state: EditorState): void {
  // Renderers.swift :: LaneRenderer.drawLasso
  const pts = state.lassoPoints;
  if (state.tool !== 'lasso' || pts.length < 2) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.10)'; // Renderers.swift :: LaneRenderer.drawLasso
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.lineTo(pts[0].x, pts[0].y);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'; // Renderers.swift :: LaneRenderer.drawLasso
  ctx.lineWidth = 1.2; // Renderers.swift :: LaneRenderer.drawLasso
  ctx.setLineDash([3, 4]); // Renderers.swift :: LaneRenderer.drawLasso
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)'; // Renderers.swift :: LaneRenderer.drawLasso
  ctx.lineWidth = 4; // Renderers.swift :: LaneRenderer.drawLasso
  ctx.stroke();

  ctx.setLineDash([7, 5]); // Renderers.swift :: LaneRenderer.drawLasso
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2; // Renderers.swift :: LaneRenderer.drawLasso
  ctx.stroke();
  ctx.restore();
}

export const LaneRenderer = {
  draw(
    ctx: CanvasRenderingContext2D,
    size: { width: number; height: number },
    state: EditorState
  ): void {
    // Renderers.swift :: LaneRenderer.draw
    const g = state.geo(size.width, size.height);
    if (g.fx) {
      drawFX(ctx, g, state);
      return;
    }

    ctx.fillStyle = SwiftColors.timePanel;
    ctx.fillRect(0, 0, g.trackL, g.H); // Renderers.swift :: LaneRenderer.draw (left beat label panel)
    drawAudioVisuals(ctx, g, state);
    drawVLines(ctx, g, state.gridLines);
    drawHLines(ctx, g, state.snapDen);
    drawBPM(ctx, g, state);
    drawEffects(ctx, g, state);
    drawRange(ctx, g, state);

    const allNotes = state.chart.notes;
    const visible = state.visibleNoteIndices(g);
    const drawList = visible.length === allNotes.length ? allNotes : visible.map((idx) => allNotes[idx]);

    if (state.clipNotesToTrack) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(g.trackL, 0, g.trackW, g.H);
      ctx.clip();
      drawNotes(ctx, g, drawList, state.selectedIDs);
      ctx.restore();
    } else {
      drawNotes(ctx, g, drawList, state.selectedIDs);
    }

    drawOrder(ctx, g, state);
    drawSprites(ctx, g, state);
    drawSlideModify(ctx, g, state);
    drawSlideDraft(ctx, g, state);
    if (state.ghost) drawGhost(ctx, g, state.ghost);
    drawLasso(ctx, state);
    drawPlayline(ctx, g);
    drawLabels(ctx, g, undefined, undefined, undefined, null, state.compactLayout ? 28 : 20.5); // Renderers.swift :: LaneRenderer.draw
  },
};
