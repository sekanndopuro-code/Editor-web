// EditorView.swift :: DesignCanvas / FrameCanvas / EditorBackground / StripView / SeekPanel / LaneView / LaneWidthSlider / PopupLayer / EditorView
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SongPCM, unlockAudioContext } from '../audio/AudioEngine';
import { BACKGROUND_MAX_LONG_SIDE, prepareBackgroundImage } from '../core/ImageNormalize';
import { detectFileKind, pickMediaForChart, unpackMCZ } from '../core/MCZArchive';
import { LaneRenderer } from '../canvas/LaneRenderer';
import { SeekRenderer, StripRenderer, TimeLabelRenderer } from '../canvas/StripAndSeekRenderer';
import {
  DesignScreen,
  RightPanelConstants,
  SeekPanelConstants,
  StripButtonLayout,
  SwiftColors,
  UIAdjustConstants,
  panelLabelFontCss,
  panelMenuFontCss,
} from '../state/EditorConstants';
import { EditorState, LaneGeo } from '../state/EditorState';
import { GridSettingsDialog } from './GridSettingsDialog';
import {
  HexagonShapeSvg,
  MoreMenuIcon,
  type MoreMenuIconKind,
  PlayGlyph,
  ZoomButtonShapeSvg,
} from './PanelIcons';
import { ReviewNoticeLayer } from './ReviewNotice';
import { RightPanel } from './RightPanel';
import { AdvPanel, PluginDialogLayer } from './PluginPanel';
import { SidePanelLayer } from './SideWindow';
import { TouchEffectLayer } from './TouchEffectLayer';
import { UIAdjustLayer } from './UIAdjustLayer';

// Popup layout constants from EditorView.swift
const POPUP_WIDTH = 57.8; // EditorView.swift :: EditorView.popupWidth
const POPUP_ROW_HEIGHT = 51.6; // EditorView.swift :: EditorView.popupRowHeight
const POPUP_PAD = 10.4; // EditorView.swift :: EditorView.popupPad
const MORE_WIDTH = 275; // EditorView.swift :: EditorView.moreWidth
const MORE_ROW_HEIGHT = 45.6; // EditorView.swift :: EditorView.moreRowHeight
const MORE_PAD = 2; // EditorView.swift :: EditorView.morePad
const MORE_TEXT_X = 54.5; // EditorView.swift :: EditorView.moreTextX
const MORE_TOP_ABOVE_BUTTON = 263; // EditorView.swift :: EditorView.moreTopAboveButton
const MORE_ROW_COUNT = 9; // EditorView.swift :: EditorView.moreRowCount

// MARK: - FrameCanvas (EditorView.swift :: FrameCanvas)

const FrameCanvas: React.FC<{
  state: EditorState;
  width: number;
  height: number;
  designScale: number;
  draw: (ctx: CanvasRenderingContext2D, size: { width: number; height: number }) => void;
}> = ({ state, width, height, designScale, draw }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const dprCap = state.renderDprCap;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    // 描画解像度の上限 (SETTING「描画の細かさ」)。端末の倍率がそれ以下ならそのまま。
    const deviceDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const dpr = Math.min(deviceDpr, dprCap);
    const backingScale = dpr * Math.max(1, designScale);
    const pw = Math.max(1, Math.round(width * backingScale));
    const ph = Math.max(1, Math.round(height * backingScale));
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(backingScale, 0, 0, backingScale, 0, 0);
    ctx.clearRect(0, 0, width, height);
    drawRef.current(ctx, { width, height });
  }, [width, height, designScale, dprCap]);

  useEffect(() => {
    paint();
    return state.subscribeFrame(() => {
      paint();
    });
  }, [state, paint]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width,
        height,
        display: 'block',
        pointerEvents: 'none',
      }}
    />
  );
};

// MARK: - EditorBackground (EditorView.swift :: EditorBackground)

const EditorBackground: React.FC<{ state: EditorState }> = ({ state }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      backgroundColor: '#000000', // EditorView.swift :: EditorBackground
      pointerEvents: 'none',
      overflow: 'hidden',
    }}
  >
    {state.bgUrl && (
      <>
        <img
          src={state.bgUrl}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: `rgba(0, 0, 0, ${state.bgDim})`, // EditorView.swift :: EditorBackground
          }}
        />
      </>
    )}
  </div>
);

// MARK: - ZoomButton & FXButton (EditorView.swift)

const ZoomButton: React.FC<{
  isPlus: boolean;
  scale: number;
  compact: boolean;
  designScale: number;
  onClick: () => void;
}> = ({ isPlus, scale, compact, designScale, onClick }) => {
  // EditorView.swift :: ZoomButton
  const hit = StripButtonLayout.hit(scale, compact, designScale);
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      style={{
        width: hit.width,
        height: hit.height,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 39, // EditorView.swift :: ZoomButton
          height: 45, // EditorView.swift :: ZoomButton
          transform: `scale(${scale})`,
          transformOrigin: 'left center',
        }}
      >
        <ZoomButtonShapeSvg
          fill={SwiftColors.zoomButtonFill} // EditorView.swift :: ZoomButton
          stroke="#ffffff" // EditorView.swift :: ZoomButton
          strokeWidth={1.5} // EditorView.swift :: ZoomButton
        />
        <div
          style={{
            position: 'absolute',
            left: 16.5, // EditorView.swift :: ZoomButton
            top: 22.5, // EditorView.swift :: ZoomButton
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ width: 25.5, height: 3.3, backgroundColor: '#ffffff' }} />
          {isPlus && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: 3.3, // EditorView.swift :: ZoomButton
                height: 25, // EditorView.swift :: ZoomButton
                backgroundColor: '#ffffff',
                transform: 'translate(-50%, -50%)',
              }}
            />
          )}
        </div>
      </div>
    </button>
  );
};

const FXButton: React.FC<{
  isOn: boolean;
  scale: number;
  compact: boolean;
  designScale: number;
  fontBoost: number;
  onClick: () => void;
}> = ({ isOn, scale, compact, designScale, fontBoost, onClick }) => {
  // EditorView.swift :: FXButton
  const hit = StripButtonLayout.hit(scale, compact, designScale);
  return (
    <button
      type="button"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClick}
      style={{
        width: hit.width,
        height: hit.height,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 39, // EditorView.swift :: FXButton
          height: 45, // EditorView.swift :: FXButton
          transform: `scale(${scale})`,
          transformOrigin: 'left center',
        }}
      >
        <ZoomButtonShapeSvg
          fill={isOn ? SwiftColors.panelBlue : SwiftColors.zoomButtonFill} // EditorView.swift :: FXButton
          stroke="#ffffff"
          strokeWidth={1.5} // EditorView.swift :: FXButton
        />
        <span
          style={{
            position: 'absolute',
            left: 16.5, // EditorView.swift :: FXButton
            top: 22.5, // EditorView.swift :: FXButton
            transform: 'translate(-50%, -50%)',
            font: panelMenuFontCss(21, Math.min(fontBoost, 1.2)), // EditorView.swift :: FXButton
            color: '#ffffff',
            textShadow: isOn ? '0 0 1px rgba(0, 0, 0, 0.35)' : 'none', // EditorView.swift :: FXButton
            lineHeight: 1,
            pointerEvents: 'none',
          }}
        >
          FX
        </span>
      </div>
    </button>
  );
};

// MARK: - StripView (EditorView.swift :: StripView)

const StripView: React.FC<{
  state: EditorState;
  designHeight: number;
  designScale: number;
  compact: boolean;
  fontBoost: number;
}> = ({ state, designHeight, designScale, compact, fontBoost }) => {
  const dragRef = useRef<{ startY: number; origin: number; scrollBeats: number } | null>(null);

  const layout = StripButtonLayout.resolve(
    state.stripWidth / UIAdjustConstants.stripWidthDefault,
    compact,
    designScale,
    null
  );

  return (
    <div
      onPointerDown={(e) => {
        if (state.isPlaying) state.pause();
        dragRef.current = {
          startY: e.clientY,
          origin: state.viewBeat,
          scrollBeats: state.stripScrollBeats,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = dragRef.current;
        if (!d) return;
        const dyDesign = (e.clientY - d.startY) / designScale;
        if (dyDesign === 0) return;
        const ppb = designHeight / d.scrollBeats;
        state.scrollViewBeat(d.origin + dyDesign / ppb);
      }}
      onPointerUp={(e) => {
        dragRef.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          e.currentTarget.releasePointerCapture(e.pointerId);
        }
      }}
      onPointerCancel={() => {
        dragRef.current = null;
      }}
      onWheel={(e) => {
        e.preventDefault();
        if (state.isPlaying) state.pause();
        const ppb = designHeight / state.stripScrollBeats;
        state.scrollViewBeat(state.viewBeat - e.deltaY / designScale / ppb);
      }}
      style={{
        position: 'relative',
        zIndex: 1, // EditorView.swift :: EditorView (above LaneView)
        width: state.stripWidth,
        height: designHeight,
        overflow: 'hidden',
        flexShrink: 0,
        touchAction: 'none',
      }}
    >
      <FrameCanvas
        state={state}
        width={state.stripWidth}
        height={designHeight}
        designScale={designScale}
        draw={(ctx, size) => StripRenderer.draw(ctx, size, state)}
      />

      {/* Zoom - / + buttons and Zoom label */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: layout.minusTop,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        <ZoomButton
          isPlus={false}
          scale={layout.scale}
          compact={compact}
          designScale={designScale}
          onClick={() => state.zoomOut()}
        />
        <div style={{ height: layout.gap }} />
        <ZoomButton
          isPlus={true}
          scale={layout.scale}
          compact={compact}
          designScale={designScale}
          onClick={() => state.zoomIn()}
        />
        <div
          style={{
            marginLeft: 4 * layout.scale, // EditorView.swift :: StripView
            marginTop: 3, // EditorView.swift :: StripView
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: layout.labelFont,
            color: 'rgba(255, 255, 255, 0.7)', // EditorView.swift :: StripView
            lineHeight: 1.1,
            pointerEvents: 'none',
          }}
        >
          Zoom {state.zoomLabel}
        </div>
      </div>

      {/* FX button */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: layout.fxTop,
        }}
      >
        <FXButton
          isOn={state.fxMode}
          scale={layout.scale}
          compact={compact}
          designScale={designScale}
          fontBoost={fontBoost}
          onClick={() => state.toggleFX()}
        />
      </div>
    </div>
  );
};

// MARK: - SeekPanel + PlayToggleButton (EditorView.swift :: SeekPanel / SeekView / PlayToggleButton)

const SeekPanel: React.FC<{
  state: EditorState;
  designHeight: number;
  designScale: number;
}> = ({ state, designHeight, designScale }) => {
  const [seeking, setSeeking] = useState(false);
  const [pressed, setPressed] = useState(false);
  const seekDivRef = useRef<HTMLDivElement | null>(null);
  const seekDragRef = useRef(false);

  const H = designHeight;
  const btnH = Math.min(H / 5, Math.max(60, H - 340)); // EditorView.swift :: SeekPanel
  const btnW = SeekPanelConstants.totalWidth - 2; // EditorView.swift :: SeekPanel
  const stubW = SeekPanelConstants.hexCenterX - SeekPanelConstants.playHexWidth / 2 + 1; // EditorView.swift :: SeekPanel
  const hexOffsetX = SeekPanelConstants.hexCenterX - btnW / 2;

  const innerW =
    SeekPanelConstants.playHexWidth - SeekPanelConstants.playBorder * 2 * 1.1547; // EditorView.swift :: PlayToggleButton
  const innerH = SeekPanelConstants.playHexHeight - SeekPanelConstants.playBorder * 2; // EditorView.swift :: PlayToggleButton
  const hexFill = pressed ? SwiftColors.playHexPressed : SwiftColors.playHexFill;

  const updateSeekFromClientY = (clientY: number) => {
    const el = seekDivRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const localY = (clientY - rect.top) / designScale;
    const f = 1.0 - localY / Math.max(1, H * SeekRenderer.regionScale); // EditorView.swift :: SeekView
    state.seek(f);
  };

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1, // EditorView.swift :: EditorView (above LaneView)
        width: SeekPanelConstants.totalWidth,
        height: designHeight,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', width: '100%', height: '100%' }}>
        <div
          ref={seekDivRef}
          onPointerDown={(e) => {
            seekDragRef.current = true;
            setSeeking(true);
            state.seekBegin();
            e.currentTarget.setPointerCapture(e.pointerId);
            updateSeekFromClientY(e.clientY);
          }}
          onPointerMove={(e) => {
            if (!seekDragRef.current) return;
            updateSeekFromClientY(e.clientY);
          }}
          onPointerUp={(e) => {
            if (seekDragRef.current) {
              seekDragRef.current = false;
              setSeeking(false);
              state.seekEnd();
            }
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onPointerCancel={() => {
            if (seekDragRef.current) {
              seekDragRef.current = false;
              setSeeking(false);
              state.seekEnd();
            }
          }}
          style={{
            width: SeekPanelConstants.seekWidth,
            height: H,
            overflow: 'hidden',
            cursor: 'ns-resize',
            touchAction: 'none',
          }}
        >
          <FrameCanvas
            state={state}
            width={SeekPanelConstants.seekWidth}
            height={H}
            designScale={designScale}
            draw={(ctx, size) => SeekRenderer.draw(ctx, size, state)}
          />
        </div>
        <div style={{ width: SeekPanelConstants.labelWidth, height: H, pointerEvents: 'none' }}>
          <FrameCanvas
            state={state}
            width={SeekPanelConstants.labelWidth}
            height={H}
            designScale={designScale}
            draw={(ctx, size) => TimeLabelRenderer.draw(ctx, size, state)}
          />
        </div>
      </div>

      {/* Horizontal white stub from Strip right edge to left vertex of play hexagon */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: H / 2 - 1.5,
          width: stubW,
          height: 3, // EditorView.swift :: SeekPanel
          backgroundColor: '#ffffff',
          opacity: seeking ? 0 : 1,
          pointerEvents: 'none',
        }}
      />

      {/* PlayToggleButton (EditorView.swift :: PlayToggleButton) */}
      <div
        onPointerDown={(e) => {
          if (seeking) return;
          e.stopPropagation();
          if (!pressed) {
            setPressed(true);
            state.togglePlay();
          }
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerUp={(e) => {
          setPressed(false);
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => setPressed(false)}
        style={{
          position: 'absolute',
          left: 0,
          top: H / 2 - btnH / 2,
          width: btnW,
          height: btnH,
          opacity: seeking ? 0 : 1,
          transition: 'opacity 0.12s ease-out', // EditorView.swift :: PlayToggleButton
          pointerEvents: seeking ? 'none' : 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: SeekPanelConstants.playHexWidth,
            height: SeekPanelConstants.playHexHeight,
            transform: `translateX(${hexOffsetX}px)`,
            pointerEvents: 'none',
          }}
        >
          <HexagonShapeSvg
            width={SeekPanelConstants.playHexWidth}
            height={SeekPanelConstants.playHexHeight}
            fill="#ffffff" // EditorView.swift :: PlayToggleButton
            innerWidth={innerW}
            innerHeight={innerH}
            innerFill={hexFill}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PlayGlyph isPlaying={state.isPlaying} />
          </div>
        </div>
      </div>
    </div>
  );
};

// MARK: - LaneWidthSlider (EditorView.swift :: LaneWidthSlider)

const WIDTH_TOUCH_HEIGHT = 60; // EditorView.swift :: LaneWidthSlider.touchHeight
const WIDTH_BAR_HEIGHT = 18; // EditorView.swift :: LaneWidthSlider.barHeight
const WIDTH_BAR_BOTTOM = 19; // EditorView.swift :: LaneWidthSlider.barBottom

const LaneWidthSlider: React.FC<{
  state: EditorState;
  laneWidth: number;
  designScale: number;
}> = ({ state, laneWidth, designScale }) => {
  const g = new LaneGeo(laneWidth, WIDTH_TOUCH_HEIGHT, 0, 1);
  const trackL = g.trackL;
  const trackW = g.trackW;
  const value = state.snapWidth(state.widthUnits);
  const hx = trackL + (value / 255.0) * trackW;

  const grabRef = useRef<number | null>(null);
  const activeAreaRef = useRef<HTMLDivElement | null>(null);

  const toLocalX = (clientX: number): number => {
    const el = activeAreaRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return (clientX - rect.left) / designScale;
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: WIDTH_TOUCH_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        ref={activeAreaRef}
        onPointerDown={(e) => {
          e.stopPropagation();
          const lx = toLocalX(e.clientX);
          const tx = trackL + (state.snapWidth(state.widthUnits) / 255.0) * trackW;
          grabRef.current = Math.abs(lx - tx) <= 26 ? tx - lx : 0; // EditorView.swift :: LaneWidthSlider (26pt)
          state.widthSliderBegan();
          e.currentTarget.setPointerCapture(e.pointerId);
          const u = Math.round(((lx + grabRef.current - trackL) / trackW) * 255.0);
          const nv = Math.min(255, Math.max(1, u));
          if (nv !== state.snapWidth(state.widthUnits)) state.widthSliderMoved(nv);
        }}
        onPointerMove={(e) => {
          if (grabRef.current === null) return;
          const lx = toLocalX(e.clientX);
          const px = lx + grabRef.current;
          const u = Math.round(((px - trackL) / trackW) * 255.0);
          const nv = Math.min(255, Math.max(1, u));
          if (nv !== state.snapWidth(state.widthUnits)) state.widthSliderMoved(nv);
        }}
        onPointerUp={(e) => {
          if (grabRef.current !== null) {
            grabRef.current = null;
            state.widthSliderEnded();
          }
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => {
          if (grabRef.current !== null) {
            grabRef.current = null;
            state.widthSliderEnded();
          }
        }}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'flex-end',
          cursor: 'ew-resize',
          touchAction: 'none',
        }}
      >
        <div
          style={{
            marginLeft: trackL,
            width: Math.max(0, hx - trackL),
            height: WIDTH_BAR_HEIGHT,
            borderRadius: 4, // EditorView.swift :: LaneWidthSlider
            backgroundColor: 'rgba(255, 255, 255, 0.5)', // EditorView.swift :: LaneWidthSlider
            pointerEvents: 'none',
          }}
        />
      </div>
      {/* edgeDead area (EditorView.swift :: LaneWidthSlider.edgeDead = barBottom) */}
      <div
        onPointerDown={(e) => e.stopPropagation()}
        style={{ height: WIDTH_BAR_BOTTOM, width: '100%' }}
      />
    </div>
  );
};

// MARK: - LaneView (EditorView.swift :: LaneView)

const LaneView: React.FC<{
  state: EditorState;
  laneWidth: number;
  designHeight: number;
  designScale: number;
  spillL: number;
  spillR: number;
}> = ({ state, laneWidth, designHeight, designScale, spillL, spillR }) => {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const pointerStateRef = useRef<{
    pointerId: number | null;
    session: 'idle' | 'tool' | 'pan';
    startX: number;
    startY: number;
    scrollOrigin: number | null;
  }>({ pointerId: null, session: 'idle', startX: 0, startY: 0, scrollOrigin: null });
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    startDist: number;
    startVisibleBeats: number;
    startClientDist: number;
    active: boolean;
  } | null>(null);
  const panBlockedRef = useRef(false);
  const multiTapRef = useRef<{
    maxCount: number;
    eligible: boolean;
    firstDownMs: number;
    origins: Map<number, { clientX: number; clientY: number }>;
  }>({
    maxCount: 0,
    eligible: false,
    firstDownMs: 0,
    origins: new Map(),
  });

  const TAP_MOVE_THRESHOLD_PX = 22;
  const PINCH_START_DELTA_PX = 12;
  const TAP_MAX_DURATION_MS = 550;
  const CONCURRENT_JOIN_WINDOW_MS = 350;

  const toLocalPt = (clientX: number, clientY: number) => {
    const el = laneRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const sx = rect.width > 0 ? laneWidth / rect.width : 1 / designScale;
    const sy = rect.height > 0 ? designHeight / rect.height : 1 / designScale;
    return {
      x: (clientX - rect.left) * sx,
      y: (clientY - rect.top) * sy,
    };
  };

  const endActivePointer = (e: React.PointerEvent<HTMLDivElement>, isCancel = false) => {
    const mt = multiTapRef.current;
    if (isCancel) {
      mt.eligible = false;
    } else if (mt.eligible) {
      const orig = mt.origins.get(e.pointerId);
      if (!orig || Math.hypot(e.clientX - orig.clientX, e.clientY - orig.clientY) > TAP_MOVE_THRESHOLD_PX) {
        mt.eligible = false;
      }
    }
    mt.origins.delete(e.pointerId);
    activePointersRef.current.delete(e.pointerId);
    const ps = pointerStateRef.current;
    if (ps.pointerId === e.pointerId) {
      state.holdCancel();
      const p = toLocalPt(e.clientX, e.clientY);
      if (ps.session === 'tool') {
        state.laneTouch(
          { x: ps.startX, y: ps.startY },
          p,
          { width: laneWidth, height: designHeight },
          'ended'
        );
      }
      pointerStateRef.current = {
        pointerId: null,
        session: 'idle',
        startX: 0,
        startY: 0,
        scrollOrigin: null,
      };
    }
    if (activePointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (activePointersRef.current.size === 0) {
      panBlockedRef.current = false;
      if (
        state.touchUndoRedo &&
        mt.eligible &&
        performance.now() - mt.firstDownMs <= TAP_MAX_DURATION_MS
      ) {
        if (mt.maxCount === 2) {
          state.undo();
        } else if (mt.maxCount >= 3) {
          state.redo();
        }
      }
      mt.maxCount = 0;
      mt.eligible = false;
      mt.origins.clear();
    }
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore synthetic/Safari pointer capture release errors
    }
  };

  return (
    <div
      ref={laneRef}
      style={{
        position: 'relative',
        width: laneWidth,
        height: designHeight,
        zIndex: 0, // EditorView.swift :: EditorView (LaneView .zIndex(-1) -> below Strip/Seek/RightPanel at zIndex 1 without falling behind flex container)
        flexShrink: 0,
      }}
    >
      {/* Expanded canvas spilling under StripView, SeekPanel, and RightPanel */}
      <div
        style={{
          position: 'absolute',
          left: -spillL,
          top: 0,
          width: laneWidth + spillL + spillR,
          height: designHeight,
          pointerEvents: 'none',
        }}
      >
        <FrameCanvas
          state={state}
          width={laneWidth + spillL + spillR}
          height={designHeight}
          designScale={designScale}
          draw={(ctx) => {
            ctx.save();
            ctx.translate(spillL, 0);
            LaneRenderer.draw(ctx, { width: laneWidth, height: designHeight }, state);
            ctx.restore();
          }}
        />
      </div>

      {/* Hit testing surface strictly inside Lane bounds */}
      <div
        onPointerDown={(e) => {
          const p = toLocalPt(e.clientX, e.clientY);
          const now = performance.now();
          const mt = multiTapRef.current;
          activePointersRef.current.set(e.pointerId, p);
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Ignore Safari pointer capture edge cases
          }

          if (state.touchUndoRedo && e.pointerType !== 'mouse') {
            if (activePointersRef.current.size === 1) {
              mt.maxCount = 1;
              mt.eligible = true;
              mt.firstDownMs = now;
              mt.origins.clear();
              mt.origins.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
            } else {
              mt.origins.set(e.pointerId, { clientX: e.clientX, clientY: e.clientY });
              if (now - mt.firstDownMs > CONCURRENT_JOIN_WINDOW_MS) {
                mt.eligible = false;
              }
              if (mt.eligible) {
                mt.maxCount = Math.max(mt.maxCount, activePointersRef.current.size);
              }
            }
          } else {
            mt.eligible = false;
          }

          if (activePointersRef.current.size >= 2 && (mt.eligible || !state.laneToolActive)) {
            if (pointerStateRef.current.session === 'tool') {
              state.cancelLaneTouch();
            } else if (
              pointerStateRef.current.session === 'pan' &&
              pointerStateRef.current.scrollOrigin !== null
            ) {
              state.setViewBeat(pointerStateRef.current.scrollOrigin);
            }
            panBlockedRef.current = true;
            state.holdCancel();
            pointerStateRef.current = {
              pointerId: null,
              session: 'idle',
              startX: 0,
              startY: 0,
              scrollOrigin: null,
            };

            if (activePointersRef.current.size === 2 && !state.laneToolActive) {
              const pts = Array.from(activePointersRef.current.values());
              const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
              pinchRef.current = {
                startDist: Math.max(1, dist),
                startVisibleBeats: state.visibleBeats,
                startClientDist: dist * designScale,
                active: !(state.touchUndoRedo && mt.eligible),
              };
            } else {
              pinchRef.current = null;
            }
            return;
          }

          if (pointerStateRef.current.session !== 'idle' || panBlockedRef.current) return;

          const session = state.laneToolActive ? 'tool' : 'pan';
          pointerStateRef.current = {
            pointerId: e.pointerId,
            session,
            startX: p.x,
            startY: p.y,
            scrollOrigin: null,
          };
          state.holdCancel();
          if (session === 'tool') {
            state.laneTouch(p, p, { width: laneWidth, height: designHeight }, 'began');
          } else {
            state.holdBegan();
          }
        }}
        onPointerMove={(e) => {
          const p = toLocalPt(e.clientX, e.clientY);
          if (activePointersRef.current.has(e.pointerId)) {
            activePointersRef.current.set(e.pointerId, p);
          }

          const mt = multiTapRef.current;
          if (mt.eligible) {
            const orig = mt.origins.get(e.pointerId);
            if (orig && Math.hypot(e.clientX - orig.clientX, e.clientY - orig.clientY) > TAP_MOVE_THRESHOLD_PX) {
              mt.eligible = false;
            }
          }

          if (pinchRef.current && activePointersRef.current.size === 2 && !state.laneToolActive) {
            const pts = Array.from(activePointersRef.current.values());
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            if (!pinchRef.current.active) {
              const clientDist = dist * designScale;
              if (Math.abs(clientDist - pinchRef.current.startClientDist) > PINCH_START_DELTA_PX) {
                pinchRef.current.active = true;
                pinchRef.current.startDist = Math.max(1, dist);
                pinchRef.current.startVisibleBeats = state.visibleBeats;
                mt.eligible = false;
              } else {
                return;
              }
            }
            const scale = dist / pinchRef.current.startDist;
            state.pinchZoom(pinchRef.current.startVisibleBeats, scale);
            return;
          }

          const ps = pointerStateRef.current;
          if (ps.session === 'idle' || ps.pointerId !== e.pointerId) return;
          if (ps.session === 'tool') {
            state.laneTouch(
              { x: ps.startX, y: ps.startY },
              p,
              { width: laneWidth, height: designHeight },
              'changed'
            );
          } else if (ps.session === 'pan') {
            if (panBlockedRef.current) return;
            const dx = p.x - ps.startX;
            const dy = p.y - ps.startY;
            if (Math.hypot(dx, dy) > 10) state.holdCancel();
            if (ps.scrollOrigin === null) {
              if (state.isPlaying) state.pause();
              ps.scrollOrigin = state.viewBeat;
            }
            const ppb = designHeight / state.visibleBeats;
            if (dy !== 0) {
              state.scrollViewBeat(ps.scrollOrigin + dy / ppb);
            }
          }
        }}
        onPointerUp={(e) => endActivePointer(e, false)}
        onPointerCancel={(e) => endActivePointer(e, true)}
        onWheel={(e) => {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            if (!state.laneToolActive) {
              const factor = Math.exp(-e.deltaY * 0.004);
              state.pinchZoom(state.visibleBeats, factor);
            }
            return;
          }
          if (state.isPlaying) state.pause();
          const ppb = designHeight / state.visibleBeats;
          state.scrollViewBeat(state.viewBeat - e.deltaY / designScale / ppb);
        }}
        style={{
          position: 'absolute',
          inset: 0,
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          WebkitTouchCallout: 'none',
        }}
      />

      {state.editing && (
        <LaneWidthSlider state={state} laneWidth={laneWidth} designScale={designScale} />
      )}
    </div>
  );
};

// MARK: - Main EditorView (EditorView.swift :: DesignCanvas + EditorView)

export const EditorView: React.FC<{ state: EditorState }> = ({ state }) => {
  const [, setVersion] = useState(0);
  const [viewport, setViewport] = useState<{ w: number; h: number }>({ w: 1180, h: 820 });
  const [showDivideInput, setShowDivideInput] = useState(false);
  const [divideText, setDivideText] = useState('');
  const targetAdvW = state.editing && state.advOpen ? state.advPanelWidth : 0;
  const [animAdvW, setAnimAdvW] = useState(targetAdvW);
  const animAdvWRef = useRef(animAdvW);
  animAdvWRef.current = animAdvW;
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const startW = animAdvWRef.current;
    if (Math.abs(startW - targetAdvW) < 0.25) {
      setAnimAdvW(targetAdvW);
      return;
    }
    let rafId = 0;
    const durationMs = 220; // EditorView.swift :: withAnimation(.easeInOut(duration: 0.22))
    const startTime = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setAnimAdvW(startW + (targetAdvW - startW) * ease);
      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        setAnimAdvW(targetAdvW);
      }
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [targetAdvW]);

  useEffect(() => {
    const flush = () => state.flushPendingSave();
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, [state]);

  useEffect(() => {
    return state.subscribeUI(() => {
      setVersion((v) => v + 1);
    });
  }, [state]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setViewport({ w: Math.max(1, r.width), h: Math.max(1, r.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard shortcuts: Space (play/pause), Cmd/Ctrl+Z (undo), Cmd/Ctrl+Shift+Z (redo)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (state.pluginDialog) {
        if (e.key === 'Escape' || (e.key === 'Enter' && state.pluginDialog.kind === 'message')) {
          e.preventDefault();
          state.resolvePluginDialog(null);
        }
        return;
      }
      if (showDivideInput || state.showGridDialog) {
        if (e.key === 'Escape') {
          setShowDivideInput(false);
          if (state.showGridDialog) {
            state.showGridDialog = false;
            state.emitUI();
          }
        }
        return;
      }
      const target = e.target as HTMLElement | null;
      const inEditableField =
        target !== null &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === 'Escape' && state.uiAdjustMode) {
        state.exitUIAdjust();
        return;
      }
      if (state.uiAdjustMode) return;
      if (e.key === 'Escape' && state.sidePanel !== null) {
        state.closeSidePanel();
        return;
      }
      if (inEditableField) return;
      if (e.code === 'Space') {
        e.preventDefault();
        state.togglePlay();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) state.redo();
        else state.undo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state, showDivideInput]);

  const s = DesignScreen.scaleForHeight(viewport.h);
  const compact = s < DesignScreen.compactThreshold;
  const designH = DesignScreen.height; // 820
  const designW = viewport.w / s;
  const fontBoost = compact ? DesignScreen.compactFontBoost : 1;

  useEffect(() => {
    if (state.compactLayout !== compact) {
      state.compactLayout = compact;
      state.emitFrame();
    }
  }, [state, compact]);

  const stripW = state.stripWidth;
  const seekTotalW = SeekPanelConstants.totalWidth;
  const advW = animAdvW;
  const rightW = state.rightPanelWidth;
  const laneW = Math.max(10, designW - stripW - seekTotalW - advW - rightW);

  // Popup geometry calculations verbatim from EditorView.swift :: EditorView.popupScale / moreMenuTop
  const popupScale = (): number => {
    const want = state.menuScale;
    const listH = (rows: number) => rows * POPUP_ROW_HEIGHT + POPUP_PAD * 2;
    let base: number;
    let room: number;
    switch (state.popup) {
      case 'speed':
        base = listH(EditorState.speeds.length);
        room = designH - RightPanelConstants.popupBottomInset - 4;
        break;
      case 'divide':
        base = listH(EditorState.divides.length + 1);
        room = designH - RightPanelConstants.popupBottomInset - 4;
        break;
      case 'more':
        base = MORE_ROW_HEIGHT * MORE_ROW_COUNT + MORE_PAD * 2;
        room = designH - 8;
        break;
      default:
        return 1;
    }
    return Math.max(1, Math.min(want, room / base));
  };

  const moreMenuTop = (scale: number): number => {
    const editTopCount = state.touchUndoRedo ? 8 : 9;
    const iconScale = RightPanelConstants.effectiveIconScale(
      rightW / RightPanelConstants.width,
      designH,
      true,
      compact,
      editTopCount
    );
    const top = RightPanelConstants.moreCenterY(designH, compact, iconScale, editTopCount) - MORE_TOP_ABOVE_BUTTON;
    const menuH = (MORE_ROW_HEIGHT * MORE_ROW_COUNT + MORE_PAD * 2) * scale;
    return Math.max(4, Math.min(top, designH - menuH - 4));
  };

  const dropSeqRef = useRef(0);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    const seq = ++dropSeqRef.current;

    for (const file of files) {
      const kind = detectFileKind(file.name, file.type);
      if (kind === 'mc') {
        const text = await file.text();
        if (seq !== dropSeqRef.current) return;
        state.loadChartJSON(text, file.name);
        state.showToast(`譜面を読み込みました (${file.name})`);
        return;
      }
      if (kind === 'mcz') {
        unlockAudioContext();
        const buf = await file.arrayBuffer();
        const unpacked = await unpackMCZ(buf, file.name);
        if (seq !== dropSeqRef.current) return;
        if (unpacked.charts.length === 0) {
          state.showToast('MCZの中に .mc が見つかりません');
          return;
        }
        const entry = unpacked.charts[0];
        const media = pickMediaForChart(entry.text, unpacked.fileNames);
        const rawImgBytes = media.imageName ? unpacked.files.get(media.imageName) ?? null : null;
        let resolvedImgBytes: Uint8Array | null = rawImgBytes;
        let resolvedImgName = rawImgBytes && media.imageName ? media.imageName : '';
        if (rawImgBytes) {
          try {
            const prepared = await prepareBackgroundImage(rawImgBytes, {
              fileName: resolvedImgName,
              maxLongSide: BACKGROUND_MAX_LONG_SIDE,
            });
            if (seq !== dropSeqRef.current) return;
            resolvedImgBytes = prepared.bytes;
            if (prepared.fileName) resolvedImgName = prepared.fileName;
          } catch {
            if (seq !== dropSeqRef.current) return;
            resolvedImgBytes = null;
            resolvedImgName = '';
          }
        }
        state.setBackgroundBytes(resolvedImgBytes, resolvedImgName);

        let song: SongPCM | null = null;
        let audioBytes: Uint8Array | null = null;
        let audioName = '';
        let audioErr = '';
        if (media.audioName) {
          const rawAudio = unpacked.files.get(media.audioName) ?? null;
          if (rawAudio) {
            audioBytes = rawAudio;
            audioName = media.audioName;
            try {
              song = await SongPCM.decode(rawAudio, media.audioName);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              audioErr = `音源を読み込めませんでした(無音で開きます): ${msg}`;
            }
            if (seq !== dropSeqRef.current) return;
          }
        }
        state.setAudio(song, audioBytes, audioName);
        state.loadChartJSON(entry.text, entry.name);
        if (
          resolvedImgName &&
          /\.(heic|heif)$/i.test(state.chart.metaString(['background']))
        ) {
          state.chart.setMetaString(['background'], resolvedImgName);
          state.metaChanged();
        }
        state.showToast(audioErr || `MCZを読み込みました (${entry.name})`);
        return;
      }
      if (kind === 'audio') {
        unlockAudioContext();
        try {
          const buf = await file.arrayBuffer();
          const bytes = new Uint8Array(buf);
          const song = await SongPCM.decode(bytes, file.name);
          if (seq !== dropSeqRef.current) return;
          state.setAudio(song, bytes, file.name);
          state.showToast(`音源を読み込みました (${file.name})`);
        } catch (err) {
          if (seq !== dropSeqRef.current) return;
          const msg = err instanceof Error ? err.message : String(err);
          state.showToast(`音源を読み込めませんでした: ${msg}`);
        }
        return;
      }
      if (kind === 'image') {
        try {
          const buf = await file.arrayBuffer();
          const prepared = await prepareBackgroundImage(new Uint8Array(buf), {
            fileName: file.name,
            mimeType: file.type,
            maxLongSide: BACKGROUND_MAX_LONG_SIDE,
          });
          if (seq !== dropSeqRef.current) return;
          state.setBackgroundBytes(prepared.bytes, prepared.fileName);
          state.showToast(`背景画像を読み込みました (${prepared.fileName})`);
        } catch {
          if (seq !== dropSeqRef.current) return;
          state.showToast('背景画像を読み込めませんでした');
        }
        return;
      }
    }
  };

  const pScale = popupScale();
  const isMore = state.popup === 'more';

  return (
    <div
      ref={rootRef}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        void handleDrop(e);
      }}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: '#000000',
        touchAction: 'none',
      }}
    >
      {/* Background lives behind entire scaled editor (EditorView.swift :: EditorBackground) */}
      <EditorBackground state={state} />

      {/* DesignCanvas scaling 820pt height verbatim from EditorView.swift :: DesignCanvas */}
      <div
        style={{
          position: 'relative',
          width: designW,
          height: designH,
          transform: `scale(${s})`,
          transformOrigin: 'top left',
        }}
      >
        <div
          style={{
            position: 'relative',
            isolation: 'isolate',
            width: designW,
            height: designH,
            display: 'flex',
            flexDirection: 'row',
          }}
        >
          <StripView
            state={state}
            designHeight={designH}
            designScale={s}
            compact={compact}
            fontBoost={fontBoost}
          />
          <SeekPanel state={state} designHeight={designH} designScale={s} />
          <AdvPanel state={state} width={advW} designHeight={designH} />
          <LaneView
            state={state}
            laneWidth={laneW}
            designHeight={designH}
            designScale={s}
            spillL={stripW + seekTotalW + advW}
            spillR={rightW}
          />
          <RightPanel
            state={state}
            designHeight={designH}
            compact={compact}
            fontBoost={fontBoost}
          />
        </div>

        {/* Popup layer: Speed / Divide / More */}
        {state.popup !== 'none' && (
          <div
            onClick={() => {
              state.popup = 'none';
              state.emitUI();
            }}
            style={{
              position: 'absolute',
              inset: 0,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                right: rightW + RightPanelConstants.sideGap, // EditorView.swift :: popupLayer
                top: isMore ? moreMenuTop(pScale) : undefined,
                bottom: isMore ? undefined : RightPanelConstants.popupBottomInset, // EditorView.swift :: popupLayer
                transform: `scale(${pScale})`,
                transformOrigin: isMore ? 'top right' : 'bottom right',
              }}
            >
              {state.popup === 'speed' && (
                <PopupList
                  items={EditorState.speeds.map((v) => ({
                    title: `${v}x`,
                    selected: Math.abs(v - state.playSpeed) < 0.0001,
                    action: () => state.setSpeed(v),
                  }))}
                  fontBoost={fontBoost}
                />
              )}
              {state.popup === 'divide' && (
                <PopupList
                  items={[
                    ...EditorState.divides.map((d) => ({
                      title: `1/${d}`,
                      selected: d === state.snapDen,
                      action: () => state.setDivide(d),
                    })),
                    {
                      title: '入力…',
                      selected: !EditorState.divides.includes(state.snapDen),
                      action: () => {
                        state.popup = 'none';
                        state.emitUI();
                        setDivideText('');
                        setShowDivideInput(true);
                      },
                    },
                  ]}
                  fontBoost={fontBoost}
                />
              )}
              {state.popup === 'more' && <MoreList state={state} fontBoost={fontBoost} />}
            </div>
          </div>
        )}

        {/* PluginDialogLayer: Lua error / message modal (EditorView.swift :: above popupLayer) */}
        <PluginDialogLayer state={state} />

        {/* GridSettingsDialog */}
        {state.showGridDialog && (
          <GridSettingsDialog
            state={state}
            designWidth={designW}
            designHeight={designH}
            designScale={s}
            compact={compact}
          />
        )}

        {/* SidePanelLayer: BPM list / Effect list (EditorView.swift :: SidePanelLayer above gridDialogLayer, below toastLayer) */}
        <SidePanelLayer
          state={state}
          designWidth={designW}
          designHeight={designH}
          designScale={s}
          compact={compact}
          fontBoost={fontBoost}
        />

        {/* UIAdjustLayer (UIAdjust.swift :: UIAdjustLayer / EditorView.swift :: above SidePanelLayer) */}
        <UIAdjustLayer
          state={state}
          designWidth={designW}
          designHeight={designH}
          designScale={s}
          compact={compact}
        />

        {/* Custom 1/n divide modal (replaces SwiftUI .alert without window.prompt) */}
        {showDivideInput && (
          <div
            onClick={() => setShowDivideInput(false)}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                setShowDivideInput(false);
                state.applyDivideInput(divideText);
              }}
              style={{
                width: 300,
                backgroundColor: 'rgba(28, 28, 30, 0.96)',
                border: '1px solid rgba(255, 255, 255, 0.35)',
                borderRadius: 12,
                padding: 18,
                color: '#ffffff',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 600 }}>分割 (1/n)</div>
              <div style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.72)' }}>
                n を 2〜1024 の整数で (例: 48 → 1/48)
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoFocus
                placeholder="2〜1024"
                value={divideText}
                onChange={(e) => setDivideText(e.target.value)}
                style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.6)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  color: '#ffffff',
                  fontSize: 16,
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setShowDivideInput(false)}
                  style={{
                    padding: '6px 14px',
                    backgroundColor: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: 6,
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '6px 14px',
                    backgroundColor: SwiftColors.panelBlue,
                    border: 'none',
                    borderRadius: 6,
                    color: '#000000',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  OK
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Toast layer (EditorView.swift :: EditorView.toastLayer) */}
        {state.toast && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 60, // EditorView.swift :: toastLayer
              display: 'flex',
              justifyContent: 'center',
              paddingLeft: 24, // EditorView.swift :: toastLayer
              paddingRight: 24, // EditorView.swift :: toastLayer
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                padding: '10px 16px', // EditorView.swift :: toastLayer
                borderRadius: 20, // EditorView.swift :: toastLayer
                backgroundColor: 'rgba(38, 38, 38, 0.95)', // EditorView.swift :: toastLayer (Color(white: 0.15).opacity(0.95))
                border: '1px solid rgba(255, 255, 255, 0.3)', // EditorView.swift :: toastLayer
                color: '#ffffff',
                fontSize: compact ? 17 : 14, // EditorView.swift :: toastLayer
                textAlign: 'center',
                lineHeight: 1.35,
              }}
            >
              {state.toast}
            </div>
          </div>
        )}

        {/* Review notice (0 issue found) */}
        <ReviewNoticeLayer tick={state.reviewNoticeTick} compact={compact} />
      </div>

      {/* Touch effect overlay (EditorView.swift :: TouchEffectInstaller) */}
      <TouchEffectLayer enabled={state.touchEffect} containerRef={rootRef} />
    </div>
  );
};

// MARK: - Popups (EditorView.swift :: popupList / moreList)

const PopupList: React.FC<{
  items: { title: string; selected: boolean; action: () => void }[];
  fontBoost: number;
}> = ({ items, fontBoost }) => (
  // EditorView.swift :: popupList
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      paddingTop: POPUP_PAD,
      paddingBottom: POPUP_PAD,
      backgroundColor: 'rgba(0, 0, 0, 0.5)', // EditorView.swift :: popupList
      border: '1.2px solid rgba(255, 255, 255, 0.7)', // EditorView.swift :: popupList
      boxSizing: 'border-box',
    }}
  >
    {items.map((item, idx) => (
      <button
        key={idx}
        type="button"
        onClick={item.action}
        style={{
          width: POPUP_WIDTH,
          height: POPUP_ROW_HEIGHT,
          paddingLeft: 3, // EditorView.swift :: popupList
          paddingRight: 3, // EditorView.swift :: popupList
          background: 'transparent',
          border: 'none',
          color: item.selected ? SwiftColors.panelBlue : '#ffffff',
          font: panelMenuFontCss(29, fontBoost), // EditorView.swift :: popupList
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        {item.title}
      </button>
    ))}
  </div>
);

const MoreList: React.FC<{ state: EditorState; fontBoost: number }> = ({ state, fontBoost }) => {
  // EditorView.swift :: moreList
  const moreItem = (
    title: string,
    icon: MoreMenuIconKind,
    opts: { active?: boolean; dim?: boolean; action: () => void }
  ) => {
    const fg = opts.active
      ? SwiftColors.panelBlue
      : opts.dim
        ? 'rgba(255, 255, 255, 0.4)' // EditorView.swift :: moreItem
        : '#ffffff';
    return (
      <button
        key={title}
        type="button"
        onClick={opts.action}
        style={{
          position: 'relative',
          width: MORE_WIDTH,
          height: MORE_ROW_HEIGHT,
          background: 'transparent',
          border: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <div style={{ position: 'absolute', left: 0, top: 0, width: 64, height: MORE_ROW_HEIGHT }}>
          <MoreMenuIcon kind={icon} color={fg} rowHeight={MORE_ROW_HEIGHT} />
        </div>
        <span
          style={{
            paddingLeft: MORE_TEXT_X,
            font: panelLabelFontCss(22, fontBoost), // EditorView.swift :: moreItem
            color: fg,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
      </button>
    );
  };

  return (
    <div
      style={{
        width: MORE_WIDTH,
        paddingTop: MORE_PAD,
        paddingBottom: MORE_PAD,
        backgroundColor: 'rgba(0, 0, 0, 0.5)', // EditorView.swift :: moreList
        border: '0.7px solid rgba(255, 255, 255, 0.75)', // EditorView.swift :: moreList
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {moreItem('Copy', 'copy', {
        dim: state.selectedIDs.size === 0,
        action: () => {
          state.popup = 'none';
          state.copySelection();
        },
      })}
      {moreItem('Paste', 'paste', {
        dim: state.clip.length === 0,
        action: () => {
          state.popup = 'none';
          state.paste();
        },
      })}
      {moreItem('Time range', 'timeRange', {
        active: state.tool === 'selectRange',
        action: () => {
          state.popup = 'none';
          state.beginSelectRange();
        },
      })}
      {moreItem('Lasso', 'lasso', {
        active: state.tool === 'lasso',
        action: () => {
          state.popup = 'none';
          state.toggleTool('lasso');
          if (state.tool === 'lasso') {
            state.showToast('指でなぞって囲んだノーツを選択に追加します (タップで解除)');
          }
        },
      })}
      {moreItem('Flip notes horizontal', 'flip', {
        action: () => {
          state.popup = 'none';
          state.flipHorizontal();
        },
      })}
      {moreItem('Grid settings', 'grid', {
        action: () => {
          state.popup = 'none';
          state.showGridDialog = true;
          state.emitUI();
        },
      })}
      {moreItem('Slide modify', 'slideModify', {
        active: state.tool === 'slideModify',
        action: () => {
          state.popup = 'none';
          state.tool = 'slideModify';
        },
      })}
      {moreItem('Slide to Wipe', 'slideToWipe', {
        action: () => {
          state.popup = 'none';
          state.slideToWipe();
        },
      })}
      {moreItem('Wipe to Slide', 'wipeToSlide', {
        action: () => {
          state.popup = 'none';
          state.wipeToSlide();
        },
      })}
    </div>
  );
};
