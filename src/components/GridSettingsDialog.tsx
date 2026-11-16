// GridSettingsDialog.swift :: GridSettingsDialog / GridDialogFrameShape / GridBarShape
import React, { useRef, useState } from 'react';
import { DesignScreen, panelLabelFontCss, panelMenuFontCss } from '../state/EditorConstants';
import type { EditorState } from '../state/EditorState';

const MIN_LINES = 1; // GridSettingsDialog.swift :: GridSettingsDialog.minLines
const MAX_LINES = 64; // GridSettingsDialog.swift :: GridSettingsDialog.maxLines
const DESIGN_W = 801.25; // GridSettingsDialog.swift :: GridSettingsDialog.designW
const DESIGN_H = 356.25; // GridSettingsDialog.swift :: GridSettingsDialog.designH
const LABEL_W = 166.5; // GridSettingsDialog.swift :: GridSettingsDialog.labelW
const LABEL_GAP = 20.5; // GridSettingsDialog.swift :: GridSettingsDialog.labelGap
const BAR_W = 584; // GridSettingsDialog.swift :: GridSettingsDialog.barW
const BAR_H = 35; // GridSettingsDialog.swift :: GridSettingsDialog.barH
const BOX_SIZE = 36.5; // GridSettingsDialog.swift :: GridSettingsDialog.boxSize
const BUTTON_W = 192.75; // GridSettingsDialog.swift :: GridSettingsDialog.buttonW
const BUTTON_H = 50.75; // GridSettingsDialog.swift :: GridSettingsDialog.buttonH

export const GridSettingsDialog: React.FC<{
  state: EditorState;
  designWidth: number;
  designHeight: number;
  designScale: number;
  compact: boolean;
}> = ({ state, designWidth, designHeight, designScale, compact }) => {
  const [lines, setLines] = useState<number>(state.gridLines);
  const [align, setAlign] = useState<boolean>(state.gridAlign);
  const barRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const fontBoost = compact ? DesignScreen.compactFontBoost : 1;
  const dialogScale = Math.min(1, (designWidth - 24) / DESIGN_W, (designHeight - 24) / DESIGN_H); // GridSettingsDialog.swift :: body (scale)

  const clamped = Math.min(Math.max(lines, MIN_LINES), MAX_LINES);
  const frac = (clamped - MIN_LINES) / (MAX_LINES - MIN_LINES);
  const fillW = BAR_W * frac;

  const updateBarFromClientX = (clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const localX = ((clientX - rect.left) / Math.max(rect.width, 1)) * BAR_W;
    const f = Math.min(Math.max(localX / BAR_W, 0), 1);
    const span = MAX_LINES - MIN_LINES;
    setLines(MIN_LINES + Math.round(f * span)); // GridSettingsDialog.swift :: bar drag
  };

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.25)',
        backdropFilter: 'blur(18px)', // GridSettingsDialog.swift :: BackdropBlur
        WebkitBackdropFilter: 'blur(18px)',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `scale(${dialogScale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* GridDialogFrameShape (GridSettingsDialog.swift :: GridDialogFrameShape) */}
        <svg
          width={DESIGN_W}
          height={DESIGN_H}
          viewBox={`0 0 ${DESIGN_W} ${DESIGN_H}`}
          style={{ position: 'absolute', inset: 0, display: 'block' }}
        >
          <polygon
            points={`0,0 ${DESIGN_W - 12.5},0 ${DESIGN_W},12.5 ${DESIGN_W},${DESIGN_H} 7.5,${DESIGN_H} 7.5,99.75 0,92.25`} // GridSettingsDialog.swift :: GridDialogFrameShape
            fill="rgba(0, 0, 0, 0.5)" // GridSettingsDialog.swift :: dialog
            stroke="rgba(255, 255, 255, 0.3)" // GridSettingsDialog.swift :: dialog
            strokeWidth={1.5} // GridSettingsDialog.swift :: dialog
          />
        </svg>

        {/* Grid lines row (y: 46.25) */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 46.25, // GridSettingsDialog.swift :: dialog
            height: BAR_H,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: LABEL_W,
              textAlign: 'right',
              color: '#ffffff',
              font: panelLabelFontCss(19, fontBoost), // GridSettingsDialog.swift :: linesRow
              lineHeight: 1,
            }}
          >
            Grid lines
          </div>
          <div
            ref={barRef}
            onPointerDown={(e) => {
              e.stopPropagation();
              draggingRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              updateBarFromClientX(e.clientX);
            }}
            onPointerMove={(e) => {
              if (!draggingRef.current) return;
              updateBarFromClientX(e.clientX);
            }}
            onPointerUp={(e) => {
              draggingRef.current = false;
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            onPointerCancel={() => {
              draggingRef.current = false;
            }}
            style={{
              position: 'relative',
              marginLeft: LABEL_GAP,
              width: BAR_W,
              height: BAR_H,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'none',
            }}
          >
            <svg
              width={BAR_W}
              height={BAR_H}
              viewBox={`0 0 ${BAR_W} ${BAR_H}`}
              style={{ position: 'absolute', inset: 0, display: 'block' }}
            >
              <defs>
                <clipPath id="gridBarClipMask">
                  <rect x={0} y={0} width={fillW} height={BAR_H} />
                </clipPath>
              </defs>
              <polygon
                points={`0,0 ${BAR_W - 13.5},0 ${BAR_W},13.5 ${BAR_W},${BAR_H} 8,${BAR_H} 8,26.5 0,18`} // GridSettingsDialog.swift :: GridBarShape
                fill="rgba(255, 255, 255, 0.5)" // GridSettingsDialog.swift :: bar
                clipPath="url(#gridBarClipMask)"
              />
              <polygon
                points={`0,0 ${BAR_W - 13.5},0 ${BAR_W},13.5 ${BAR_W},${BAR_H} 8,${BAR_H} 8,26.5 0,18`} // GridSettingsDialog.swift :: GridBarShape
                fill="none"
                stroke="rgba(255, 255, 255, 0.6)" // GridSettingsDialog.swift :: bar
                strokeWidth={0.8} // GridSettingsDialog.swift :: bar
              />
            </svg>
            <span
              style={{
                position: 'relative',
                color: '#ffffff',
                font: panelMenuFontCss(23, fontBoost), // GridSettingsDialog.swift :: bar
                lineHeight: 1,
                pointerEvents: 'none',
              }}
            >
              {lines}
            </span>
          </div>
        </div>

        {/* Grid align row (y: 117.75) */}
        <div
          onClick={() => setAlign((v) => !v)}
          style={{
            position: 'absolute',
            left: 0,
            top: 117.75, // GridSettingsDialog.swift :: dialog
            width: LABEL_W + LABEL_GAP + BOX_SIZE + 8, // GridSettingsDialog.swift :: alignRow
            height: 44, // GridSettingsDialog.swift :: alignRow
            display: 'flex',
            alignItems: 'center',
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: LABEL_W,
              textAlign: 'right',
              color: '#ffffff',
              font: panelLabelFontCss(19, fontBoost), // GridSettingsDialog.swift :: alignRow
              lineHeight: 1,
            }}
          >
            Grid align
          </div>
          <div
            style={{
              position: 'relative',
              marginLeft: LABEL_GAP,
              width: BOX_SIZE,
              height: BOX_SIZE,
              border: '2.4px solid #ffffff', // GridSettingsDialog.swift :: checkbox
              boxSizing: 'border-box',
            }}
          >
            {align && (
              <svg
                width={BOX_SIZE}
                height={BOX_SIZE}
                viewBox={`0 0 ${BOX_SIZE} ${BOX_SIZE}`}
                style={{ position: 'absolute', inset: -2.4, display: 'block' }}
              >
                <polyline
                  points="8.2,19.5 14.2,25.5 28.5,11.5" // GridSettingsDialog.swift :: checkbox
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth={3.2} // GridSettingsDialog.swift :: checkbox
                  strokeLinecap="butt"
                  strokeLinejoin="miter"
                />
              </svg>
            )}
          </div>
        </div>

        {/* 戻る / 完了 buttons (x: 197.5, y: 267, spacing: 21.5) */}
        <div
          style={{
            position: 'absolute',
            left: 197.5, // GridSettingsDialog.swift :: dialog
            top: 267, // GridSettingsDialog.swift :: dialog
            display: 'flex',
            gap: 21.5, // GridSettingsDialog.swift :: dialog
          }}
        >
          <GridActionButton
            title="戻る"
            onClick={() => {
              state.showGridDialog = false;
              state.emitUI();
            }}
          />
          <GridActionButton
            title="完了"
            onClick={() => {
              state.gridLines = lines;
              state.gridAlign = align;
              state.showGridDialog = false;
              state.emitUI();
            }}
          />
        </div>
      </div>
    </div>
  );
};

const GridActionButton: React.FC<{ title: string; onClick: () => void }> = ({ title, onClick }) => {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        width: BUTTON_W, // GridSettingsDialog.swift :: buttonW
        height: BUTTON_H, // GridSettingsDialog.swift :: buttonH
        backgroundColor: 'rgba(0, 0, 0, 0.25)', // GridSettingsDialog.swift :: dialogButton
        border: '1.75px solid #ffffff', // GridSettingsDialog.swift :: dialogButton
        color: '#ffffff',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 22, // GridSettingsDialog.swift :: dialogButton
        fontWeight: 300, // GridSettingsDialog.swift :: dialogButton
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        opacity: pressed ? 0.55 : 1, // GridSettingsDialog.swift :: GridDialogButtonStyle
        padding: 0,
      }}
    >
      {title}
    </button>
  );
};
