// Renderers.swift :: StripRenderer / SeekRenderer / TimeLabelRenderer
import { SwiftColors, UIAdjustConstants, rgba01 } from '../state/EditorConstants';
import type { EditorState } from '../state/EditorState';
import { drawNumber, gcdInt, lineStyle, roundedRectPath, smallestPrime } from './LanePrimitives';

function stripLineStyle(rem: number, den: number): [string, number] {
  // Renderers.swift :: stripLineStyle(rem:den:)
  if (rem === 0) return [rgba01(1, 1, 1, 0.95), 1.1]; // Renderers.swift :: stripLineStyle
  if (den / gcdInt(rem, den) === 2) return [rgba01(0.4, 0.81, 0.93, 1), 1.0]; // Renderers.swift :: stripLineStyle
  return lineStyle(rem, den);
}

export const StripRenderer = {
  faceInset: 1.5, // Renderers.swift :: StripRenderer.faceInset
  faceTop: 2, // Renderers.swift :: StripRenderer.faceTop
  faceBottomInset: 2.5, // Renderers.swift :: StripRenderer.faceBottomInset
  faceColor: SwiftColors.stripFace, // Renderers.swift :: StripRenderer.faceColor

  draw(
    ctx: CanvasRenderingContext2D,
    size: { width: number; height: number },
    state: EditorState
  ): void {
    // Renderers.swift :: StripRenderer.draw
    const H = size.height;
    const W = size.width;
    const faceW = W - this.faceInset;
    const k = W / UIAdjustConstants.stripWidthDefault; // Renderers.swift :: StripRenderer.draw
    const faceH = Math.max(1, H - this.faceTop - this.faceBottomInset);

    ctx.fillStyle = this.faceColor;
    ctx.fillRect(0, this.faceTop, faceW, faceH); // Renderers.swift :: StripRenderer.draw

    const beats = state.stripBeats;
    const ppb = H / beats;
    const center = H * 0.5;
    const vb = state.currentBeat();
    const y = (b: number) => center - (b - vb) * ppb;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, this.faceTop, faceW, faceH);
    ctx.clip();

    const b0 = vb - center / ppb;
    const b1 = vb + (H - center) / ppb;
    let d = Math.max(1, state.snapDen);
    while (d > 1 && ppb / d < 6) d = Math.trunc(d / smallestPrime(d)); // Renderers.swift :: StripRenderer.draw
    const t0 = Math.floor(b0 * d);
    const t1 = Math.ceil(b1 * d);
    if (t1 >= t0 && t1 - t0 < 1500) {
      // Renderers.swift :: StripRenderer.draw
      for (let t = t0; t <= t1; t++) {
        if (t < 0) continue;
        const b = t / d;
        const yy = y(b);
        const rem = ((t % d) + d) % d;
        const [col, lw] = stripLineStyle(rem, d);
        const x0 = (rem === 0 ? 6.5 : 9) * k; // Renderers.swift :: StripRenderer.draw
        const x1 = rem === 0 ? faceW - 0.5 : 36 * k; // Renderers.swift :: StripRenderer.draw
        ctx.beginPath();
        ctx.moveTo(x0, yy);
        ctx.lineTo(x1, yy);
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.stroke();
      }
    }

    let step = 1;
    while (ppb * step < (state.compactLayout ? 34 : 28) * k) step *= 2; // Renderers.swift :: StripRenderer.draw
    const lb0 = Math.max(0, Math.floor(b0) - 1);
    const lb1 = Math.ceil(b1);
    if (lb1 >= lb0 && lb1 - lb0 < 2000) {
      for (let b = lb0; b <= lb1; b++) {
        if (b % step !== 0) continue;
        drawNumber(
          ctx,
          String(b),
          faceW * 0.53,
          y(b + step / 2.0),
          'center',
          (state.compactLayout ? 42 : 34.7) * k, // Renderers.swift :: StripRenderer.draw
          0.78, // Renderers.swift :: StripRenderer.draw
          0.78 // Renderers.swift :: StripRenderer.draw
        );
      }
    }
    ctx.restore();

    // Borders
    ctx.beginPath();
    ctx.moveTo(0, this.faceTop);
    ctx.lineTo(faceW, this.faceTop);
    ctx.moveTo(0, H - this.faceBottomInset);
    ctx.lineTo(faceW, H - this.faceBottomInset);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.57)'; // Renderers.swift :: StripRenderer.draw
    ctx.lineWidth = 1.3; // Renderers.swift :: StripRenderer.draw
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0.4, this.faceTop);
    ctx.lineTo(0.4, H - this.faceBottomInset);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.60)'; // Renderers.swift :: StripRenderer.draw
    ctx.lineWidth = 0.8; // Renderers.swift :: StripRenderer.draw
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(faceW - 0.3, this.faceTop);
    ctx.lineTo(faceW - 0.3, H - this.faceBottomInset);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)'; // Renderers.swift :: StripRenderer.draw
    ctx.lineWidth = 0.8; // Renderers.swift :: StripRenderer.draw
    ctx.stroke();

    // Playhead marker
    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(W, center);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3; // Renderers.swift :: StripRenderer.draw
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, center);
    ctx.lineTo(9 * k, center - 7 * k); // Renderers.swift :: StripRenderer.draw
    ctx.lineTo(9 * k, center + 7 * k); // Renderers.swift :: StripRenderer.draw
    ctx.closePath();
    ctx.fillStyle = '#ff9500'; // Renderers.swift :: StripRenderer.draw (Color.orange)
    ctx.fill();
  },
};

export const SeekRenderer = {
  regionScale: 821.3 / 820.0, // Renderers.swift :: SeekRenderer.regionScale
  showViewWindow: false, // Renderers.swift :: SeekRenderer.showViewWindow
  barColor: SwiftColors.seekBar, // Renderers.swift :: SeekRenderer.barColor
  barMaxW: 67.4, // Renderers.swift :: SeekRenderer.barMaxW
  barHeightRatio: 0.789, // Renderers.swift :: SeekRenderer.barHeightRatio
  barTopRatio: 0.02, // Renderers.swift :: SeekRenderer.barTopRatio
  playLineH: 2.3, // Renderers.swift :: SeekRenderer.playLineH
  capW: 6, // Renderers.swift :: SeekRenderer.capW
  capRightW: 5.2, // Renderers.swift :: SeekRenderer.capRightW
  capH: 12.3, // Renderers.swift :: SeekRenderer.capH
  capColor: SwiftColors.seekCap, // Renderers.swift :: SeekRenderer.capColor

  draw(
    ctx: CanvasRenderingContext2D,
    size: { width: number; height: number },
    state: EditorState
  ): void {
    // Renderers.swift :: SeekRenderer.draw
    const H = size.height;
    const W = size.width;
    const top = StripRenderer.faceTop;
    const bottom = H - StripRenderer.faceBottomInset;

    ctx.fillStyle = StripRenderer.faceColor;
    ctx.fillRect(0, top, W, Math.max(1, bottom - top)); // Renderers.swift :: SeekRenderer.draw

    const ox = -StripRenderer.faceInset;
    const sideW = 10.5; // Renderers.swift :: SeekRenderer.draw
    const drawSidePath = () => {
      ctx.beginPath();
      ctx.moveTo(ox, top);
      ctx.lineTo(ox + sideW, top + sideW);
      ctx.lineTo(ox + sideW, bottom - sideW);
      ctx.lineTo(ox, bottom);
      ctx.closePath();
    };

    drawSidePath();
    ctx.fillStyle = SwiftColors.seekBevel; // Renderers.swift :: SeekRenderer.draw
    ctx.fill();

    const total = Math.max(1.0, state.totalSec);
    const regionH = H * this.regionScale;
    const yOf = (sec: number) => regionH - (sec / total) * regionH;
    const x0 = ox + sideW;
    const right = W - 0.5; // Renderers.swift :: SeekRenderer.draw
    const underSide: { x: number; y: number; w: number; h: number }[] = [];

    if (this.showViewWindow) {
      const lane = state.geo(100, H);
      const yTop = yOf(state.timeMap.secAtBeat(Math.max(0, lane.beatOf(0))));
      const yBot = yOf(state.timeMap.secAtBeat(Math.max(0, lane.beatOf(H))));
      ctx.fillStyle = 'rgba(255, 255, 255, 0.12)'; // Renderers.swift :: SeekRenderer.draw
      ctx.fillRect(x0, yTop, W - x0, Math.max(2, yBot - yTop));
    }

    const ratios = state.seekDensityRatios();
    const n = ratios.length;
    if (n > 0) {
      const pitch = regionH / n;
      ctx.fillStyle = this.barColor;
      for (let j = 0; j < n; j++) {
        const r = ratios[j];
        if (r <= 0) continue;
        const len = this.barMaxW * r;
        const yy = (n - 1 - j) * pitch + pitch * this.barTopRatio;
        const rx = right - len;
        const rh = pitch * this.barHeightRatio;
        ctx.fillRect(rx, yy, len, rh);
        if (rx < x0) {
          underSide.push({ x: rx, y: yy, w: len, h: rh });
        }
      }
    }

    const yp = yOf(state.currentSec());
    const lineRect = { x: ox, y: yp - this.playLineH / 2, w: right - ox, h: this.playLineH };
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(lineRect.x, lineRect.y, lineRect.w, lineRect.h);
    underSide.push(lineRect);

    const leftCap = { x: ox - 0.2, y: yp - this.capH / 2, w: this.capW, h: this.capH }; // Renderers.swift :: SeekRenderer.draw
    const rightCap = { x: right - this.capRightW, y: yp - this.capH / 2, w: this.capRightW, h: this.capH }; // Renderers.swift :: SeekRenderer.draw
    ctx.fillStyle = this.capColor;
    roundedRectPath(ctx, leftCap.x, leftCap.y, leftCap.w, leftCap.h, 2.5); // Renderers.swift :: SeekRenderer.draw
    ctx.fill();
    roundedRectPath(ctx, rightCap.x, rightCap.y, rightCap.w, rightCap.h, 2.5); // Renderers.swift :: SeekRenderer.draw
    ctx.fill();
    underSide.push(leftCap);

    // Side shadow pass (single fill of merged rects clipped to bevel path)
    ctx.save();
    drawSidePath();
    ctx.clip();
    ctx.beginPath();
    for (const r of underSide) {
      const w = Math.min(r.x + r.w, x0) - r.x;
      if (w > 0) ctx.rect(r.x, r.y, w, r.h);
    }
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'; // Renderers.swift :: SeekRenderer.draw
    ctx.fill();
    ctx.restore();

    // Bevel edge stroke
    ctx.beginPath();
    ctx.moveTo(ox, top);
    ctx.lineTo(ox + sideW, top + sideW);
    ctx.lineTo(ox + sideW, bottom - sideW);
    ctx.lineTo(ox, bottom);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)'; // Renderers.swift :: SeekRenderer.draw
    ctx.lineWidth = 0.9; // Renderers.swift :: SeekRenderer.draw
    ctx.stroke();

    // Right border
    ctx.beginPath();
    ctx.moveTo(W - 0.5, 0);
    ctx.lineTo(W - 0.5, H);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.60)'; // Renderers.swift :: SeekRenderer.draw
    ctx.lineWidth = 1; // Renderers.swift :: SeekRenderer.draw
    ctx.stroke();
  },
};

export const TimeLabelRenderer = {
  pitch: 20.25, // Renderers.swift :: TimeLabelRenderer.pitch
  centerX: 27.25, // Renderers.swift :: TimeLabelRenderer.centerX
  edgeInset: 113.5, // Renderers.swift :: TimeLabelRenderer.edgeInset
  fontSize: 25.5, // Renderers.swift :: TimeLabelRenderer.fontSize
  dotSize: 3, // Renderers.swift :: TimeLabelRenderer.dotSize
  upperDotY: -0.75, // Renderers.swift :: TimeLabelRenderer.upperDotY
  lowerDotY: 7.75, // Renderers.swift :: TimeLabelRenderer.lowerDotY

  draw(
    ctx: CanvasRenderingContext2D,
    size: { width: number; height: number },
    state: EditorState
  ): void {
    // Renderers.swift :: TimeLabelRenderer.draw
    ctx.fillStyle = SwiftColors.timePanel;
    ctx.fillRect(0, 0, size.width, size.height);

    const fs = state.compactLayout ? 33 : this.fontSize; // Renderers.swift :: TimeLabelRenderer.draw
    const pt = (this.pitch * fs) / this.fontSize;
    this.vtext(ctx, state.timeString(state.totalSec), this.edgeInset, fs, pt);
    this.vtext(ctx, state.timeString(state.currentSec()), size.height - this.edgeInset, fs, pt);
  },

  dot(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.fillRect(x - this.dotSize / 2, y - this.dotSize / 2, this.dotSize, this.dotSize);
  },

  vtext(
    ctx: CanvasRenderingContext2D,
    s: string,
    centerY: number,
    fontSize: number,
    pitch: number
  ): void {
    // Renderers.swift :: TimeLabelRenderer.vtext
    ctx.save();
    ctx.translate(this.centerX, centerY);
    ctx.rotate(-Math.PI / 2); // Renderers.swift :: TimeLabelRenderer.vtext (-90 degrees)
    ctx.shadowColor = 'rgba(255, 255, 255, 0.85)'; // Renderers.swift :: TimeLabelRenderer.vtext
    ctx.shadowBlur = 2.5; // Renderers.swift :: TimeLabelRenderer.vtext
    ctx.fillStyle = '#ffffff';
    ctx.font = `300 ${fontSize}px -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif`; // Renderers.swift :: TimeLabelRenderer.vtext
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';

    const mid = (s.length - 1) / 2;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const x = (i - mid) * pitch;
      if (ch === ':') {
        this.dot(ctx, x, this.upperDotY);
        this.dot(ctx, x, this.lowerDotY);
      } else if (ch === '.') {
        this.dot(ctx, x, this.lowerDotY);
      } else {
        ctx.fillText(ch, x, 0.25); // Renderers.swift :: TimeLabelRenderer.vtext (y: 0.25)
      }
    }
    ctx.restore();
  },
};
