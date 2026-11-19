// SideWindow.swift :: SidePanelLayer / SideWindowShape / SideWindow / BPMWindowContent / EffectWindowContent
import React, { useEffect, useRef, useState } from 'react';
import { KeySound, NOTE_SOUND_OPTIONS } from '../audio/KeySound';
import { Beat, normalizeNumberInput } from '../core/Beat';
import { EffectKind, formatEffectValue } from '../core/ChartModel';
import { BACKGROUND_MAX_LONG_SIDE, prepareBackgroundImage } from '../core/ImageNormalize';
import {
  DesignScreen,
  NoteHeightConstants,
  SwiftColors,
  panelLabelFontCss,
} from '../state/EditorConstants';
import type { EditorState, SidePanel } from '../state/EditorState';
import { StorageManager } from './StorageManager';

const SIDE_WINDOW_WIDTH = 445.5; // SideWindow.swift :: SideWindow.width
const SIDE_WINDOW_WIDTH_MAX_RATIO = 0.62; // SideWindow.swift :: SidePanelLayer (size.width * 0.62)
const SIDE_WINDOW_TOP_RATIO = 23.4 / 820; // SideWindow.swift :: SideWindow.topRatio
const SIDE_WINDOW_BOTTOM_RATIO = 22.7 / 820; // SideWindow.swift :: SideWindow.bottomRatio
const SIDE_WINDOW_MIN_HEIGHT = 240; // SideWindow.swift :: SidePanelLayer (min height 240)
const SIDE_WINDOW_OPEN_DURATION_S = 0.16; // SideWindow.swift :: SideWindow.openAnimation
const SIDE_WINDOW_CLOSE_DURATION_S = 0.12; // SideWindow.swift :: SideWindow.closeAnimation
const SIDE_WINDOW_LEADING_PAD = 34; // SideWindow.swift :: SideWindow.leadingPad
const SIDE_WINDOW_TRAILING_PAD = 34; // SideWindow.swift :: SideWindow.trailingPad
const SIDE_WINDOW_FORM_TRAILING_EXTRA = 12; // SideWindow.swift :: SideWindow.formTrailingExtra

function sideWindowHitExtra(scale: number, compact: boolean): number {
  // SideWindow.swift :: SideWindow.hitExtra(scale:phoneCompact:)
  return Math.max(0, (DesignScreen.hitLength(44, scale, compact) - 44) / 2); // SideWindow.swift :: SideWindow.hitExtra (44pt)
}

function sideWindowFormSpacing(hitExtra: number): number {
  // SideWindow.swift :: SideWindow.formSpacing(hitExtra:)
  return Math.max(12, hitExtra * 2); // SideWindow.swift :: SideWindow.formSpacing (12pt)
}

const SideWindowShapeSvg: React.FC<{ width: number; height: number }> = ({ width, height }) => {
  // SideWindow.swift :: SideWindowShape + SideWindow.body
  const cham = 12; // SideWindow.swift :: SideWindowShape.cham
  const points = [
    `0,0`,
    `${width - cham},0`,
    `${width},${cham}`,
    `${width},${height - cham}`,
    `${width - cham},${height}`,
    `7.5,${height}`, // SideWindow.swift :: SideWindowShape (r.minX + 7.5)
    `7.5,99.75`, // SideWindow.swift :: SideWindowShape (r.minX + 7.5, r.minY + 99.75)
    `0,92.25`, // SideWindow.swift :: SideWindowShape (r.minX, r.minY + 92.25)
  ].join(' ');

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'block',
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      <polygon
        points={points}
        fill="rgba(0, 0, 0, 0.72)" // SideWindow.swift :: SideWindow.body (Color.black.opacity(0.72))
        stroke="rgba(255, 255, 255, 0.35)" // SideWindow.swift :: SideWindow.body (Color.white.opacity(0.35))
        strokeWidth={1} // SideWindow.swift :: SideWindow.body (lineWidth: 1)
      />
    </svg>
  );
};

const SideTitle: React.FC<{ text: string; fontBoost: number }> = ({ text, fontBoost }) => (
  // SideWindow.swift :: SideTitle
  <div
    style={{
      font: panelLabelFontCss(22, fontBoost), // SideWindow.swift :: SideTitle (PanelFont.label(22))
      color: '#ffffff',
      width: '100%',
      textAlign: 'left',
      paddingTop: 47, // SideWindow.swift :: SideTitle
      paddingBottom: 2, // SideWindow.swift :: SideTitle
      lineHeight: 1.2,
      flexShrink: 0,
    }}
  >
    {text}
  </div>
);

const SideListRow: React.FC<{
  selected: boolean;
  fontBoost: number;
  onClick: () => void;
  children: React.ReactNode;
}> = ({ selected, fontBoost, onClick, children }) => (
  // SideWindow.swift :: SideListRow
  <button
    type="button"
    onClick={onClick}
    style={{
      width: '100%',
      height: 31, // SideWindow.swift :: SideListRow
      minHeight: 31, // SideWindow.swift :: SideListRow
      paddingTop: 0,
      paddingBottom: 0,
      paddingRight: 0,
      paddingLeft: 16.5, // SideWindow.swift :: SideListRow
      border: 'none',
      backgroundColor: selected ? 'rgba(255, 255, 255, 0.41)' : 'transparent', // SideWindow.swift :: SideListRow
      color: selected ? '#ffffff' : SwiftColors.panelBlue, // SideWindow.swift :: SideListRow
      font: panelLabelFontCss(15, fontBoost), // SideWindow.swift :: SideListRow (PanelFont.label(15))
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-start',
      textAlign: 'left',
      cursor: 'pointer',
      boxSizing: 'border-box',
      flexShrink: 0,
    }}
  >
    {children}
  </button>
);

const SideFormRow: React.FC<{
  label: string;
  fontBoost: number;
  children: React.ReactNode;
}> = ({ label, fontBoost, children }) => (
  // SideWindow.swift :: SideFormRow
  <div
    style={{
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
    }}
  >
    <div
      style={{
        width: 70, // SideWindow.swift :: SideFormRow
        font: panelLabelFontCss(22, fontBoost), // SideWindow.swift :: SideFormRow (PanelFont.label(22))
        color: '#ffffff',
        textAlign: 'left',
        lineHeight: 1.2,
        flexShrink: 0,
      }}
    >
      {label}
    </div>
    <div style={{ flex: 1, minWidth: 0 }} />
    {children}
  </div>
);

const SideField: React.FC<{
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  fontBoost: number;
  hitExtra: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}> = ({ value, onChange, placeholder, fontBoost, hitExtra, inputMode }) => {
  // SideWindow.swift :: SideField
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        inputRef.current?.focus();
      }}
      style={{
        position: 'relative',
        width: 170, // SideWindow.swift :: SideField
        height: 44, // SideWindow.swift :: SideField
        paddingLeft: 6, // SideWindow.swift :: SideField
        paddingRight: 6, // SideWindow.swift :: SideField
        border: '2px solid #ffffff', // SideWindow.swift :: SideField (lineWidth: 2)
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'text',
        flexShrink: 0,
      }}
    >
      {hitExtra > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: -hitExtra,
            bottom: -hitExtra,
          }}
        />
      )}
      <input
        ref={inputRef}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: 0,
          margin: 0,
          textAlign: 'center',
          font: panelLabelFontCss(22, fontBoost), // SideWindow.swift :: SideField (PanelFont.label(22))
          color: '#ffffff',
          caretColor: '#ffffff',
        }}
      />
      {value.length === 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            font: panelLabelFontCss(18, fontBoost), // SideWindow.swift :: SideField (PanelFont.label(18))
            color: 'rgba(255, 255, 255, 0.3)', // SideWindow.swift :: SideField
            pointerEvents: 'none',
          }}
        >
          {placeholder}
        </div>
      )}
    </div>
  );
};

const SideButton: React.FC<{
  title: string;
  fontBoost: number;
  hitExtra: number;
  fullWidth?: boolean;
  onClick: () => void;
}> = ({ title, fontBoost, hitExtra, fullWidth = false, onClick }) => {
  // SideWindow.swift :: SideButton + SidePressStyle
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        position: 'relative',
        flex: fullWidth ? 'none' : 1,
        width: fullWidth ? '100%' : undefined,
        minHeight: 44, // SideWindow.swift :: SideButton
        paddingTop: 6, // SideWindow.swift :: SideButton
        paddingBottom: 6, // SideWindow.swift :: SideButton
        paddingLeft: 0,
        paddingRight: 0,
        border: '2px solid #ffffff', // SideWindow.swift :: SideButton (lineWidth: 2)
        background: 'transparent',
        color: '#ffffff',
        font: panelLabelFontCss(26, fontBoost), // SideWindow.swift :: SideButton (PanelFont.label(26))
        lineHeight: 1.1,
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        cursor: 'pointer',
        opacity: pressed ? 0.55 : 1, // SideWindow.swift :: SidePressStyle
        flexShrink: 0,
      }}
    >
      {hitExtra > 0 && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: -hitExtra,
            bottom: -hitExtra,
          }}
        />
      )}
      {title}
    </button>
  );
};

const SideSmallButton: React.FC<{
  title: string;
  fontBoost: number;
  hitExtra: number;
  onClick: () => void;
}> = ({ title, fontBoost, hitExtra, onClick }) => {
  // SideWindow.swift :: SideSmallButton + SidePressStyle
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        position: 'relative',
        height: 44, // SideWindow.swift :: SideSmallButton
        paddingLeft: 10, // SideWindow.swift :: SideSmallButton
        paddingRight: 10, // SideWindow.swift :: SideSmallButton
        paddingTop: 0,
        paddingBottom: 0,
        border: '1.5px solid rgba(255, 255, 255, 0.7)', // SideWindow.swift :: SideSmallButton
        background: 'transparent',
        color: '#ffffff',
        font: panelLabelFontCss(16, fontBoost), // SideWindow.swift :: SideSmallButton (PanelFont.label(16))
        lineHeight: 1.1,
        whiteSpace: 'nowrap',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        cursor: 'pointer',
        opacity: pressed ? 0.55 : 1, // SideWindow.swift :: SidePressStyle
        flexShrink: 0,
      }}
    >
      {hitExtra > 0 && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: -hitExtra,
            bottom: -hitExtra,
          }}
        />
      )}
      {title}
    </button>
  );
};

const SideChoice: React.FC<{
  title: string;
  selected: boolean;
  fontBoost: number;
  hitExtra: number;
  onClick: () => void;
}> = ({ title, selected, fontBoost, hitExtra, onClick }) => {
  // SideWindow.swift :: SideChoice + SidePressStyle
  const [pressed, setPressed] = useState(false);
  const fg = selected ? SwiftColors.panelBlue : '#ffffff'; // SideWindow.swift :: SideChoice

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        position: 'relative',
        flex: 1,
        height: 44, // SideWindow.swift :: SideChoice
        padding: 0,
        border: `2px solid ${fg}`, // SideWindow.swift :: SideChoice (lineWidth: 2)
        background: 'transparent',
        color: fg,
        font: panelLabelFontCss(22, fontBoost), // SideWindow.swift :: SideChoice (PanelFont.label(22))
        lineHeight: 1.1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        cursor: 'pointer',
        opacity: pressed ? 0.55 : 1, // SideWindow.swift :: SidePressStyle
      }}
    >
      {hitExtra > 0 && (
        <span
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: -hitExtra,
            bottom: -hitExtra,
          }}
        />
      )}
      {title}
    </button>
  );
};

const BPMWindowContent: React.FC<{
  state: EditorState;
  designScale: number;
  compact: boolean;
  fontBoost: number;
}> = ({ state, designScale, compact, fontBoost }) => {
  // SideWindow.swift :: BPMWindowContent
  const [selected, setSelected] = useState(0); // SideWindow.swift :: BPMWindowContent.selected
  const [beatText, setBeatText] = useState(() => state.snapBeat(state.currentBeat()).label); // SideWindow.swift :: BPMWindowContent.init
  const [bpmText, setBpmText] = useState(() => {
    const first = state.chart.times[0];
    return first ? first.bpm.toFixed(3) : ''; // SideWindow.swift :: BPMWindowContent.init ("%.3f")
  });

  const hitExtra = sideWindowHitExtra(designScale, compact);
  const formSpacing = sideWindowFormSpacing(hitExtra);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }}>
      <SideTitle text="BPM list" fontBoost={fontBoost} />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {state.chart.times.map((entry, idx) => (
            <SideListRow
              key={`${entry.beat.label}-${idx}`}
              selected={idx === selected}
              fontBoost={fontBoost}
              onClick={() => {
                setSelected(idx);
                setBeatText(entry.beat.label);
                setBpmText(entry.bpm.toFixed(3));
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <span
                  style={{
                    width: 57, // SideWindow.swift :: BPMWindowContent
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {entry.beat.label}
                </span>
                <span style={{ flex: 1, textAlign: 'center' }}>{entry.bpm.toFixed(3)}</span>
              </div>
            </SideListRow>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: formSpacing,
          paddingRight: SIDE_WINDOW_FORM_TRAILING_EXTRA, // SideWindow.swift :: SideWindow.formTrailingExtra (12)
          paddingTop: 10, // SideWindow.swift :: BPMWindowContent
          paddingBottom: 35, // SideWindow.swift :: BPMWindowContent (35 when not compact keyboard)
          flexShrink: 0,
        }}
      >
        <SideFormRow label="Beat" fontBoost={fontBoost}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}> {/* SideWindow.swift :: BPMWindowContent (spacing: 8) */}
            <SideSmallButton
              title="現在位置"
              fontBoost={fontBoost}
              hitExtra={hitExtra}
              onClick={() => setBeatText(state.snapBeat(state.currentBeat()).label)}
            />
            <SideField
              value={beatText}
              onChange={setBeatText}
              placeholder="8:0/4"
              fontBoost={fontBoost}
              hitExtra={hitExtra}
            />
          </div>
        </SideFormRow>

        <SideFormRow label="BPM" fontBoost={fontBoost}>
          <SideField
            value={bpmText}
            onChange={setBpmText}
            placeholder="132"
            fontBoost={fontBoost}
            hitExtra={hitExtra}
            inputMode="decimal"
          />
        </SideFormRow>

        <div
          style={{
            display: 'flex',
            gap: 24, // SideWindow.swift :: BPMWindowContent (spacing: 24)
            paddingTop: 52, // SideWindow.swift :: BPMWindowContent (compact ? 0 : 52)
          }}
        >
          <SideButton
            title="Add"
            fontBoost={fontBoost}
            hitExtra={hitExtra}
            onClick={() => {
              const b = Beat.parse(beatText);
              const t = normalizeNumberInput(bpmText);
              const v = t.length > 0 ? Number(t) : NaN;
              if (b && Number.isFinite(v)) {
                state.addOrReplaceBPM(b, v);
              } else {
                state.showToast('Beat か BPM の形式が不正です');
              }
            }}
          />
          <SideButton
            title="Remove"
            fontBoost={fontBoost}
            hitExtra={hitExtra}
            onClick={() => {
              state.removeBPM(selected);
              setSelected(0); // SideWindow.swift :: BPMWindowContent
            }}
          />
        </div>
      </div>
    </div>
  );
};

const EffectWindowContent: React.FC<{
  state: EditorState;
  designScale: number;
  compact: boolean;
  fontBoost: number;
}> = ({ state, designScale, compact, fontBoost }) => {
  // SideWindow.swift :: EffectWindowContent
  const [selected, setSelected] = useState(-1); // SideWindow.swift :: EffectWindowContent.selected
  const [beatText, setBeatText] = useState(() => state.snapBeat(state.currentBeat()).label); // SideWindow.swift :: EffectWindowContent.init
  const [kind, setKind] = useState<EffectKind>('scroll'); // SideWindow.swift :: EffectWindowContent.kind
  const [valueText, setValueText] = useState('1'); // SideWindow.swift :: EffectWindowContent.valueText

  const hitExtra = sideWindowHitExtra(designScale, compact);
  const formSpacing = sideWindowFormSpacing(hitExtra);
  const effects = state.chart.effects;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }}>
      <SideTitle text="Effect list" fontBoost={fontBoost} />

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', width: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {effects.length === 0 && (
            <div
              style={{
                font: panelLabelFontCss(15, fontBoost), // SideWindow.swift :: EffectWindowContent (PanelFont.label(15))
                color: 'rgba(255, 255, 255, 0.5)', // SideWindow.swift :: EffectWindowContent
                paddingLeft: 16.5, // SideWindow.swift :: EffectWindowContent
                height: 31, // SideWindow.swift :: EffectWindowContent
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
              }}
            >
              effect はまだありません
            </div>
          )}
          {effects.map((e, i) => (
            <SideListRow
              key={`${e.beat.label}-${e.kind}-${i}`}
              selected={i === selected}
              fontBoost={fontBoost}
              onClick={() => {
                setSelected(i);
                setBeatText(e.beat.label);
                setKind(e.kind);
                setValueText(formatEffectValue(e.value));
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                <span
                  style={{
                    width: 100, // SideWindow.swift :: EffectWindowContent
                    textAlign: 'left',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  {e.beat.label}
                </span>
                <span
                  style={{
                    width: 70, // SideWindow.swift :: EffectWindowContent
                    textAlign: 'left',
                    flexShrink: 0,
                  }}
                >
                  {e.kind}
                </span>
                <span
                  style={{
                    flex: 1,
                    textAlign: 'right',
                    paddingRight: 16.5, // SideWindow.swift :: EffectWindowContent
                  }}
                >
                  {formatEffectValue(e.value)}
                </span>
              </div>
            </SideListRow>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: formSpacing,
          paddingRight: SIDE_WINDOW_FORM_TRAILING_EXTRA, // SideWindow.swift :: SideWindow.formTrailingExtra (12)
          paddingTop: 10, // SideWindow.swift :: EffectWindowContent
          paddingBottom: 35, // SideWindow.swift :: EffectWindowContent (35 when not compact keyboard)
          flexShrink: 0,
        }}
      >
        <SideFormRow label="Beat" fontBoost={fontBoost}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}> {/* SideWindow.swift :: EffectWindowContent (spacing: 8) */}
            <SideSmallButton
              title="現在位置"
              fontBoost={fontBoost}
              hitExtra={hitExtra}
              onClick={() => setBeatText(state.snapBeat(state.currentBeat()).label)}
            />
            <SideField
              value={beatText}
              onChange={setBeatText}
              placeholder="8:0/4"
              fontBoost={fontBoost}
              hitExtra={hitExtra}
            />
          </div>
        </SideFormRow>

        <div style={{ display: 'flex', gap: 24 }}> {/* SideWindow.swift :: EffectWindowContent (spacing: 24) */}
          <SideChoice
            title="scroll"
            selected={kind === 'scroll'}
            fontBoost={fontBoost}
            hitExtra={hitExtra}
            onClick={() => setKind('scroll')}
          />
          <SideChoice
            title="jump"
            selected={kind === 'jump'}
            fontBoost={fontBoost}
            hitExtra={hitExtra}
            onClick={() => setKind('jump')}
          />
        </div>

        <SideFormRow label="Value" fontBoost={fontBoost}>
          <SideField
            value={valueText}
            onChange={setValueText}
            placeholder={kind === 'scroll' ? '0.5 / -1' : '10000000'}
            fontBoost={fontBoost}
            hitExtra={hitExtra}
          />
        </SideFormRow>

        <div
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: 11 * state.smallTextBoost, // SideWindow.swift :: EffectWindowContent (11 * state.smallTextBoost)
            color: 'rgba(255, 255, 255, 0.55)', // SideWindow.swift :: EffectWindowContent
            lineHeight: 1.35,
            textAlign: 'left',
          }}
        >
          {kind === 'scroll'
            ? 'scroll: その拍から、譜面の流れる速さが 値 倍になります (1 = 普通 / 0 = 止まる / マイナス = 逆走)。'
            : 'jump: その拍になった瞬間、譜面が先へ一気に飛びます。値は ms で、1000 = 1 秒間に進む距離ぶん (そのときの scroll の値に比例: scroll 0 なら飛ばず、2 なら 2 倍飛びます)。'}
        </div>

        <div style={{ display: 'flex', gap: 24 }}> {/* SideWindow.swift :: EffectWindowContent (spacing: 24) */}
          <SideButton
            title="Add"
            fontBoost={fontBoost}
            hitExtra={hitExtra}
            onClick={() => {
              const text = normalizeNumberInput(valueText);
              const b = Beat.parse(beatText);
              const v = text.length > 0 ? Number(text) : NaN;
              if (b && Number.isFinite(v)) {
                state.addOrReplaceEffect(b, kind, v);
                const i = state.chart.effects.findIndex((e) => e.beat.equals(b) && e.kind === kind);
                if (i >= 0) setSelected(i);
              } else {
                state.showToast('Beat か 値の形式が不正です');
              }
            }}
          />
          <SideButton
            title="Remove"
            fontBoost={fontBoost}
            hitExtra={hitExtra}
            onClick={() => {
              if (selected >= 0 && selected < state.chart.effects.length) {
                state.removeEffect(selected);
                setSelected(-1);
              } else {
                state.showToast('消す effect を一覧から選んでください');
              }
            }}
          />
        </div>
      </div>
    </div>
  );
};

// MARK: - Information (META -> Information) (SideWindow.swift :: SideWideField / InformationWindowContent)

const SideWideField: React.FC<{
  value: string;
  onChange: (next: string) => void;
  fontBoost: number;
  isFileName?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  flex?: boolean;
}> = ({ value, onChange, fontBoost, isFileName = false, inputMode, flex = false }) => {
  // SideWindow.swift :: SideWideField
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        inputRef.current?.focus();
      }}
      style={{
        width: flex ? undefined : '100%',
        flex: flex ? 1 : undefined,
        minWidth: 0,
        height: 44, // SideWindow.swift :: SideWideField (.frame(height: 44))
        paddingLeft: 12, // SideWindow.swift :: SideWideField (.padding(.horizontal, 12))
        paddingRight: 12, // SideWindow.swift :: SideWideField (.padding(.horizontal, 12))
        border: '2px solid #ffffff', // SideWindow.swift :: SideWideField (lineWidth: 2)
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        cursor: 'text',
      }}
    >
      <input
        ref={inputRef}
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize={isFileName ? 'none' : 'sentences'}
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          padding: 0,
          margin: 0,
          textAlign: 'left', // SideWindow.swift :: SideWideField (.multilineTextAlignment(.leading))
          font: panelLabelFontCss(22, fontBoost), // SideWindow.swift :: SideWideField (PanelFont.label(22))
          color: '#ffffff',
          caretColor: '#ffffff',
        }}
      />
    </div>
  );
};

const InformationWindowContent: React.FC<{
  state: EditorState;
  fontBoost: number;
}> = ({ state, fontBoost }) => {
  // SideWindow.swift :: InformationWindowContent
  const [offsetText, setOffsetText] = useState(() => String(state.chart.offsetMs));
  const [soundText, setSoundText] = useState(() => {
    const sound = state.chart.soundFile;
    return sound ? sound : state.oggFileName;
  });
  const [backgroundText, setBackgroundText] = useState(() => {
    const bg = state.chart.metaString(['background']);
    return bg ? bg : state.bgFileName;
  });
  const [photoBtnPressed, setPhotoBtnPressed] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const labeled = (label: string, content: React.ReactNode) => (
    // SideWindow.swift :: InformationWindowContent.labeled
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6, // SideWindow.swift :: labeled VStack(spacing: 6)
        paddingBottom: 13, // SideWindow.swift :: labeled (.padding(.bottom, 13))
        width: '100%',
      }}
    >
      <div
        style={{
          font: panelLabelFontCss(22, fontBoost), // SideWindow.swift :: labeled (PanelFont.label(22))
          color: '#ffffff',
          width: '100%',
          height: 26, // SideWindow.swift :: labeled (.frame(height: 26))
          display: 'flex',
          alignItems: 'center',
          textAlign: 'left',
          lineHeight: 1.1,
        }}
      >
        {label}
      </div>
      {content}
    </div>
  );

  const updateMeta = (path: string[], value: string) => {
    state.chart.setMetaString(path, value);
    state.metaChanged();
  };

  const nudgeOffset = (delta: number) => {
    // SideWindow.swift :: InformationWindowContent.nudgeOffset(_:)
    const next = state.chart.offsetMs + delta;
    setOffsetText(String(next));
    state.setOffset(next);
  };

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        width: '100%',
        overflowY: 'auto',
        touchAction: 'pan-y',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          paddingTop: 14, // SideWindow.swift :: InformationWindowContent (.padding(.top, 14))
          paddingBottom: 35, // SideWindow.swift :: InformationWindowContent (.padding(.bottom, 35))
          width: '100%',
        }}
      >
        {labeled(
          '曲名',
          <SideWideField
            value={state.chart.metaString(['song', 'title'])}
            onChange={(v) => updateMeta(['song', 'title'], v)}
            fontBoost={fontBoost}
          />
        )}
        {labeled(
          'Original Title',
          <SideWideField
            value={state.chart.metaString(['song', 'titleorg'])}
            onChange={(v) => updateMeta(['song', 'titleorg'], v)}
            fontBoost={fontBoost}
          />
        )}
        {labeled(
          'アーティスト',
          <SideWideField
            value={state.chart.metaString(['song', 'artist'])}
            onChange={(v) => updateMeta(['song', 'artist'], v)}
            fontBoost={fontBoost}
          />
        )}
        {labeled(
          'Original Artist',
          <SideWideField
            value={state.chart.metaString(['song', 'artistorg'])}
            onChange={(v) => updateMeta(['song', 'artistorg'], v)}
            fontBoost={fontBoost}
          />
        )}
        {labeled(
          'Version',
          <SideWideField
            value={state.chart.metaString(['version'])}
            onChange={(v) => updateMeta(['version'], v)}
            fontBoost={fontBoost}
          />
        )}
        {labeled(
          'Creator',
          <SideWideField
            value={state.chart.metaString(['creator'])}
            onChange={(v) => updateMeta(['creator'], v)}
            fontBoost={fontBoost}
          />
        )}
        {labeled(
          '曲のファイル',
          <SideWideField
            value={soundText}
            isFileName
            onChange={(text) => {
              setSoundText(text);
              if (text === state.chart.soundFile) return;
              if (text.length === 0 && state.chart.soundEntries.length === 0) return;
              state.chart.soundFile = text;
              state.metaChanged();
            }}
            fontBoost={fontBoost}
          />
        )}
        {labeled(
          '背景ファイル',
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
            <SideWideField
              value={backgroundText}
              isFileName
              onChange={(text) => {
                setBackgroundText(text);
                if (text === state.chart.metaString(['background'])) return;
                state.chart.setMetaString(['background'], text);
                state.metaChanged();
              }}
              fontBoost={fontBoost}
            />
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              style={{ display: 'none' }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file || photoBusy) return;
                setPhotoBusy(true);
                void (async () => {
                  try {
                    const buf = await file.arrayBuffer();
                    const prepared = await prepareBackgroundImage(new Uint8Array(buf), {
                      fileName: file.name,
                      mimeType: file.type,
                      forceJpeg: true,
                      maxLongSide: BACKGROUND_MAX_LONG_SIDE,
                    });
                    if (!mountedRef.current) return;
                    const name = state.applyBackground(prepared.bytes, prepared.fileName);
                    if (name !== null) setBackgroundText(name);
                  } catch {
                    if (mountedRef.current) {
                      state.showToast('写真を読み込めませんでした');
                    }
                  } finally {
                    if (mountedRef.current) {
                      setPhotoBusy(false);
                    }
                  }
                })();
              }}
            />
            {/* SideWindow.swift :: InformationWindowContent.photoButton */}
            <button
              type="button"
              disabled={photoBusy}
              onClick={(e) => {
                e.stopPropagation();
                if (!photoBusy) photoInputRef.current?.click();
              }}
              onPointerDown={() => setPhotoBtnPressed(true)}
              onPointerUp={() => setPhotoBtnPressed(false)}
              onPointerLeave={() => setPhotoBtnPressed(false)}
              onPointerCancel={() => setPhotoBtnPressed(false)}
              style={{
                width: '100%',
                height: 44, // SideWindow.swift :: photoButton (.frame(height: 44))
                border: '2px solid #ffffff', // SideWindow.swift :: photoButton (lineWidth: 2)
                background: 'transparent',
                color: '#ffffff',
                font: panelLabelFontCss(22, fontBoost), // SideWindow.swift :: photoButton (PanelFont.label(22))
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxSizing: 'border-box',
                cursor: photoBusy ? 'default' : 'pointer',
                opacity: photoBtnPressed || photoBusy ? 0.55 : 1, // SideWindow.swift :: SidePressStyle
              }}
            >
              写真から読み込む
            </button>
          </div>
        )}
        {labeled(
          'オフセット (ms)',
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
            <SideWideField
              value={offsetText}
              flex
              onChange={(text) => {
                setOffsetText(text);
                const t = normalizeNumberInput(text).trim();
                if (/^[+-]?\d+$/.test(t)) {
                  const v = Number.parseInt(t, 10);
                  if (Number.isSafeInteger(v) && v !== state.chart.offsetMs) {
                    state.setOffset(v);
                  }
                }
              }}
              fontBoost={fontBoost}
            />
            <SideSmallButton
              title="-10"
              fontBoost={fontBoost}
              hitExtra={0}
              onClick={() => nudgeOffset(-10)}
            />
            <SideSmallButton
              title="+10"
              fontBoost={fontBoost}
              hitExtra={0}
              onClick={() => nudgeOffset(10)}
            />
          </div>
        )}
        {/* SideWindow.swift :: InformationWindowContent.audioInfo */}
        <div
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: 11 * state.smallTextBoost,
            color: 'rgba(255, 255, 255, 0.55)',
            lineHeight: 1.35,
            textAlign: 'left',
            width: '100%',
          }}
        >
          {state.song
            ? `音源読込: ${state.song.info} / 長さ ${state.timeString(state.song.duration)}`
            : '音源なし (無音で編集中)'}
        </div>
      </div>
    </div>
  );
};

// MARK: - SETTING (non-audio settings, persisted in browser localStorage) (SideWindow.swift :: SideDivider / SettingWindowContent)

const SideDivider: React.FC = () => (
  // SideWindow.swift :: SideDivider
  <div
    style={{
      width: '100%',
      height: 1, // SideWindow.swift :: SideDivider (.frame(height: 1))
      backgroundColor: 'rgba(255, 255, 255, 0.25)', // SideWindow.swift :: SideDivider (Color.white.opacity(0.25))
      flexShrink: 0,
    }}
  />
);

const SettingWindowContent: React.FC<{
  state: EditorState;
  fontBoost: number;
}> = ({ state, fontBoost }) => {
  // SideWindow.swift :: SettingWindowContent (non-audio items)
  const percent = (v: number) => `${Math.round(v * 100)}%`; // SideWindow.swift :: SettingWindowContent.percent

  const noteText = (text: string) => (
    // SideWindow.swift :: SettingWindowContent.note
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 11 * state.smallTextBoost, // SideWindow.swift :: SettingWindowContent.note (11 * state.smallTextBoost)
        color: 'rgba(255, 255, 255, 0.55)', // SideWindow.swift :: SettingWindowContent.note (Color.white.opacity(0.55))
        lineHeight: 1.35,
        textAlign: 'left',
        width: '100%',
      }}
    >
      {text}
    </div>
  );

  const sliderRow = (
    title: string,
    valueText: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onChange: (next: number) => void,
    onEditingEnd?: () => void
  ) => (
    // SideWindow.swift :: SettingWindowContent.sliderRow
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: 8 }}>
        <span
          style={{
            font: panelLabelFontCss(21, fontBoost), // SideWindow.swift :: sliderRow (PanelFont.label(21))
            color: '#ffffff',
            textAlign: 'left',
            lineHeight: 1.2,
          }}
        >
          {title}
        </span>
        <div style={{ flex: 1, minWidth: 8 }} />
        <span
          style={{
            font: panelLabelFontCss(21, fontBoost), // SideWindow.swift :: sliderRow (PanelFont.label(21))
            color: SwiftColors.panelBlue, // SideWindow.swift :: sliderRow (Color.panelBlue)
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
          }}
        >
          {valueText}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (!onEditingEnd) return;
          const finish = () => {
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            onEditingEnd();
          };
          window.addEventListener('pointerup', finish, { once: true });
          window.addEventListener('pointercancel', finish, { once: true });
        }}
        onKeyUp={(e) => {
          if (
            onEditingEnd &&
            (e.key === 'ArrowLeft' ||
              e.key === 'ArrowRight' ||
              e.key === 'ArrowUp' ||
              e.key === 'ArrowDown' ||
              e.key === 'Home' ||
              e.key === 'End')
          ) {
            onEditingEnd();
          }
        }}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          accentColor: SwiftColors.panelBlue, // SideWindow.swift :: sliderRow (.tint(Color.panelBlue))
          cursor: 'pointer',
          margin: 0,
          touchAction: 'none',
        }}
      />
    </div>
  );

  const choiceRow = <T extends string>(
    title: string,
    options: readonly { id: T; label: string }[],
    selected: T,
    onSelect: (id: T) => void
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <span
        style={{
          font: panelLabelFontCss(21, fontBoost), // sliderRow のタイトルと同じ
          color: '#ffffff',
          textAlign: 'left',
          lineHeight: 1.2,
        }}
      >
        {title}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}>
        {options.map((o) => {
          const isOn = o.id === selected;
          return (
            <button
              key={o.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(o.id);
              }}
              style={{
                flex: '1 1 calc(50% - 4px)',
                minWidth: 0,
                minHeight: 40,
                background: 'transparent',
                border: `2px solid ${isOn ? SwiftColors.panelBlue : '#ffffff'}`, // checkRow と同じ配色
                boxSizing: 'border-box',
                padding: '0 8px',
                cursor: 'pointer',
                font: panelLabelFontCss(18, fontBoost),
                color: isOn ? SwiftColors.panelBlue : '#ffffff',
                lineHeight: 1.2,
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const checkRow = (title: string, description: string | undefined, isOn: boolean, onToggle: () => void) => (
    // SideWindow.swift :: SettingWindowContent.checkRow
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        style={{
          width: '100%',
          minHeight: 36, // SideWindow.swift :: checkRow (.frame(minHeight: 36))
          background: 'transparent',
          border: 'none',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 12, // SideWindow.swift :: checkRow HStack(spacing: 12)
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            width: 28, // SideWindow.swift :: checkRow (.frame(width: 28, height: 28))
            height: 28,
            border: `2px solid ${isOn ? SwiftColors.panelBlue : '#ffffff'}`, // SideWindow.swift :: checkRow (lineWidth: 2)
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isOn && (
            <svg width={18} height={18} viewBox="0 0 18 18" style={{ display: 'block' }}>
              <polyline
                points="3.5,9.5 7.5,13.5 14.5,4.5"
                fill="none"
                stroke={SwiftColors.panelBlue}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
        <span
          style={{
            font: panelLabelFontCss(18, fontBoost), // SideWindow.swift :: checkRow (PanelFont.label(18))
            color: '#ffffff',
            textAlign: 'left',
            lineHeight: 1.25,
            flex: 1,
          }}
        >
          {title}
        </span>
      </button>
      {description ? noteText(description) : null}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }}>
      <SideTitle text="SETTING" fontBoost={fontBoost} />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          touchAction: 'pan-y',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 16, // SideWindow.swift :: SettingWindowContent VStack(spacing: 16)
            paddingTop: 8, // SideWindow.swift :: SettingWindowContent (.padding(.top, 8))
            paddingBottom: 35, // SideWindow.swift :: SettingWindowContent (.padding(.bottom, 35))
            width: '100%',
          }}
        >
          {/* SideWindow.swift :: SettingWindowContent.volumeRows */}
          {sliderRow(
            '曲の音量',
            percent(state.musicVolume),
            state.musicVolume,
            0,
            1,
            0.05,
            (v) => {
              state.musicVolume = v;
            }
          )}

          {sliderRow(
            'ノーツサウンドの音量',
            percent(state.noteVolume),
            state.noteVolume,
            0,
            1,
            0.05,
            (v) => {
              state.noteVolume = v;
            },
            () => {
              // 指を離した時に1回鳴らして、音量を確かめられるようにする (SideWindow.swift :: volumeRows)
              void KeySound.shared.preview();
            }
          )}

          {choiceRow(
            'ノーツサウンドの種類',
            NOTE_SOUND_OPTIONS,
            state.noteSound,
            (id) => {
              state.noteSound = id;
              void KeySound.shared.preview(); // 選んだ音を1回鳴らして確かめられるようにする
            }
          )}

          {noteText(
            'ノーツサウンドは、再生中にノーツが再生ラインに触れる瞬間と、テストプレイで叩いた瞬間に鳴ります。0% で消せます。'
          )}

          <SideDivider />

          {state.bgUrl !== null && (
            <>
              {sliderRow(
                '背景画像の暗さ',
                percent(state.bgDim),
                state.bgDim,
                0,
                0.95,
                0.05,
                (v) => {
                  state.bgDim = v;
                }
              )}
              <SideDivider />
            </>
          )}

          {/* SideWindow.swift :: SettingWindowContent.checkRows */}
          {checkRow(
            '立ち上がりをはっきりさせる (伸ばす窓を小さく)',
            '伸ばした音の、ドラムなどの出だしのにじみが約半分になります (0.1倍で前46ms・後74ms → 前26ms・後36ms)。そのかわり 60Hz付近の低音が少しゆらぎます。次の再生から変わります。',
            state.sharpStretch,
            () => {
              state.sharpStretch = !state.sharpStretch;
            }
          )}

          <SideDivider />

          {checkRow(
            'beatが時系列順でないsegを置くのを許可する',
            'オフのとき (初期値): 直前に置いた seg (終点) より前の時間には、seg を置けません。Slide ツールでは、そこをタップすると「完」と同じく配置を終えます。Slide modify では、そこをタップすると選択が外れます。seg を縦にドラッグしても、前後の seg の時間を越えません。オンにすると、時間を行ったり来たりする seg や、始点より前 (beat がマイナス) の seg も置けます。',
            state.allowUnorderedSeg,
            () => {
              state.allowUnorderedSeg = !state.allowUnorderedSeg;
            }
          )}

          <SideDivider />

          {checkRow(
            'slide modifyでのsegの移動で縦方向の移動を許可する',
            'オフのとき (初期値): Slide modify で seg を動かしても、横 (x) にだけ動きます。時間 (拍) は変わりません。オンにすると、縦にも動かせます (1/n 拍に吸着)。',
            state.allowSegVerticalMove,
            () => {
              state.allowSegVerticalMove = !state.allowSegVerticalMove;
            }
          )}

          <SideDivider />

          {checkRow(
            'grid alignがオンの時、グリッド上に常にノーツの中心を合わせる',
            'オンのとき (初期値・本家と同じ): ノーツを動かすと、動かした先でいちばん近いグリッド線に中心が吸着します。置いたときと同じ座標になるので、グリッドに乗っていないノーツを動かして、置いたノーツに重ねても中心が必ずそろいます。スライドは始点と各 seg の中心がそれぞれ吸着します。オフにすると、動かす前の位置から「グリッド1マスの整数倍」だけずらす固定変位になります。',
            state.gridCenterAlign,
            () => {
              state.gridCenterAlign = !state.gridCenterAlign;
            }
          )}

          <SideDivider />

          {checkRow(
            '既存のノーツを再スナップする',
            'オフのとき (初期値): 選択したノーツを上下 (時間軸方向) に動かすと、指の移動量を 1/n 拍 (LFB) の整数倍に丸めた量だけ、いまの拍からずらします。もともとの LFB からのズレはそのまま保存されます。たとえば LFB を 24 にして 1 マス上へ → 32 に変えて 1 マス下へ戻すと、1/24 − 1/32 = 1/96 拍のズレのノーツを作れます (本家 Malody の手法)。オンにすると、動かした先でいちばん近い LFB の線に吸着します (以前の動き。ズレは消えます)。',
            state.resnapExistingNotes,
            () => {
              state.resnapExistingNotes = !state.resnapExistingNotes;
            }
          )}

          <SideDivider />

          {checkRow(
            'time rangeを用いたコピペで始点beatから最初のノーツまでの長さを保存する',
            'オフのとき (初期値): Copy は、いちばん前のノーツの拍を基準にします。Paste すると、そのノーツが再生ラインの位置 (LFB の線) に来るので、もとのノーツが LFB に乗っていなくても、貼り付けた先ではズレが消えます。オンにすると、Time range の範囲が出ている間の Copy は、範囲の始点の拍を基準にします。Paste すると範囲の始点が再生ラインに来て、始点から最初のノーツまでの縦のズレ (たとえば 25:273/18392 の 273/18392 拍ぶん) もそのまま保たれます。再生ラインを範囲の始点に合わせて貼ると、もとのノーツと同じ拍に重なります (同時押し用)。Time range を抜けたあとの Copy は、この設定がオンでも最初のノーツが基準です。',
            state.copyKeepsRangeOffset,
            () => {
              state.copyKeepsRangeOffset = !state.copyKeepsRangeOffset;
            }
          )}

          <SideDivider />

          {checkRow(
            'レーンからノーツをはみ出せる',
            'オフのとき (初期値): ノーツの端がレーンの外枠から出ないようになります。置く・動かす・幅を変える・seg を置く / 動かすのすべてが対象です。Grid align がオンのときも、端が外枠を越えるグリッド線には中心を合わせず、端が外枠ぴったりになる位置に止まります (端が収まるときは、今までどおり中心がグリッド線に合います)。オンにすると、ノーツの中心がレーンの中にあればよく、端は外へはみ出せます (以前の動き)。プラグインが置くノーツや、すでにはみ出している譜面は変わりません。',
            state.allowNoteOverflow,
            () => {
              state.allowNoteOverflow = !state.allowNoteOverflow;
            }
          )}

          <SideDivider />

          {checkRow(
            '現在位置を分割(LFB)の線にスナップする',
            'オンのとき (初期値): レーン・左の帯・シークバーを動かすと、再生ラインの位置が、いつも分割 (1/n 拍) の線の上で止まります。線から線へ動かして、時刻表示の差を見れば、分割 1 マスが何 ms かが分かります (分割 1/1 なら 1 拍が何 ms か)。再生を止めた位置と、「この拍へ飛ぶ」操作の位置は、そのままです。オフにすると、指の動きに合わせて線の間にも止まります。',
            state.snapViewToLFB,
            () => {
              state.snapViewToLFB = !state.snapViewToLFB;
            }
          )}

          <SideDivider />

          {checkRow(
            '曲の長さ計算と移動範囲を正常範囲 (0〜曲長+60秒) に制限する',
            'オンのとき (初期値・元の仕様): 曲の長さ (totalSec / maxBeat) の計算から「曲の長さ + 60秒」(音源なし時は3時間) を超える点のノーツ・seg を除外し、再生ラインの移動範囲を 0 〜 maxBeat、シークバー密度棒を 0 〜 totalSec に制限します (手動配置の beat < 0 も禁止)。オフにすると、範囲外のノーツ・seg も含めて曲の長さ・スクロール範囲・密度棒を計算し、マイナス拍への移動・配置も許可します。',
            state.clampChartRange,
            () => {
              state.clampChartRange = !state.clampChartRange;
            }
          )}

          <SideDivider />

          {/* SideWindow.swift :: SettingWindowContent.holdRow */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            {sliderRow(
              '長押しで選択解除',
              `${state.holdDeselectSec.toFixed(1)} 秒`,
              state.holdDeselectSec,
              1.0,
              5.0,
              0.1,
              (v) => {
                state.holdDeselectSec = v;
              }
            )}
            {noteText(
              '編集ツールを選んでいないとき、レーンを動かさずに押し続けると、選択中のノーツが全部解除されます。'
            )}
          </div>

          <SideDivider />

          {/* SideWindow.swift :: SettingWindowContent.touchEffectRow */}
          {checkRow(
            'タッチエフェクト',
            'オンにすると、画面に触れた所に白い輪が広がって消え、触れている間は赤い半透明の丸が指についてきます (テストプレイと同じ見た目)。レーン・左の帯・シークバー・右のボタンなど、エディタのどこを触っても出ます。操作の邪魔はしません。',
            state.touchEffect,
            () => {
              state.touchEffect = !state.touchEffect;
            }
          )}

          <SideDivider />

          {checkRow(
            '波形を表示',
            undefined,
            state.showWaveform,
            () => {
              state.showWaveform = !state.showWaveform;
            }
          )}

          <SideDivider />

          {checkRow(
            'スペクトログラムを表示',
            undefined,
            state.showSpectrogram,
            () => {
              state.showSpectrogram = !state.showSpectrogram;
            }
          )}

          <SideDivider />

          {/* 描画の細かさ (Web版: スマホで重いときに下げる) */}
          {sliderRow(
            '描画の細かさ',
            `${state.renderDprCap.toFixed(2)}倍`,
            state.renderDprCap,
            1.0,
            3.0,
            0.25,
            (v) => {
              state.renderDprCap = v;
            }
          )}
          {noteText(
            'レーンや帯を描く細かさの上限です (初期値 1.00倍)。数字を下げると、少し粗くなる代わりに描画がかなり軽くなります。ノーツが多い所でフリーズする・反応が遅いときは 1.00〜1.50倍 にしてください。端末が持っている倍率より大きくはなりません。'
          )}

          <SideDivider />

          {/* ノーツの縦幅 (見た目と当たり判定) */}
          {sliderRow(
            'ノーツの縦幅',
            percent(state.noteHeightScale),
            state.noteHeightScale,
            NoteHeightConstants.min,
            NoteHeightConstants.max,
            NoteHeightConstants.step,
            (v) => {
              state.noteHeightScale = v;
            }
          )}
          {noteText(
            'タップとワイプの縦の太さを、見た目と当たり判定の両方で変えます。100% が今までの大きさで、240% まで伸ばせます。スマホで細くて触りにくいときに大きくしてください。スライドのノーツは変わりません。'
          )}

          <SideDivider />

          {/* SideWindow.swift :: SettingWindowContent.textSizeRows */}
          {sliderRow(
            '小さい文字の大きさ',
            percent(state.smallTextScale),
            state.smallTextScale,
            1.0,
            3.0,
            0.05,
            (v) => {
              state.smallTextScale = v;
            }
          )}
          {noteText(
            'SETTING の説明文や Adv. メニューの文字など、小さく書かれた文字の拡大率です (iPhone 表示のときだけ効きます)。100% 〜 300% まで変えられます。'
          )}

          <SideDivider />

          {sliderRow(
            'メニューの文字の大きさ',
            percent(state.menuScale),
            state.menuScale,
            1.0,
            2.0,
            0.05,
            (v) => {
              state.menuScale = v;
            }
          )}
          {noteText(
            'LFB (分割)・再生速度のメニューと、EDIT の More (•••) のメニューの大きさです。文字に合わせて、アイコンと枠も同じ倍率で大きくなります (iPad でも iPhone でも効きます)。100% 〜 200% まで。メニューが画面の縦からはみ出さないよう、項目の多い LFB (分割) は 150% 付近が上限になります。'
          )}

          <SideDivider />

          {/* SideWindow.swift :: SettingWindowContent.uiAdjustRow */}
          {checkRow(
            'UI調整モード',
            'オンにすると、譜面の編集や再生はできなくなり、画面構成だけを編集するモードになります。左の帯の右端を右へドラッグすると帯の幅が広がり、ズーム (−/＋) と FX のボタンも大きくなります (FX は、ノッチ / ダイナミックアイランドに掛かるときは、それを跨いで下へ移ります)。右メニューの左端を左へドラッグすると、右メニューのアイコンが大きくなります。縦に収まらなくなったり、アイコン同士の間隔が今より狭くなる大きさにはなりません (EDIT 中はアイコンが多いので、あまり大きくなりません)。画面の「完了」で、もとの画面に戻ります。',
            state.uiAdjustMode,
            () => {
              if (state.uiAdjustMode) state.exitUIAdjust();
              else state.enterUIAdjust();
            }
          )}

          <SideDivider />

          {/* SideWindow.swift :: SettingWindowContent.advAndClipRows */}
          {sliderRow(
            'プラグインメニューの幅',
            `${Math.round(state.advPanelWidth)}pt`,
            state.advPanelWidth,
            160,
            520,
            4,
            (v) => {
              state.advPanelWidth = v;
            }
          )}
          {noteText('Adv. (λ) を開いたときのメニューの幅です。広げるぶん、レーンは細くなります。')}

          <SideDivider />

          {checkRow(
            'ノーツをレーンの枠で切り取る (表示のみ)',
            'オンにすると、レーンの枠 (x: 0〜255) からはみ出して描かれるノーツを、枠の端で切って描きます。譜面データは変わりません。はみ出しが譜面データ側の問題かどうかを切り分けるための確認用です。',
            state.clipNotesToTrack,
            () => {
              state.clipNotesToTrack = !state.clipNotesToTrack;
            }
          )}

          <SideDivider />

          <SideButton
            title="はみ出しノーツを数える"
            fontBoost={fontBoost}
            hitExtra={0}
            fullWidth
            onClick={() => {
              const r = state.overflowNotes();
              if (r.count === 0) {
                state.showToast('はみ出しているノーツはありません', 2.6);
              } else if (r.firstBeat) {
                state.showToast(`はみ出し: ${r.count} 個 (最初は ${r.firstBeat.label})`, 2.6);
              }
            }}
          />

          <SideButton
            title="はみ出しを枠に収める"
            fontBoost={fontBoost}
            hitExtra={0}
            fullWidth
            onClick={() => state.fixOverflowNotes()}
          />

          {noteText(
            '描画は譜面データに忠実なので、データの端が x: 0〜255 の外にあるノーツは、そのまま外へ描かれます (Malody から持ってきた譜面や、プラグインが置いたノーツに多い)。「枠に収める」は、幅は変えずに中心を内側へ寄せて収めます。Undo で戻せます。'
          )}

          <SideDivider />

          {/* 保存データの一覧・消える条件・個別削除 */}
          <StorageManager state={state} fontBoost={fontBoost} />

          {/* SideWindow.swift :: SettingWindowContent.playInfoText */}
          {state.playInfo && (
            <div
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontSize: 11 * state.smallTextBoost,
                color: 'rgba(0, 230, 230, 0.8)',
                lineHeight: 1.35,
                textAlign: 'left',
                width: '100%',
                wordBreak: 'break-word',
              }}
            >
              {state.playInfo}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const SidePanelLayer: React.FC<{
  state: EditorState;
  designWidth: number;
  designHeight: number;
  designScale: number;
  compact: boolean;
  fontBoost: number;
}> = ({ state, designWidth, designHeight, designScale, compact, fontBoost }) => {
  // SideWindow.swift :: SidePanelLayer + SideWindow
  const [renderedKind, setRenderedKind] = useState<SidePanel | null>(state.sidePanel);
  const [slidIn, setSlidIn] = useState(state.sidePanel !== null);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (state.sidePanel !== null) {
      const openingFromClosed = renderedKind === null;
      setRenderedKind(state.sidePanel);
      if (openingFromClosed) {
        setSlidIn(false);
        const id = requestAnimationFrame(() => {
          requestAnimationFrame(() => setSlidIn(true));
        });
        return () => cancelAnimationFrame(id);
      }
      setSlidIn(true);
      return;
    }

    if (renderedKind !== null) {
      setSlidIn(false);
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setRenderedKind(null);
      }, SIDE_WINDOW_CLOSE_DURATION_S * 1000);
    }
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [state.sidePanel]);

  const width = Math.min(SIDE_WINDOW_WIDTH, designWidth * SIDE_WINDOW_WIDTH_MAX_RATIO); // SideWindow.swift :: SidePanelLayer
  const top = designHeight * SIDE_WINDOW_TOP_RATIO; // SideWindow.swift :: SidePanelLayer
  const bottom = designHeight * SIDE_WINDOW_BOTTOM_RATIO; // SideWindow.swift :: SidePanelLayer
  const height = Math.max(designHeight - top - bottom, SIDE_WINDOW_MIN_HEIGHT); // SideWindow.swift :: SidePanelLayer

  if (renderedKind === null && state.sidePanel === null) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: state.sidePanel !== null ? 'auto' : 'none', // SideWindow.swift :: SidePanelLayer.allowsHitTesting
      }}
    >
      {/* Tap outside window (left area) closes immediately */}
      {state.sidePanel !== null && (
        <div
          onClick={() => state.closeSidePanel()}
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.001)', // SideWindow.swift :: SidePanelLayer
          }}
        />
      )}

      {renderedKind !== null && (
        <div
          onClick={() => {
            // SideWindow.swift :: SideWindow (dismiss keyboard when tapping empty space inside window)
            if (document.activeElement instanceof HTMLElement) {
              document.activeElement.blur();
            }
          }}
          style={{
            position: 'absolute',
            top,
            right: 0,
            width,
            height,
            paddingLeft: SIDE_WINDOW_LEADING_PAD, // SideWindow.swift :: SideWindow.leadingPad
            paddingRight: SIDE_WINDOW_TRAILING_PAD, // SideWindow.swift :: SideWindow.trailingPad
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            transform: slidIn ? 'translateX(0px)' : `translateX(${width}px)`,
            transition: slidIn
              ? `transform ${SIDE_WINDOW_OPEN_DURATION_S}s ease-out` // SideWindow.swift :: SideWindow.openAnimation
              : `transform ${SIDE_WINDOW_CLOSE_DURATION_S}s ease-in`, // SideWindow.swift :: SideWindow.closeAnimation
          }}
        >
          <SideWindowShapeSvg width={width} height={height} />
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
              width: '100%',
            }}
          >
            {renderedKind === 'bpm' && (
              <BPMWindowContent
                key="bpm"
                state={state}
                designScale={designScale}
                compact={compact}
                fontBoost={fontBoost}
              />
            )}
            {renderedKind === 'effect' && (
              <EffectWindowContent
                key="effect"
                state={state}
                designScale={designScale}
                compact={compact}
                fontBoost={fontBoost}
              />
            )}
            {renderedKind === 'information' && (
              <InformationWindowContent key="information" state={state} fontBoost={fontBoost} />
            )}
            {renderedKind === 'setting' && (
              <SettingWindowContent key="setting" state={state} fontBoost={fontBoost} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
