// UIAdjust.swift :: UIAdjust / UIAdjustLayer
import React, { useRef } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import {
  RightPanelConstants,
  SeekPanelConstants,
  StripButtonLayout,
  SwiftColors,
  UIAdjustConstants,
} from '../state/EditorConstants';
import { EditorState } from '../state/EditorState';

/** UIAdjust.swift :: UIAdjust.maxStripWidth(designWidth:panelWidth:advWidth:) */
function maxStripWidth(designWidth: number, panelWidth: number, advWidth: number): number {
  const room =
    designWidth - SeekPanelConstants.totalWidth - panelWidth - advWidth - UIAdjustConstants.minLaneWidth;
  return Math.max(UIAdjustConstants.stripWidthDefault, Math.min(UIAdjustConstants.stripWidthMax, room));
}

/** UIAdjust.swift :: UIAdjust.maxPanelWidth(designWidth:stripWidth:advWidth:height:compact:) */
function maxPanelWidth(
  designWidth: number,
  stripWidth: number,
  advWidth: number,
  height: number,
  compact: boolean
): number {
  const room =
    designWidth - stripWidth - SeekPanelConstants.totalWidth - advWidth - UIAdjustConstants.minLaneWidth;
  const byIcons =
    UIAdjustConstants.panelWidthDefault * RightPanelConstants.iconScaleLimit(height, false, compact);
  return Math.max(
    UIAdjustConstants.panelWidthDefault,
    Math.min(UIAdjustConstants.panelWidthMax, Math.min(room, byIcons))
  );
}

export const UIAdjustLayer: React.FC<{
  state: EditorState;
  designWidth: number;
  designHeight: number;
  designScale: number;
  compact: boolean;
}> = ({ state, designWidth, designHeight, designScale, compact }) => {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stripGrabRef = useRef<number | null>(null);
  const stripPointerIdRef = useRef<number | null>(null);
  const panelGrabRef = useRef<number | null>(null);
  const panelPointerIdRef = useRef<number | null>(null);

  if (!state.uiAdjustMode) return null;

  // UIAdjust.swift :: UIAdjustLayer.u
  const u = 1 / Math.max(designScale, 0.2);
  const W = designWidth;
  const H = designHeight;
  const sw = state.stripWidth;
  const pw = state.rightPanelWidth;

  const layout = StripButtonLayout.resolve(
    sw / UIAdjustConstants.stripWidthDefault,
    compact,
    designScale,
    null
  );
  const stripAtLimit =
    sw >= maxStripWidth(W, pw, state.advPanelWidth) - 0.5; // UIAdjust.swift :: stripAtLimit
  const panelMax = maxPanelWidth(W, sw, state.advPanelWidth, H, compact);
  const panelAtLimit = pw >= panelMax - 0.5; // UIAdjust.swift :: panelAtLimit

  const localX = (clientX: number): number => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return (clientX - rect.left) / designScale;
  };

  const renderHandle = (
    atLimit: boolean,
    offsetX: number,
    handlers: {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
      onPointerUpOrCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
    }
  ) => {
    // UIAdjust.swift :: UIAdjustLayer.handle(atLimit:H:gesture:)
    const c = atLimit ? '#ff9f0a' : SwiftColors.panelBlue;
    return (
      <div
        onPointerDown={handlers.onPointerDown}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUpOrCancel}
        onPointerCancel={handlers.onPointerUpOrCancel}
        style={{
          position: 'absolute',
          left: offsetX,
          top: 0,
          width: 60 * u, // UIAdjust.swift :: handle hit width (60 * u)
          height: H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'ew-resize',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: 0,
            transform: 'translateX(-50%)',
            width: 3 * u, // UIAdjust.swift :: handle vertical line width (3 * u)
            height: H,
            backgroundColor: c,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'relative',
            width: 34 * u, // UIAdjust.swift :: handle pill width (34 * u)
            height: 84 * u, // UIAdjust.swift :: handle pill height (84 * u)
            borderRadius: 12 * u, // UIAdjust.swift :: handle pill cornerRadius (12 * u)
            backgroundColor: 'rgba(0, 0, 0, 0.78)', // UIAdjust.swift :: Color.black.opacity(0.78)
            border: `${2 * u}px solid ${c}`, // UIAdjust.swift :: stroke(c, lineWidth: 2 * u)
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <ArrowLeftRight size={20 * u} color={c} strokeWidth={2.4} />
        </div>
      </div>
    );
  };

  // UIAdjust.swift :: UIAdjustLayer.banner
  const stripPct = Math.round((state.stripWidth / UIAdjustConstants.stripWidthDefault) * 100);
  const buttonPct = Math.round(layout.scale * 100);
  const want = state.rightPanelWidth / UIAdjustConstants.panelWidthDefault;
  const editTopCount = state.touchUndoRedo ? 8 : 9;
  const mainPct = Math.round(
    Math.min(want, RightPanelConstants.iconScaleLimit(H, false, compact, editTopCount)) * 100
  );
  const editPct = Math.round(
    Math.min(want, RightPanelConstants.iconScaleLimit(H, true, compact, editTopCount)) * 100
  );
  const laneLeft = sw + SeekPanelConstants.totalWidth;
  const laneW = Math.max(1, W - pw - laneLeft);

  const line1 =
    `左の帯 ${stripPct}%  ボタン ${buttonPct}%` +
    (layout.limited ? ' (上限)' : '') +
    (stripAtLimit ? '  帯は最大' : '');
  const line2 =
    `右メニュー ${mainPct}%` +
    (panelAtLimit ? ' (上限)' : '') +
    `  EDIT中は ${editPct}% (縦に収まる範囲)`;

  const renderPill = (title: string, prominent: boolean, action: () => void) => (
    // UIAdjust.swift :: UIAdjustLayer.pill(_:prominent:action:)
    <button
      type="button"
      onClick={action}
      style={{
        height: 44 * u, // UIAdjust.swift :: pill height (44 * u)
        paddingLeft: 22 * u, // UIAdjust.swift :: pill horizontal padding (22 * u)
        paddingRight: 22 * u,
        borderRadius: 10 * u, // UIAdjust.swift :: pill cornerRadius (10 * u)
        border: 'none',
        backgroundColor: prominent ? SwiftColors.panelBlue : 'rgba(255, 255, 255, 0.2)',
        color: prominent ? '#000000' : '#ffffff',
        fontSize: 16 * u, // UIAdjust.swift :: pill font (16 * u)
        fontWeight: 700,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      {title}
    </button>
  );

  return (
    <div
      ref={rootRef}
      onPointerDown={(e) => {
        e.stopPropagation();
      }}
      onWheel={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: W,
        height: H,
        backgroundColor: 'rgba(0, 0, 0, 0.3)', // UIAdjust.swift :: Color.black.opacity(0.3)
        touchAction: 'none',
        userSelect: 'none',
      }}
    >
      {/* Left strip highlight (UIAdjust.swift :: tint.opacity(0.14)) */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: sw,
          height: H,
          backgroundColor: 'rgba(0, 206, 255, 0.14)',
          pointerEvents: 'none',
        }}
      />

      {/* Right panel highlight (UIAdjust.swift :: tint.opacity(0.14)) */}
      <div
        style={{
          position: 'absolute',
          left: W - pw,
          top: 0,
          width: pw,
          height: H,
          backgroundColor: 'rgba(0, 206, 255, 0.14)',
          pointerEvents: 'none',
        }}
      />

      {/* Strip right edge drag handle */}
      {renderHandle(stripAtLimit, sw - 30 * u, {
        onPointerDown: (e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          stripPointerIdRef.current = e.pointerId;
          stripGrabRef.current = state.stripWidth - localX(e.clientX);
        },
        onPointerMove: (e) => {
          if (stripPointerIdRef.current !== e.pointerId || stripGrabRef.current === null) return;
          e.stopPropagation();
          const maxW = maxStripWidth(W, state.rightPanelWidth, state.advPanelWidth);
          const target = localX(e.clientX) + stripGrabRef.current;
          const nv = Math.min(Math.max(target, UIAdjustConstants.stripWidthDefault), maxW);
          if (Math.abs(nv - state.stripWidth) > 0.01) {
            state.stripWidth = nv;
          }
        },
        onPointerUpOrCancel: (e) => {
          if (stripPointerIdRef.current !== e.pointerId) return;
          stripPointerIdRef.current = null;
          stripGrabRef.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        },
      })}

      {/* Right panel left edge drag handle */}
      {renderHandle(panelAtLimit, W - pw - 30 * u, {
        onPointerDown: (e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          panelPointerIdRef.current = e.pointerId;
          panelGrabRef.current = W - state.rightPanelWidth - localX(e.clientX);
        },
        onPointerMove: (e) => {
          if (panelPointerIdRef.current !== e.pointerId || panelGrabRef.current === null) return;
          e.stopPropagation();
          const maxW = maxPanelWidth(W, state.stripWidth, state.advPanelWidth, H, compact);
          const left = localX(e.clientX) + panelGrabRef.current;
          const nv = Math.min(Math.max(W - left, UIAdjustConstants.panelWidthDefault), maxW);
          if (Math.abs(nv - state.rightPanelWidth) > 0.01) {
            state.rightPanelWidth = nv;
          }
        },
        onPointerUpOrCancel: (e) => {
          if (panelPointerIdRef.current !== e.pointerId) return;
          panelPointerIdRef.current = null;
          panelGrabRef.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        },
      })}

      {/* Center banner above lane */}
      <div
        style={{
          position: 'absolute',
          left: laneLeft,
          top: 0,
          width: laneW,
          paddingTop: 14 * u, // UIAdjust.swift :: banner padding(.top, 14 * u)
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            pointerEvents: 'auto',
            padding: 12 * u, // UIAdjust.swift :: banner padding(12 * u)
            borderRadius: 14 * u, // UIAdjust.swift :: banner cornerRadius (14 * u)
            backgroundColor: 'rgba(0, 0, 0, 0.85)', // UIAdjust.swift :: Color.black.opacity(0.85)
            border: `${1 * u}px solid rgba(255, 255, 255, 0.35)`, // UIAdjust.swift :: stroke(Color.white.opacity(0.35), lineWidth: 1 * u)
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6 * u, // UIAdjust.swift :: banner VStack(spacing: 6 * u)
          }}
        >
          <div
            style={{
              fontSize: 16 * u,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
            }}
          >
            UI調整モード
          </div>
          <div
            style={{
              fontSize: 11 * u,
              color: 'rgba(255, 255, 255, 0.75)',
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
            }}
          >
            青い線をドラッグして、左の帯・右メニューの幅を変えます
          </div>
          <div
            style={{
              fontSize: 11 * u,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: SwiftColors.panelBlue,
              lineHeight: 1.25,
              whiteSpace: 'pre',
            }}
          >
            {line1}
          </div>
          <div
            style={{
              fontSize: 11 * u,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              color: SwiftColors.panelBlue,
              lineHeight: 1.25,
              whiteSpace: 'pre',
            }}
          >
            {line2}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: 12 * u, // UIAdjust.swift :: HStack(spacing: 12 * u)
              paddingTop: 4 * u, // UIAdjust.swift :: padding(.top, 4 * u)
            }}
          >
            {renderPill('リセット', false, () => state.resetUIAdjust(compact))}
            {renderPill('完了', true, () => state.exitUIAdjust())}
          </div>
        </div>
      </div>
    </div>
  );
};
