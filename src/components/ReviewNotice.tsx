// ReviewNotice.swift :: ReviewNoticeShape + ReviewNoticeLayer
import React, { useEffect, useRef, useState } from 'react';
import { DesignScreen, panelLabelFontCss } from '../state/EditorConstants';

const FADE_IN_MS = 80; // ReviewNotice.swift :: ReviewNoticeLayer.fadeIn (0.08s)
const HOLD_MS = 400; // ReviewNotice.swift :: ReviewNoticeLayer.hold (0.4s)
const FADE_OUT_MS = 220; // ReviewNotice.swift :: ReviewNoticeLayer.fadeOut (0.22s)

export const ReviewNoticeLayer: React.FC<{ tick: number; compact: boolean }> = ({ tick, compact }) => {
  const [opacity, setOpacity] = useState(0);
  const [durationMs, setDurationMs] = useState(FADE_IN_MS);
  const [easing, setEasing] = useState<'ease-out' | 'ease-in'>('ease-out');
  const genRef = useRef(0);

  useEffect(() => {
    if (tick <= 0) return;
    genRef.current += 1;
    const mine = genRef.current;

    setDurationMs(FADE_IN_MS);
    setEasing('ease-out');
    setOpacity(1);

    const timer = window.setTimeout(() => {
      if (genRef.current !== mine) return;
      setDurationMs(FADE_OUT_MS);
      setEasing('ease-in');
      setOpacity(0);
    }, FADE_IN_MS + HOLD_MS);

    return () => window.clearTimeout(timer);
  }, [tick]);

  const fontBoost = compact ? DesignScreen.compactFontBoost : 1;
  const W = 168; // ReviewNotice.swift :: ReviewNoticeLayer (width: 168)
  const H = 34; // ReviewNotice.swift :: ReviewNoticeLayer (height: 34)
  const cham = 6; // ReviewNotice.swift :: ReviewNoticeShape.cham
  const step = 3.5; // ReviewNotice.swift :: ReviewNoticeShape.step
  const upper = 17; // ReviewNotice.swift :: ReviewNoticeShape.upper

  return (
    <div
      style={{
        position: 'absolute',
        top: 22, // ReviewNotice.swift :: ReviewNoticeLayer (padding .top 22)
        left: '50%',
        transform: 'translateX(-50%)',
        width: W,
        height: H,
        opacity,
        transition: `opacity ${durationMs}ms ${easing}`,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ position: 'absolute', inset: 0, display: 'block' }}
      >
        <polygon
          points={`0,0 ${W - cham},0 ${W},${cham} ${W},${H} ${step},${H} ${step},${upper + step} 0,${upper}`} // ReviewNotice.swift :: ReviewNoticeShape
          fill="rgba(0, 0, 0, 0.5)" // ReviewNotice.swift :: ReviewNoticeLayer
          stroke="rgba(255, 255, 255, 0.3)" // ReviewNotice.swift :: ReviewNoticeLayer
          strokeWidth={1} // ReviewNotice.swift :: ReviewNoticeLayer
        />
      </svg>
      <span
        style={{
          position: 'relative',
          font: panelLabelFontCss(16, fontBoost), // ReviewNotice.swift :: ReviewNoticeLayer (font 16)
          color: '#ffffff',
          lineHeight: 1,
        }}
      >
        0 issue found
      </span>
    </div>
  );
};
