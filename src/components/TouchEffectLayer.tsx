// TouchEffect.swift equivalent overlay: non-blocking white expanding rings on touch down + red translucent circles while held.
import React, { useEffect, useRef } from 'react';

interface Ring {
  x: number;
  y: number;
  startMs: number;
}

const RING_DURATION_MS = 320;
const RING_START_RADIUS = 10;
const RING_END_RADIUS = 42;
const HOLD_DOT_RADIUS = 18;

export const TouchEffectLayer: React.FC<{
  enabled: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}> = ({ enabled, containerRef }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const clearCanvas = () => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    if (!enabled) {
      clearCanvas();
      return;
    }

    const activeTouches = new Map<number, { x: number; y: number }>();
    const rings: Ring[] = [];
    let rafId = 0;

    const syncSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    const toLocal = (e: PointerEvent): { x: number; y: number } => {
      const rect = container.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const draw = () => {
      rafId = 0;
      const rect = container.getBoundingClientRect();
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      syncSize();
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const now = performance.now();

      // White expanding ring on pointer down
      let keep = 0;
      for (let i = 0; i < rings.length; i++) {
        const ring = rings[i];
        const elapsed = now - ring.startMs;
        if (elapsed >= RING_DURATION_MS) continue;
        rings[keep++] = ring;
        const t = Math.max(0, Math.min(1, elapsed / RING_DURATION_MS));
        const ease = 1 - Math.pow(1 - t, 2);
        const r = RING_START_RADIUS + (RING_END_RADIUS - RING_START_RADIUS) * ease;
        const alpha = 0.9 * (1 - t);
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      rings.length = keep;

      // Red translucent circle while pressed
      for (const pt of activeTouches.values()) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, HOLD_DOT_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 59, 48, 0.45)';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(255, 110, 100, 0.72)';
        ctx.stroke();
      }

      if (rings.length > 0 || activeTouches.size > 0) {
        rafId = requestAnimationFrame(draw);
      }
    };

    const scheduleDraw = () => {
      if (rafId === 0) {
        rafId = requestAnimationFrame(draw);
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const pt = toLocal(e);
      activeTouches.set(e.pointerId, pt);
      rings.push({ x: pt.x, y: pt.y, startMs: performance.now() });
      scheduleDraw();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activeTouches.has(e.pointerId)) return;
      activeTouches.set(e.pointerId, toLocal(e));
      scheduleDraw();
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (!activeTouches.has(e.pointerId)) return;
      activeTouches.delete(e.pointerId);
      scheduleDraw();
    };

    const ro = new ResizeObserver(() => {
      syncSize();
      if (rings.length > 0 || activeTouches.size > 0) scheduleDraw();
    });
    ro.observe(container);
    syncSize();

    container.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
    window.addEventListener('pointerup', onPointerEnd, { capture: true, passive: true });
    window.addEventListener('pointercancel', onPointerEnd, { capture: true, passive: true });

    return () => {
      if (rafId !== 0) cancelAnimationFrame(rafId);
      ro.disconnect();
      container.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('pointermove', onPointerMove, { capture: true });
      window.removeEventListener('pointerup', onPointerEnd, { capture: true });
      window.removeEventListener('pointercancel', onPointerEnd, { capture: true });
      activeTouches.clear();
      rings.length = 0;
      clearCanvas();
    };
  }, [enabled, containerRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
};
