// EditorView.swift :: RightPanel / PanelButton / PanelEditLabel
import React, { useEffect, useRef, useState } from 'react';
import {
  RightPanelConstants,
  SwiftColors,
  panelLabelFontCss,
} from '../state/EditorConstants';
import type { EditorState } from '../state/EditorState';
import {
  InfoIcon,
  OrderIcon,
  PanelIconView,
  PowerIcon,
  ReviewIcon,
} from './PanelIcons';

interface PanelButtonProps {
  glyph: string;
  active?: boolean;
  dimmed?: boolean;
  disabled?: boolean;
  badge?: string | null;
  iconScale: number;
  pitch: number;
  flex?: boolean;
  renderIcon?: (color: string) => React.ReactNode;
  onClick: () => void;
}

const PanelButton: React.FC<PanelButtonProps> = ({
  glyph,
  active = false,
  dimmed = false,
  disabled = false,
  badge = null,
  iconScale,
  pitch,
  flex = false,
  renderIcon,
  onClick,
}) => {
  // EditorView.swift :: PanelButton
  const fg = active
    ? SwiftColors.panelBlue
    : dimmed
      ? 'rgba(255, 255, 255, 0.35)' // EditorView.swift :: PanelButton
      : '#ffffff';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        width: flex ? undefined : '100%',
        flex: flex ? 1 : undefined,
        height: pitch,
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        border: 'none',
        padding: 0,
        margin: 0,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${iconScale})`, // EditorView.swift :: PanelButton
        }}
      >
        {renderIcon ? (
          renderIcon(fg)
        ) : (
          <span
            style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: 30, // EditorView.swift :: PanelButton
              fontWeight: 600, // EditorView.swift :: PanelButton
              color: fg,
              lineHeight: 1,
            }}
          >
            {glyph}
          </span>
        )}
        {badge !== null && (
          <span
            style={{
              position: 'absolute',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 14, // EditorView.swift :: PanelButton
              fontWeight: 700, // EditorView.swift :: PanelButton
              color: SwiftColors.laneCyan, // EditorView.swift :: PanelButton
              transform: 'translate(22px, -21px)', // EditorView.swift :: PanelButton
              lineHeight: 1,
            }}
          >
            {badge}
          </span>
        )}
      </div>
    </button>
  );
};

const PanelEditLabel: React.FC<{ text: string; fontBoost: number; pitch: number }> = ({
  text,
  fontBoost,
  pitch,
}) => (
  // PanelIcons.swift :: PanelEditLabel
  <div
    style={{
      height: pitch,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
    }}
  >
    <div
      style={{
        height: 43, // PanelIcons.swift :: PanelEditLabel
        paddingLeft: 5, // PanelIcons.swift :: PanelEditLabel
        paddingRight: 5, // PanelIcons.swift :: PanelEditLabel
        backgroundColor: 'rgba(0, 0, 0, 0.8)', // PanelIcons.swift :: PanelEditLabel
        display: 'flex',
        alignItems: 'center',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          font: panelLabelFontCss(25, fontBoost), // PanelIcons.swift :: PanelEditLabel
          color: '#ffffff',
          lineHeight: 1,
        }}
      >
        {text}
      </span>
    </div>
  </div>
);

export const RightPanel: React.FC<{
  state: EditorState;
  designHeight: number;
  compact: boolean;
  fontBoost: number;
}> = ({ state, designHeight, compact, fontBoost }) => {
  // EditorView.swift :: RightPanel
  const [labelAlpha, setLabelAlpha] = useState(1);
  const [labelFadeTransition, setLabelFadeTransition] = useState('none');
  const timerRef = useRef<number | null>(null);

  const edgeInset = RightPanelConstants.edgeInset(compact);
  const iconScale = RightPanelConstants.effectiveIconScale(
    state.rightPanelWidth / RightPanelConstants.width,
    designHeight,
    state.editing,
    compact
  );
  const pitch = RightPanelConstants.pitch(designHeight, state.editing, compact, iconScale);

  const restartLabelTimer = (active: boolean) => {
    // EditorView.swift :: RightPanel.restartLabelTimer
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!active) return;
    setLabelFadeTransition('none');
    setLabelAlpha(1);
    timerRef.current = window.setTimeout(() => {
      setLabelFadeTransition('opacity 0.7s ease-out'); // EditorView.swift :: RightPanel.restartLabelTimer (0.7s easeOut)
      setLabelAlpha(0);
    }, 2600); // EditorView.swift :: RightPanel.restartLabelTimer (2.6s)
  };

  useEffect(() => {
    restartLabelTimer(state.editing);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [state.editing]);

  useEffect(() => {
    restartLabelTimer(state.metaOpen);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, [state.metaOpen]);

  const editLabels = [
    'Back',
    'Note',
    'Wipe',
    state.slideDraft !== null ? 'Done' : 'Slide',
    'Remove',
    'Order',
    'Adv.',
    'More',
    'Undo / Redo',
  ]; // EditorView.swift :: RightPanel.editLabels

  const metaLabels = ['Back', 'Information', 'More', 'Review', 'Quit']; // EditorView.swift :: RightPanel.metaLabels

  const columnKey = state.editing ? 'edit' : state.metaOpen ? 'meta' : 'main';

  return (
    <div
      style={{
        position: 'relative',
        zIndex: 1, // EditorView.swift :: EditorView (LaneView .zIndex(-1) -> LaneView zIndex 0 below panels zIndex 1)
        width: state.rightPanelWidth, // EditorView.swift :: RightPanel
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.35)', // EditorView.swift :: RightPanel
        borderLeft: '1px solid rgba(255, 255, 255, 0.6)', // EditorView.swift :: RightPanel
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        paddingTop: edgeInset,
        paddingBottom: edgeInset,
        flexShrink: 0,
        opacity: state.sidePanel === null ? 1 : 0, // EditorView.swift :: RightPanel (.opacity(state.sidePanel == nil ? 1 : 0))
        transition: state.sidePanel !== null ? 'opacity 0.16s ease-out' : 'opacity 0.12s ease-in', // SideWindow.swift :: openAnimation / closeAnimation
        pointerEvents: state.sidePanel === null ? 'auto' : 'none',
      }}
    >
      {/* Top column: Main / Edit / Meta (TEST omitted per 1.txt & user choice) */}
      <div
        key={columnKey}
        className="panel-swap-in"
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
        }}
      >
        {state.editing ? (
          <>
            <PanelButton
              glyph="←"
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <PanelIconView kind="back" color={c} />}
              onClick={() => state.leaveEdit()}
            />
            <PanelButton
              glyph="▬"
              active={state.tool === 'note'}
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <PanelIconView kind="note" color={c} />}
              onClick={() => state.toggleTool('note')}
            />
            <PanelButton
              glyph="◆"
              active={state.tool === 'wipe'}
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <PanelIconView kind="wipe" color={c} />}
              onClick={() => state.toggleTool('wipe')}
            />
            <PanelButton
              glyph={state.slideDraft !== null ? '完' : '⌇'}
              active={state.tool === 'slide'}
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={
                state.slideDraft !== null ? undefined : (c) => <PanelIconView kind="slide" color={c} />
              }
              onClick={() => {
                if (state.slideDraft !== null) state.finishSlide();
                else state.toggleTool('slide');
              }}
            />
            <PanelButton
              glyph="✕"
              active={state.tool === 'remove'}
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <PanelIconView kind="remove" color={c} />}
              onClick={() => state.removeButtonTapped()}
            />
            <PanelButton
              glyph="①②"
              active={state.tool === 'order'}
              badge={state.orderIDs.length === 0 ? null : String(state.orderIDs.length)}
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <OrderIcon color={c} />}
              onClick={() => {
                state.toggleTool('order');
                if (state.tool === 'order') {
                  state.showToast('スライドをタップした順に番号を付けます (空きをタップでリセット)');
                }
              }}
            />
            <PanelButton
              glyph="λ"
              active={state.advOpen}
              iconScale={iconScale}
              pitch={pitch}
              onClick={() => {
                state.popup = 'none';
                state.advOpen = !state.advOpen;
                state.emitUI();
              }}
            />
            <PanelButton
              glyph="•••"
              active={
                state.popup === 'more' ||
                state.tool === 'selectRange' ||
                state.tool === 'lasso' ||
                state.tool === 'slideModify'
              }
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <PanelIconView kind="more" color={c} />}
              onClick={() => {
                state.popup = state.popup === 'more' ? 'none' : 'more';
                state.emitUI();
              }}
            />
            <div style={{ display: 'flex', width: '100%', height: pitch }}>
              <PanelButton
                glyph="↶"
                dimmed={state.undoCount === 0}
                disabled={state.undoCount === 0}
                iconScale={iconScale}
                pitch={pitch}
                flex
                onClick={() => state.undo()}
              />
              <PanelButton
                glyph="↷"
                dimmed={state.redoCount === 0}
                disabled={state.redoCount === 0}
                iconScale={iconScale}
                pitch={pitch}
                flex
                onClick={() => state.redo()}
              />
            </div>
          </>
        ) : state.metaOpen ? (
          <>
            <PanelButton
              glyph="←"
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <PanelIconView kind="back" color={c} />}
              onClick={() => state.closeMetaMenu()}
            />
            <PanelButton
              glyph="i"
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <InfoIcon color={c} />}
              onClick={() => state.openSidePanel('information')}
            />
            <PanelButton
              glyph="•••"
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <PanelIconView kind="more" color={c} />}
              onClick={() => {
                void state.shareMCZNow();
              }}
            />
            <PanelButton
              glyph="□"
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <ReviewIcon color={c} />}
              onClick={() => state.reviewChart()}
            />
            <PanelButton
              glyph="⏻"
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <PowerIcon color={c} />}
              onClick={() => state.quitEditor()}
            />
          </>
        ) : (
          <>
            <PanelButton
              glyph="✎"
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <PanelIconView kind="edit" color={c} />}
              onClick={() => state.setEditing(true)}
            />
            <PanelButton
              glyph="♩"
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <PanelIconView kind="bpm" color={c} />}
              onClick={() => state.openSidePanel('bpm')}
            />
            <PanelButton
              glyph="✦"
              iconScale={iconScale}
              pitch={pitch}
              onClick={() => state.openSidePanel('effect')}
            />
            <PanelButton
              glyph="≡"
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <PanelIconView kind="meta" color={c} />}
              onClick={() => state.openMetaMenu()}
            />
            <PanelButton
              glyph="⚙︎"
              iconScale={iconScale}
              pitch={pitch}
              renderIcon={(c) => <PanelIconView kind="setting" color={c} />}
              onClick={() => state.openSidePanel('setting')}
            />
          </>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Bottom 2 buttons: Speed & Divide */}
      <PanelButton
        glyph="⏱"
        iconScale={iconScale}
        pitch={pitch}
        renderIcon={(c) => <PanelIconView kind="speed" color={c} />}
        onClick={() => {
          state.popup = state.popup === 'speed' ? 'none' : 'speed';
          state.emitUI();
        }}
      />
      <PanelButton
        glyph="▤"
        iconScale={iconScale}
        pitch={pitch}
        renderIcon={(c) => <PanelIconView kind="divide" color={c} />}
        onClick={() => {
          state.popup = state.popup === 'divide' ? 'none' : 'divide';
          state.emitUI();
        }}
      />

      {/* Save status overlay right above the bottom 2 icons (EditorView.swift :: RightPanel) */}
      <div
        style={{
          position: 'absolute',
          left: 2,
          right: 2,
          bottom: edgeInset + pitch * RightPanelConstants.bottomCount + 1, // EditorView.swift :: RightPanel
          textAlign: 'center',
          fontSize: compact ? 12 : 9, // EditorView.swift :: RightPanel
          color: 'rgba(255, 255, 255, 0.55)', // EditorView.swift :: RightPanel
          pointerEvents: 'none',
          lineHeight: 1.1,
        }}
      >
        {state.saveStatus}
      </div>

      {/* Edit / Meta floating name column (EditorView.swift :: RightPanel.labelColumn) */}
      {(state.editing || state.metaOpen) && (
        <div
          key={`labels-${columnKey}`}
          className="panel-swap-in"
          style={{
            position: 'absolute',
            top: edgeInset,
            left: -RightPanelConstants.labelGap, // EditorView.swift :: RightPanel.labelGap (12.4pt)
            width: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            opacity: labelAlpha,
            transition: labelFadeTransition,
            pointerEvents: 'none',
          }}
        >
          {(state.editing ? editLabels : metaLabels).map((lbl, idx) => (
            <PanelEditLabel key={idx} text={lbl} fontBoost={fontBoost} pitch={pitch} />
          ))}
        </div>
      )}
    </div>
  );
};
