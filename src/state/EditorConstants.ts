// Exact visual constants and colors verbatim from Swift sources (Renderers.swift, EditorView.swift, PanelIcons.swift, UIAdjust.swift, ReviewNotice.swift, GridSettingsDialog.swift)

/** Helper converting 0.0...1.0 RGB + optional alpha into CSS rgba string while preserving exact Swift literals */
export function rgba01(r: number, g: number, b: number, a = 1): string {
  return `rgba(${r * 255}, ${g * 255}, ${b * 255}, ${a})`;
}

/** Helper converting 0...255 RGB + optional alpha into CSS rgba string while preserving exact Swift literals */
export function rgba255(r: number, g: number, b: number, a = 1): string {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export const SwiftColors = {
  // Renderers.swift :: Color extension
  laneCyan: rgba01(0.0, 0.9, 0.9, 1), // Renderers.swift :: Color.laneCyan
  tapOuter: rgba01(0.643, 0.910, 1.000, 1), // Renderers.swift :: Color.tapOuter
  tapMid: rgba01(0.016, 0.443, 0.635, 1), // Renderers.swift :: Color.tapMid
  tapCore: rgba01(0.816, 0.996, 1.000, 1), // Renderers.swift :: Color.tapCore
  tapGlow: rgba01(0.250, 0.800, 1.000, 0.22), // Renderers.swift :: Color.tapGlow + drawTap (opacity 0.22)
  wipeOuter: rgba01(0.969, 0.992, 0.290, 1), // Renderers.swift :: Color.wipeOuter
  wipeMid: rgba01(0.580, 0.588, 0.290, 1), // Renderers.swift :: Color.wipeMid
  wipeCore: rgba01(1.000, 0.988, 0.773, 1), // Renderers.swift :: Color.wipeCore
  wipeGlow: rgba01(0.950, 0.950, 0.250, 0.22), // Renderers.swift :: Color.wipeGlow + drawWipe (opacity 0.22)
  dotOuter: rgba255(234.0, 251.0, 255.0, 0.86), // Renderers.swift :: Color.dotOuter
  dotRing: rgba255(182.0, 242.0, 255.0, 0.60), // Renderers.swift :: Color.dotRing
  dotCenter: rgba255(243.0, 252.0, 254.0, 0.94), // Renderers.swift :: Color.dotCenter
  ribbonFill: rgba01(0.83, 1.0, 1.0, 0.40), // Renderers.swift :: Color.ribbonFill

  selTapOuter: rgba01(1.000, 0.660, 0.660, 1), // Renderers.swift :: Color.selTapOuter
  selTapMid: rgba01(0.620, 0.100, 0.120, 1), // Renderers.swift :: Color.selTapMid
  selTapCore: rgba01(1.000, 0.820, 0.820, 1), // Renderers.swift :: Color.selTapCore
  selTapGlow: rgba01(1.000, 0.300, 0.300, 0.22), // Renderers.swift :: Color.selTapGlow + drawTap (opacity 0.22)
  selWipeOuter: rgba01(1.000, 0.360, 0.360, 1), // Renderers.swift :: Color.selWipeOuter
  selWipeMid: rgba01(0.580, 0.250, 0.250, 1), // Renderers.swift :: Color.selWipeMid
  selWipeCore: rgba01(1.000, 0.800, 0.800, 1), // Renderers.swift :: Color.selWipeCore
  selWipeGlow: rgba01(1.000, 0.300, 0.300, 0.22), // Renderers.swift :: Color.selWipeGlow + drawWipe (opacity 0.22)
  selDotOuter: rgba01(1.000, 0.940, 0.940, 0.86), // Renderers.swift :: Color.selDotOuter
  selDotRing: rgba01(1.000, 0.500, 0.500, 0.60), // Renderers.swift :: Color.selDotRing
  selDotCenter: rgba01(1.000, 0.900, 0.900, 0.94), // Renderers.swift :: Color.selDotCenter
  selRibbon: rgba01(1.0, 0.78, 0.78, 0.40), // Renderers.swift :: Color.selRibbon

  timePanel: rgba255(88.0, 88.0, 66.0, 0.55), // Renderers.swift :: Color.timePanel
  panelBlue: rgba255(0.0, 206.0, 255.0, 1), // PanelIcons.swift :: Color.panelBlue

  // EditorView.swift :: FXButton / ZoomButton / PlayToggleButton
  zoomButtonFill: rgba255(127.0, 131.0, 138.0, 1), // EditorView.swift :: FXButton / ZoomButton
  playHexFill: rgba255(128.0, 131.0, 141.0, 1), // EditorView.swift :: PlayToggleButton
  playHexPressed: rgba01(0.60, 0.62, 0.67, 1), // EditorView.swift :: PlayToggleButton
  playGlyphTint: rgba01(0.955, 0.955, 0.955, 1), // PanelIcons.swift :: PlayGlyph.tint

  // Renderers.swift :: StripRenderer / SeekRenderer
  stripFace: 'rgba(0, 0, 0, 0.58)', // Renderers.swift :: StripRenderer.faceColor
  seekBevel: rgba255(23.0, 22.0, 20.0, 1), // Renderers.swift :: SeekRenderer.draw
  seekBar: rgba255(238.0, 102.0, 100.0, 1), // Renderers.swift :: SeekRenderer.barColor
  seekCap: rgba255(251.0, 176.0, 57.0, 1), // Renderers.swift :: SeekRenderer.capColor
} as const;

export const DesignScreen = {
  height: 820, // EditorView.swift :: DesignScreen.height
  compactThreshold: 0.62, // EditorView.swift :: DesignScreen.compactThreshold
  compactFontBoost: 1.45, // EditorView.swift :: DesignScreen.compactFontBoost
  scaleForHeight(h: number): number {
    return Math.max(h, 1) / this.height; // EditorView.swift :: DesignScreen.scale(forHeight:)
  },
  isCompact(h: number): boolean {
    return this.scaleForHeight(h) < this.compactThreshold; // EditorView.swift :: DesignScreen.isCompact(forHeight:)
  },
  hitLength(visual: number, scale: number, compact: boolean): number {
    if (!compact) return visual; // EditorView.swift :: DesignScreen.hitLength(_:scale:compact:)
    return Math.min(92, Math.max(visual, 31 / Math.max(scale, 0.2))); // EditorView.swift :: DesignScreen.hitLength(_:scale:compact:)
  },
} as const;

/**
 * ノーツ (タップ / ワイプ) の縦幅の倍率。見た目と当たり判定の両方に使う。
 * 100% が従来の大きさ (最小)、240% まで伸ばせる。
 * 下端 (タイミング線のすぐ上) は動かさず、上方向へ伸ばす。
 */
export const NoteHeightConstants = {
  min: 1.0,
  max: 2.4,
  step: 0.05,
  tapH: 11.5, // Renderers.swift :: LaneRenderer.tapH
  wipeHalfH: 6.0, // Renderers.swift :: LaneRenderer.drawWipe (h)
  barLift: 8.0, // Renderers.swift :: LaneRenderer.barLift
  hitHalfH: 14.0, // EditorState+Tools.swift :: noteHit tolerance 14

  clamp(v: number): number {
    if (!Number.isFinite(v)) return this.min;
    return Math.min(Math.max(v, this.min), this.max);
  },

  /** タップの高さ (px) */
  tapHeight(scale: number): number {
    return this.tapH * scale;
  },

  /** ワイプの半分の高さ (px) */
  wipeHalfHeight(scale: number): number {
    return this.wipeHalfH * scale;
  },

  /** ノーツの中心を、拍の線から上へ持ち上げる量 (下端の位置が変わらないようにする) */
  lift(isWipe: boolean, scale: number): number {
    const half = isWipe ? this.wipeHalfH : this.tapH / 2;
    return this.barLift + (scale - 1) * half;
  },

  /** 当たり判定の上下の半分の幅 (px) */
  hitHalf(scale: number): number {
    return this.hitHalfH * scale;
  },
} as const;

export const UIAdjustConstants = {
  stripWidthDefault: 145, // UIAdjust.swift :: UIAdjust.stripWidthDefault
  stripWidthMax: 145 * 3, // UIAdjust.swift :: UIAdjust.stripWidthMax
  panelWidthDefault: 58, // UIAdjust.swift :: UIAdjust.panelWidthDefault
  panelWidthMax: 58 * 3, // UIAdjust.swift :: UIAdjust.panelWidthMax
  panelWidthPhone: 82, // UIAdjust.swift :: UIAdjust.panelWidthPhone
  minLaneWidth: 360, // UIAdjust.swift :: UIAdjust.minLaneWidth
} as const;

export const SeekPanelConstants = {
  seekWidth: 66, // EditorView.swift :: SeekPanel.seekWidth
  labelWidth: 38, // EditorView.swift :: SeekPanel.labelWidth
  get totalWidth(): number {
    return this.seekWidth + this.labelWidth; // EditorView.swift :: SeekPanel.totalWidth
  },
  hexCenterX: 60, // EditorView.swift :: SeekPanel.hexCenterX
  playHexWidth: 100, // EditorView.swift :: PlayToggleButton.hexWidth
  playHexHeight: 86.6, // EditorView.swift :: PlayToggleButton.hexHeight
  playBorder: 2.8, // EditorView.swift :: PlayToggleButton.border
} as const;

export const RightPanelConstants = {
  width: UIAdjustConstants.panelWidthDefault, // EditorView.swift :: RightPanel.width
  slotPitch: 68.5, // EditorView.swift :: RightPanel.slotPitch
  edgeInsetBase: 10.75, // EditorView.swift :: RightPanel.edgeInset
  bottomCount: 2, // EditorView.swift :: RightPanel.bottomCount
  sideGap: 10.8, // EditorView.swift :: RightPanel.sideGap
  labelGap: 12.4, // EditorView.swift :: RightPanel.labelGap
  popupBottomInset: 2.5, // EditorView.swift :: RightPanel.popupBottomInset
  compactEdgeExtra: 52, // EditorView.swift :: RightPanel.compactEdgeExtra
  refIconHeight: 36, // PanelIcons.swift :: PanelIconView.refHeight

  edgeInset(compact: boolean): number {
    // UIAdjust.swift :: DisplayShape.edgeMargin fallback to compactEdgeExtra
    return this.edgeInsetBase + (compact ? this.compactEdgeExtra : 0); // EditorView.swift :: RightPanel.edgeInset(compact:)
  },

  basePitch(height: number, editing: boolean, compact: boolean): number {
    const topCount = editing ? 9 : 6; // EditorView.swift :: RightPanel.basePitch (9 EDIT slots, 6 MAIN slots)
    return Math.min(this.slotPitch, (height - this.edgeInset(compact) * 2) / (topCount + this.bottomCount)); // EditorView.swift :: RightPanel.basePitch
  },

  iconScaleLimit(height: number, editing: boolean, compact: boolean): number {
    const count = (editing ? 9 : 6) + this.bottomCount; // EditorView.swift :: RightPanel.iconScaleLimit
    const room = (height - this.edgeInset(compact) * 2) / count; // EditorView.swift :: RightPanel.iconScaleLimit
    const gap = this.basePitch(height, editing, compact) - this.refIconHeight; // EditorView.swift :: RightPanel.iconScaleLimit
    return Math.max(1, (room - gap) / this.refIconHeight); // EditorView.swift :: RightPanel.iconScaleLimit
  },

  effectiveIconScale(requested: number, height: number, editing: boolean, compact: boolean): number {
    return Math.max(1, Math.min(requested, this.iconScaleLimit(height, editing, compact))); // EditorView.swift :: RightPanel.effectiveIconScale
  },

  pitch(height: number, editing: boolean, compact = false, iconScale = 1): number {
    const base = this.basePitch(height, editing, compact);
    return base + this.refIconHeight * Math.max(0, iconScale - 1); // EditorView.swift :: RightPanel.pitch
  },

  moreCenterY(height: number, compact = false, iconScale = 1): number {
    return this.edgeInset(compact) + this.pitch(height, true, compact, iconScale) * 7.5; // EditorView.swift :: RightPanel.moreCenterY
  },
} as const;

export interface StripButtonLayoutResult {
  scale: number;
  limited: boolean;
  jumped: boolean;
  minusTop: number;
  gap: number;
  labelFont: number;
  fxTop: number;
}

export const StripButtonLayout = {
  notchMargin: 8, // UIAdjust.swift :: StripButtonLayout.notchMargin
  bottomMargin: 8, // UIAdjust.swift :: StripButtonLayout.bottomMargin

  hit(k: number, compact: boolean, designScale: number): { width: number; height: number } {
    const vw = 39 * k; // UIAdjust.swift :: StripButtonLayout.hit
    const vh = 45 * k; // UIAdjust.swift :: StripButtonLayout.hit
    return {
      width: Math.max(vw, DesignScreen.hitLength(vw, designScale, compact)),
      height: Math.max(vh, DesignScreen.hitLength(vh, designScale, compact)),
    };
  },

  make(
    k: number,
    compact: boolean,
    designScale: number,
    band: [number, number] | null
  ): { layout: StripButtonLayoutResult; fits: boolean } {
    const h = this.hit(k, compact, designScale);
    const visualH = 45 * k; // UIAdjust.swift :: StripButtonLayout.make
    const slack = (h.height - visualH) / 2; // UIAdjust.swift :: StripButtonLayout.make
    const top = compact ? 60 : 10.75; // UIAdjust.swift :: StripButtonLayout.make
    const gap = compact ? 4 : 12.25; // UIAdjust.swift :: StripButtonLayout.make
    const labelFont = (compact ? 17 : 10) * k; // UIAdjust.swift :: StripButtonLayout.make
    const labelBottom = top + h.height + gap + h.height + 3 + labelFont * 1.2; // UIAdjust.swift :: StripButtonLayout.make

    let fxTop = compact ? labelBottom + 4 : Math.max(159.5, labelBottom + 12); // UIAdjust.swift :: StripButtonLayout.make
    let jumped = false;
    if (band) {
      const visTop = fxTop + slack;
      const visBottom = visTop + visualH;
      if (visBottom > band[0] && visTop < band[1]) {
        fxTop = band[1] + this.notchMargin - slack; // UIAdjust.swift :: StripButtonLayout.make
        jumped = true;
      }
    }

    let fits = fxTop + slack + visualH <= DesignScreen.height - this.bottomMargin; // UIAdjust.swift :: StripButtonLayout.make
    if (band && labelBottom > band[0] - 2) fits = false; // UIAdjust.swift :: StripButtonLayout.make
    return {
      layout: { scale: k, limited: false, jumped, minusTop: top, gap, labelFont, fxTop },
      fits,
    };
  },

  resolve(
    requested: number,
    compact: boolean,
    designScale: number,
    band: [number, number] | null
  ): StripButtonLayoutResult {
    const want = Math.max(1, requested); // UIAdjust.swift :: StripButtonLayout.resolve
    let k = want;
    while (k > 1) {
      const res = this.make(k, compact, designScale, band);
      if (res.fits) {
        return { ...res.layout, limited: k < want - 0.005 }; // UIAdjust.swift :: StripButtonLayout.resolve
      }
      k -= 0.01; // UIAdjust.swift :: StripButtonLayout.resolve
    }
    const base = this.make(1, compact, designScale, band).layout;
    return { ...base, limited: want > 1.005 }; // UIAdjust.swift :: StripButtonLayout.resolve
  },
};

export function panelMenuFontCss(size: number, boost = 1): string {
  // PanelIcons.swift :: PanelFont.menu(_:boost:)
  return `${size * boost}px "DIN Condensed", "DINCondensed-Bold", "Arial Narrow", sans-serif`;
}

export function panelLabelFontCss(size: number, boost = 1): string {
  // PanelIcons.swift :: PanelFont.label(_:boost:)
  return `${size * boost}px "Avenir Next Condensed", "AvenirNextCondensed-Medium", "Arial Narrow", sans-serif`;
}
