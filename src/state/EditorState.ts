// EditorState.swift + EditorState+FX.swift + EditorState+Tools.swift + EditorState+Meta.swift + EditorState+Plugins.swift (orderTap)

import { Beat, normalizeNumberInput } from '../core/Beat';
import { EffectMap, EffectEvent } from '../core/Effects';
import {
  ChartData,
  EffectKind,
  EffectPoint,
  Note,
  NoteID,
  Seg,
  TimeMap,
  TimePoint,
  cloneNote,
  isSlideNote,
  isWipeNote,
  nextNoteID,
} from '../core/ChartModel';
import { NoteIndex } from '../core/NoteIndex';
import { SeekDensity } from '../core/SeekDensity';
import { createDemoChartJSON } from '../core/DemoChart';
import { detectImageMime, replaceExtWithJpg } from '../core/ImageNormalize';
import { exportMCZBlob } from '../core/MCZArchive';
import { GameAudio, SongPCM, getSharedAudioContext, unlockAudioContext } from '../audio/AudioEngine';
import { KeySound } from '../audio/KeySound';
import { LuaEngine, type RunningPluginHandle } from '../plugins/LuaEngine';
import { base64ToBytes } from '../plugins/PluginImageTools';
import { PluginSession } from '../plugins/PluginSession';
import type { PluginItem } from '../plugins/PluginStore';
import type {
  PluginDialog,
  PluginPromptRequest,
  PluginSnapshot,
  PluginSprite,
  WorkerPatch,
} from '../plugins/PluginTypes';
import { DesignScreen, UIAdjustConstants } from './EditorConstants';
import { EditorSessionStorage, type SessionSaveResult } from './EditorSessionStorage';

export type EditTool =
  | 'unselected' // EditorState.swift :: EditTool.unselected
  | 'note' // EditorState.swift :: EditTool.note
  | 'wipe' // EditorState.swift :: EditTool.wipe
  | 'slide' // EditorState.swift :: EditTool.slide
  | 'remove' // EditorState.swift :: EditTool.remove
  | 'lasso' // EditorState.swift :: EditTool.lasso
  | 'order' // EditorState.swift :: EditTool.order
  | 'plugin' // EditorState.swift :: EditTool.plugin
  | 'selectRange' // EditorState.swift :: EditTool.selectRange
  | 'slideModify'; // EditorState.swift :: EditTool.slideModify

export type LanePhase = 'began' | 'changed' | 'ended'; // EditorState.swift :: LanePhase

export type LaneDragMode =
  | 'idle'
  | 'place'
  | 'ignore'
  | 'pendingMove'
  | 'moving'
  | 'legacy'
  | 'segDrag'
  | 'lasso'; // EditorState.swift :: LaneDragMode

export type EditPopup = 'none' | 'speed' | 'divide' | 'more'; // EditorState.swift :: EditPopup

export type SidePanel = 'bpm' | 'effect' | 'information' | 'setting'; // EditorState.swift :: SidePanel

export interface SlideDraft {
  beat: Beat;
  x: number;
  w: number;
  noteID: NoteID;
} // EditorState.swift :: SlideDraft

export interface Ghost {
  tool: EditTool;
  beat: Beat;
  x: number;
  w: number;
  endBeat?: Beat;
  endX?: number;
} // EditorState.swift :: Ghost

export interface Point2D {
  x: number;
  y: number;
}

export class FXWarp {
  readonly map: EffectMap;
  readonly time: TimeMap;
  readonly spbRef: number;
  readonly nowSec: number;
  readonly pNow: number;

  constructor(map: EffectMap, time: TimeMap, nowSec: number) {
    this.map = map;
    this.time = time;
    this.spbRef = Math.max(1e-6, time.firstSecPerBeat); // EditorState.swift :: FXWarp.init
    this.nowSec = nowSec;
    this.pNow = map.p(nowSec); // EditorState.swift :: FXWarp.init
  }

  pSec(b: number): number {
    return this.map.p(this.time.secAtBeat(b)); // EditorState.swift :: FXWarp.pSec(ofBeat:)
  }
}

export class LaneGeo {
  W: number;
  H: number;
  viewBeat: number;
  ppb: number;
  fx: FXWarp | null;

  constructor(W: number, H: number, viewBeat: number, ppb: number, fx: FXWarp | null = null) {
    this.W = W;
    this.H = H;
    this.viewBeat = viewBeat;
    this.ppb = ppb;
    this.fx = fx;
  }

  get trackL(): number {
    return 25.2; // EditorState.swift :: LaneGeo.trackL
  }

  get trackW(): number {
    return Math.max(10, this.W - 35.4); // EditorState.swift :: LaneGeo.trackW
  }

  get playY(): number {
    return this.H * 0.9134; // EditorState.swift :: LaneGeo.playY
  }

  px(x: number): number {
    return this.trackL + (x / 255.0) * this.trackW; // EditorState.swift :: LaneGeo.px(_:)
  }

  xOf(p: number): number {
    return ((p - this.trackL) / this.trackW) * 255.0; // EditorState.swift :: LaneGeo.xOf(_:)
  }

  py(b: number): number {
    if (this.fx) {
      return this.playY - (this.fx.pSec(b) - this.fx.pNow) * this.fxPxPerSec(this.fx); // EditorState.swift :: LaneGeo.py(_:)
    }
    return this.playY - (b - this.viewBeat) * this.ppb; // EditorState.swift :: LaneGeo.py(_:)
  }

  beatOf(y: number): number {
    return this.viewBeat + (this.playY - y) / this.ppb; // EditorState.swift :: LaneGeo.beatOf(_:)
  }

  fxPxPerSec(f: FXWarp): number {
    return this.ppb / f.spbRef; // EditorState.swift :: LaneGeo.fxPxPerSec(_:)
  }
}

interface Snapshot {
  notes: Note[];
  times: TimePoint[];
  effects: EffectPoint[];
} // EditorState.swift :: EditorState.Snapshot

const BAR_LIFT = 8; // Renderers.swift :: LaneRenderer.barLift

function hypot(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

function pointInPolygon(p: Point2D, poly: Point2D[]): boolean {
  // EditorState+Tools.swift :: pointInPolygon(_:_:)
  let inside = false;
  let j = poly.length - 1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y)) {
      const t = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < t) inside = !inside;
    }
    j = i;
  }
  return inside;
}

function windingContains(p: Point2D, poly: Point2D[]): boolean {
  // EditorState+Tools.swift :: windingContains(_:_:)
  let wn = 0;
  let j = poly.length - 1;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[j];
    const b = poly[i];
    const cross = (b.x - a.x) * (p.y - a.y) - (p.x - a.x) * (b.y - a.y);
    if (a.y <= p.y) {
      if (b.y > p.y && cross > 0) wn += 1;
    } else if (b.y <= p.y && cross < 0) {
      wn -= 1;
    }
    j = i;
  }
  return wn !== 0;
}

export class EditorState {
  static readonly speeds: readonly number[] = [1.0, 0.75, 0.5, 0.25, 0.1]; // EditorState.swift :: EditorState.speeds
  static readonly divides: readonly number[] = [2, 3, 4, 6, 8, 12, 16, 24, 32]; // EditorState.swift :: EditorState.divides
  static readonly speedMin = 0.1; // EditorState.swift :: EditorState.speedRange.lowerBound
  static readonly speedMax = 1.0; // EditorState.swift :: EditorState.speedRange.upperBound
  static readonly divideMin = 2; // EditorState.swift :: EditorState.divideRange.lowerBound
  static readonly divideMax = 1024; // EditorState.swift :: EditorState.divideRange.upperBound
  static readonly zoomCount = 17; // EditorState.swift :: EditorState.zoomCount
  static readonly playLead = 0.05; // EditorState.swift :: EditorState.playLead
  static readonly keyLookahead = 0.25; // EditorState.swift :: EditorState.keyLookahead

  chart: ChartData;
  timeMap: TimeMap;
  mcName: string;
  song: SongPCM | null;

  // Background & file info (EditorState.swift)
  bgUrl: string | null = null;
  bgData: Uint8Array | null = null;
  bgFileName = '';
  oggData: Uint8Array | null = null;
  oggFileName = '';
  private ownedBgUrl: string | null = null;
  private _bgDim = 0.7; // EditorState.swift :: EditorState.bgDim
  private _musicVolume = 1.0; // EditorState.swift :: EditorState.musicVolume
  private _noteVolume = 0.8; // EditorState.swift :: EditorState.noteVolume

  // View & Control State
  private _viewBeat = 0; // EditorState.swift :: EditorState.viewBeat
  isPlaying = false; // EditorState.swift :: EditorState.isPlaying
  zoomLevel = 8; // EditorState.swift :: EditorState.zoomLevel
  fxMode = false; // EditorState.swift :: EditorState.fxMode
  compactLayout = false; // EditorState.swift :: EditorState.compactLayout
  snapDen = 4; // EditorState.swift :: EditorState.snapDen
  playSpeed = 1.0; // EditorState.swift :: EditorState.playSpeed
  editing = false; // EditorState.swift :: EditorState.editing
  private _tool: EditTool = 'unselected'; // EditorState.swift :: EditorState.tool

  slideDraft: SlideDraft | null = null;
  selectedIDs = new Set<NoteID>();
  orderIDs: NoteID[] = [];
  modifySlideID: NoteID | null = null;
  modifySegIndex: number | null = null;
  popup: EditPopup = 'none';
  gridLines = 32; // EditorState.swift :: EditorState.gridLines
  gridAlign = true; // EditorState.swift :: EditorState.gridAlign
  widthUnits = 64; // EditorState.swift :: EditorState.widthUnits
  lassoPoints: Point2D[] = [];
  rangeStart: Beat | null = null;
  rangeEnd: Beat | null = null;
  clip: Note[] = [];

  private _advOpen = false; // EditorState.swift :: EditorState.advOpen
  private _advPanelWidth = 196; // EditorState.swift :: EditorState.advPanelWidth
  pluginRunning = false; // EditorState.swift :: EditorState.pluginRunning
  pluginLog = ''; // EditorState.swift :: EditorState.pluginLog
  pluginDialog: PluginDialog | null = null; // EditorState.swift :: EditorState.pluginDialog
  activePluginID: string | null = null; // EditorState.swift :: EditorState.activePluginID
  pluginSprites: PluginSprite[] = []; // EditorState.swift :: EditorState.pluginSprites
  private pluginSession: PluginSession | null = null; // EditorState.swift :: EditorState.pluginSession
  private pluginDragStarted = false; // EditorState.swift :: EditorState.pluginDragStarted
  private activePluginHandle: RunningPluginHandle | null = null;
  private pluginDialogResolver: ((answer: string | null) => void) | null = null;
  private pluginDialogSeq = 0;
  ghost: Ghost | null = null;
  toast: string | null = null;
  saveStatus = '保存済み'; // EditorState.swift :: EditorState.saveStatus
  private sessionPersistenceEnabled = true;
  metaOpen = false; // EditorState.swift :: EditorState.metaOpen
  reviewNoticeTick = 0; // EditorState.swift :: EditorState.reviewNoticeTick
  showGridDialog = false; // EditorState.swift :: EditorState.showGridDialog
  sidePanel: SidePanel | null = null; // EditorState.swift :: EditorState.sidePanel
  uiAdjustMode = false; // EditorState.swift :: EditorState.uiAdjustMode
  onClose: (() => void) | null = null; // EditorState.swift :: EditorState.onClose
  playInfo = ''; // EditorState.swift :: EditorState.playInfo
  undoCount = 0;
  redoCount = 0;

  // Settings (kept matching Swift defaults + persisted in localStorage)
  private _holdDeselectSec = 2.0; // EditorState.swift :: EditorState.holdDeselectSec
  private _touchEffect = false; // EditorState.swift :: EditorState.touchEffect
  private _smallTextScale = 1.5; // EditorState.swift :: EditorState.smallTextScale
  private _menuScale = 1.0; // EditorState.swift :: EditorState.menuScale
  private _stripWidth: number = UIAdjustConstants.stripWidthDefault; // EditorState.swift :: EditorState.stripWidth
  private _rightPanelWidth: number = UIAdjustConstants.panelWidthDefault; // EditorState.swift :: EditorState.rightPanelWidth
  private _clipNotesToTrack = false; // EditorState.swift :: EditorState.clipNotesToTrack
  private _sharpStretch = false; // EditorState.swift :: EditorState.sharpStretch
  private _allowUnorderedSeg = false; // EditorState.swift :: EditorState.allowUnorderedSeg
  private _gridCenterAlign = true; // EditorState.swift :: EditorState.gridCenterAlign
  private _allowNoteOverflow = false; // EditorState.swift :: EditorState.allowNoteOverflow
  private _allowSegVerticalMove = false; // EditorState.swift :: EditorState.allowSegVerticalMove
  private _snapViewToLFB = true; // EditorState.swift :: EditorState.snapViewToLFB
  private _resnapExistingNotes = false; // EditorState.swift :: EditorState.resnapExistingNotes
  private _copyKeepsRangeOffset = false; // EditorState.swift :: EditorState.copyKeepsRangeOffset

  // Cached FX map
  private fxCache: EffectMap = EffectMap.none;
  private fxKey = '';

  // Cached totalSec
  private totalCache = 1.0; // EditorState.swift :: EditorState.totalCache
  private ignoredCache = 0;
  private totalDirty = true;

  // Cached SeekDensity
  private densityRatios: number[] = [];
  private densityDirty = true;
  private densityTotal = -1.0;

  // Cached NoteIndex
  private noteIndexCache = new NoteIndex();
  private noteIndexRevision = -1;
  private memoID: NoteID = 0;
  private memoPos = -1;

  // Playback engine & wall clock fallback (EditorState.swift)
  private engineAudio: GameAudio | null = null;
  private useEngine = false;
  private startWall = 0;
  private startSec = 0;
  private rateNow = 1;
  private frameHost = 0;
  private rafId: number | null = null;
  seekWasPlaying = false;

  // Key sound scheduling (EditorState.swift)
  private keyTimes: number[] = [];
  private keyDirty = true;
  private keyDone = -1.0;

  // Drag / Move / Width / SegDrag internals
  private holdTimer: number | null = null;
  private toastTimer: number | null = null;
  private saveTimer: number | null = null;
  dragMode: LaneDragMode = 'idle';
  dragMoved = false;
  dragTouchedID: NoteID | null = null;
  dragToggleOnTap = false;
  moveTargets: { index: number; orig: Note }[] = [];
  moveAnchorBeat: Beat = Beat.zero;
  moveMinBeat: Beat = Beat.zero;
  moveLeftEdge = 0.0;
  moveRightEdge = 255.0;
  moveLastDelta: Beat = Beat.zero;
  moveLastDX = 0;

  segDragNoteID: NoteID | null = null;
  segDragIndex = 0;
  segDragOrig: Seg | null = null;
  segDragGrab = { width: 0, height: 0 };
  segDragUndoPushed = false;

  widthTargets: { index: number; orig: Note }[] = [];
  widthUndoPushed = false;

  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];

  // Subscribers for React UI + Canvas frames
  private uiListeners = new Set<() => void>();
  private frameListeners = new Set<() => void>();

  constructor(chart?: ChartData, mcName = 'demo.mc', song: SongPCM | null = null) {
    const initialChart = chart ?? ChartData.parse(createDemoChartJSON());
    initialChart.times.sort((a, b) => Beat.compare(a.beat, b.beat));
    this.chart = initialChart;
    this.timeMap = new TimeMap(initialChart.times);
    this.mcName = mcName;
    this.song = song;
    const d = initialChart.testInt('divide');
    if (d !== undefined && d >= EditorState.divideMin && d <= EditorState.divideMax) {
      this.snapDen = d;
    }
    this.recomputeTotal();
    this.loadPersistedSettings();
    this.prepareEngineAudio();
    this.applyVolumes();
    KeySound.shared.prepare();
  }

  private static readStoredNumber(key: string): number | null {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return null;
      const v = Number(raw);
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }

  private static readStoredBool(key: string): boolean | null {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return null;
    } catch {
      return null;
    }
  }

  private static writeStoredSetting(key: string, value: number | boolean): void {
    try {
      window.localStorage.setItem(key, String(value));
    } catch {
      // Ignore storage quota or private-browsing failures
    }
  }

  private loadPersistedSettings(): void {
    // EditorState.swift :: EditorState.init UserDefaults restore
    const musicVol = EditorState.readStoredNumber('editor.musicVolume');
    if (musicVol !== null) this._musicVolume = Math.min(Math.max(musicVol, 0), 1);

    const noteVol = EditorState.readStoredNumber('editor.noteVolume');
    if (noteVol !== null) this._noteVolume = Math.min(Math.max(noteVol, 0), 1);

    const bgDim = EditorState.readStoredNumber('editor.bgDim');
    if (bgDim !== null) this._bgDim = Math.min(Math.max(bgDim, 0), 0.95);

    const allowUnordered = EditorState.readStoredBool('editor.allowUnorderedSeg');
    if (allowUnordered !== null) {
      this._allowUnorderedSeg = allowUnordered;
    } else {
      const legacy = EditorState.readStoredBool('editor.allowNegativeSeg');
      if (legacy !== null) this._allowUnorderedSeg = legacy;
    }

    const allowSegV = EditorState.readStoredBool('editor.allowSegVerticalMove');
    if (allowSegV !== null) this._allowSegVerticalMove = allowSegV;

    const snapView = EditorState.readStoredBool('editor.snapViewToLFB');
    if (snapView !== null) this._snapViewToLFB = snapView;

    const gridCenter = EditorState.readStoredBool('editor.gridCenterAlign');
    if (gridCenter !== null) this._gridCenterAlign = gridCenter;

    const allowOverflow = EditorState.readStoredBool('editor.allowNoteOverflow');
    if (allowOverflow !== null) this._allowNoteOverflow = allowOverflow;

    const resnap = EditorState.readStoredBool('editor.resnapExistingNotes');
    if (resnap !== null) this._resnapExistingNotes = resnap;

    const keepRange = EditorState.readStoredBool('editor.copyKeepsRangeOffset');
    if (keepRange !== null) this._copyKeepsRangeOffset = keepRange;

    const hold = EditorState.readStoredNumber('editor.holdDeselectSec');
    if (hold !== null) this._holdDeselectSec = Math.min(Math.max(hold, 1.0), 5.0);

    const smallText = EditorState.readStoredNumber('editor.smallTextScale');
    if (smallText !== null) this._smallTextScale = Math.min(Math.max(smallText, 1.0), 3.0);

    const menu = EditorState.readStoredNumber('editor.menuScale');
    if (menu !== null) this._menuScale = Math.min(Math.max(menu, 1.0), 2.0);

    const strip = EditorState.readStoredNumber('editor.stripWidth');
    if (strip !== null) {
      this._stripWidth = Math.min(Math.max(strip, UIAdjustConstants.stripWidthDefault), UIAdjustConstants.stripWidthMax);
    }

    const panel = EditorState.readStoredNumber('editor.rightPanelWidth');
    if (panel !== null) {
      this._rightPanelWidth = Math.min(Math.max(panel, UIAdjustConstants.panelWidthDefault), UIAdjustConstants.panelWidthMax);
    } else if (typeof window !== 'undefined' && DesignScreen.isCompact(window.innerHeight)) {
      this._rightPanelWidth = UIAdjustConstants.panelWidthPhone; // UIAdjust.swift :: UIAdjust.panelWidthInitial
    }

    const adv = EditorState.readStoredNumber('editor.advPanelWidth');
    if (adv !== null) this._advPanelWidth = Math.min(Math.max(adv, 160), 520);

    const clip = EditorState.readStoredBool('editor.clipNotesToTrack');
    if (clip !== null) this._clipNotesToTrack = clip;

    const touch = EditorState.readStoredBool('editor.touchEffect');
    if (touch !== null) this._touchEffect = touch;

    const sharp = EditorState.readStoredBool('editor.sharpStretch');
    if (sharp !== null) this._sharpStretch = sharp;
  }

  get musicVolume(): number { return this._musicVolume; }
  set musicVolume(v: number) {
    this._musicVolume = Math.min(Math.max(v, 0), 1);
    EditorState.writeStoredSetting('editor.musicVolume', this._musicVolume);
    this.applyVolumes();
    this.emitUI();
  }

  get noteVolume(): number { return this._noteVolume; }
  set noteVolume(v: number) {
    this._noteVolume = Math.min(Math.max(v, 0), 1);
    EditorState.writeStoredSetting('editor.noteVolume', this._noteVolume);
    this.applyVolumes();
    this.emitUI();
  }

  get bgDim(): number { return this._bgDim; }
  set bgDim(v: number) {
    this._bgDim = Math.min(Math.max(v, 0), 0.95);
    EditorState.writeStoredSetting('editor.bgDim', this._bgDim);
    this.emitUI();
  }

  private prepareEngineAudio(): void {
    // EditorState.swift :: EditorState.prepareEngineAudio()
    if (this.engineAudio !== null || !this.song) return;
    try {
      const g = new GameAudio(this.song);
      g.setSharpStretch(this._sharpStretch);
      g.setVolume(this._musicVolume);
      this.engineAudio = g;
    } catch {
      this.engineAudio = null;
      this.showToast('オーディオエンジンを起動できなかったので、音なしで動かします');
    }
  }

  applyVolumes(): void {
    // EditorState.swift :: EditorState.applyVolumes()
    this.engineAudio?.setVolume(this._musicVolume);
    KeySound.shared.volume = this._noteVolume;
  }

  get holdDeselectSec(): number { return this._holdDeselectSec; }
  set holdDeselectSec(v: number) {
    this._holdDeselectSec = Math.min(Math.max(v, 1.0), 5.0);
    EditorState.writeStoredSetting('editor.holdDeselectSec', this._holdDeselectSec);
    this.emitUI();
  }

  get smallTextScale(): number { return this._smallTextScale; }
  set smallTextScale(v: number) {
    this._smallTextScale = Math.min(Math.max(v, 1.0), 3.0);
    EditorState.writeStoredSetting('editor.smallTextScale', this._smallTextScale);
    this.emitUI();
  }

  get menuScale(): number { return this._menuScale; }
  set menuScale(v: number) {
    this._menuScale = Math.min(Math.max(v, 1.0), 2.0);
    EditorState.writeStoredSetting('editor.menuScale', this._menuScale);
    this.emitUI();
  }

  get stripWidth(): number { return this._stripWidth; }
  set stripWidth(v: number) {
    this._stripWidth = Math.min(Math.max(v, UIAdjustConstants.stripWidthDefault), UIAdjustConstants.stripWidthMax);
    EditorState.writeStoredSetting('editor.stripWidth', this._stripWidth);
    this.emitUI();
  }

  get rightPanelWidth(): number { return this._rightPanelWidth; }
  set rightPanelWidth(v: number) {
    this._rightPanelWidth = Math.min(Math.max(v, UIAdjustConstants.panelWidthDefault), UIAdjustConstants.panelWidthMax);
    EditorState.writeStoredSetting('editor.rightPanelWidth', this._rightPanelWidth);
    this.emitUI();
  }

  get advPanelWidth(): number { return this._advPanelWidth; }
  set advPanelWidth(v: number) {
    this._advPanelWidth = Math.min(Math.max(v, 160), 520);
    EditorState.writeStoredSetting('editor.advPanelWidth', this._advPanelWidth);
    this.emitUI();
  }

  get touchEffect(): boolean { return this._touchEffect; }
  set touchEffect(v: boolean) {
    this._touchEffect = v;
    EditorState.writeStoredSetting('editor.touchEffect', v);
    this.emitUI();
  }

  get sharpStretch(): boolean { return this._sharpStretch; }
  set sharpStretch(v: boolean) {
    this._sharpStretch = v;
    EditorState.writeStoredSetting('editor.sharpStretch', v);
    this.engineAudio?.setSharpStretch(v);
    this.emitUI();
  }

  get clipNotesToTrack(): boolean { return this._clipNotesToTrack; }
  set clipNotesToTrack(v: boolean) {
    this._clipNotesToTrack = v;
    EditorState.writeStoredSetting('editor.clipNotesToTrack', v);
    this.emitUI();
  }

  get allowUnorderedSeg(): boolean { return this._allowUnorderedSeg; }
  set allowUnorderedSeg(v: boolean) {
    this._allowUnorderedSeg = v;
    EditorState.writeStoredSetting('editor.allowUnorderedSeg', v);
    this.emitUI();
  }

  get gridCenterAlign(): boolean { return this._gridCenterAlign; }
  set gridCenterAlign(v: boolean) {
    this._gridCenterAlign = v;
    EditorState.writeStoredSetting('editor.gridCenterAlign', v);
    this.emitUI();
  }

  get allowNoteOverflow(): boolean { return this._allowNoteOverflow; }
  set allowNoteOverflow(v: boolean) {
    this._allowNoteOverflow = v;
    EditorState.writeStoredSetting('editor.allowNoteOverflow', v);
    this.emitUI();
  }

  get allowSegVerticalMove(): boolean { return this._allowSegVerticalMove; }
  set allowSegVerticalMove(v: boolean) {
    this._allowSegVerticalMove = v;
    EditorState.writeStoredSetting('editor.allowSegVerticalMove', v);
    this.emitUI();
  }

  get snapViewToLFB(): boolean { return this._snapViewToLFB; }
  set snapViewToLFB(v: boolean) {
    this._snapViewToLFB = v;
    EditorState.writeStoredSetting('editor.snapViewToLFB', v);
    this.emitUI();
  }

  get resnapExistingNotes(): boolean { return this._resnapExistingNotes; }
  set resnapExistingNotes(v: boolean) {
    this._resnapExistingNotes = v;
    EditorState.writeStoredSetting('editor.resnapExistingNotes', v);
    this.emitUI();
  }

  get copyKeepsRangeOffset(): boolean { return this._copyKeepsRangeOffset; }
  set copyKeepsRangeOffset(v: boolean) {
    this._copyKeepsRangeOffset = v;
    EditorState.writeStoredSetting('editor.copyKeepsRangeOffset', v);
    this.emitUI();
  }

  subscribeUI(fn: () => void): () => void {
    this.uiListeners.add(fn);
    return () => this.uiListeners.delete(fn);
  }

  subscribeFrame(fn: () => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  emitUI(): void {
    for (const fn of this.uiListeners) fn();
    this.emitFrame();
  }

  emitFrame(): void {
    for (const fn of this.frameListeners) fn();
  }

  get viewBeat(): number {
    return this._viewBeat;
  }

  set viewBeat(b: number) {
    this._viewBeat = b;
  }

  get advOpen(): boolean {
    return this._advOpen;
  }

  set advOpen(v: boolean) {
    if (this._advOpen === v) return;
    this._advOpen = v;
    if (!v) {
      // EditorState.swift :: Adv. を閉じたときは操作型プラグインも後始末する
      this.stopInteractivePlugin();
      if (this._tool === 'plugin') this._tool = 'unselected';
    }
  }

  get tool(): EditTool {
    return this._tool;
  }

  set tool(next: EditTool) {
    const prev = this._tool;
    if (next === prev) return;
    if (prev === 'plugin' && next !== 'plugin') this.stopInteractivePlugin(); // EditorState.swift :: tool didSet
    this._tool = next;
    this.ghost = null;
    if (prev === 'slide') this.slideDraft = null; // EditorState.swift :: tool didSet
    if (next === 'remove' && this.selectedIDs.size > 0) this.selectedIDs = new Set(); // EditorState.swift :: tool didSet
    if (prev === 'selectRange') {
      this.rangeStart = null;
      this.rangeEnd = null;
    }
    if (prev === 'lasso') this.lassoPoints = [];
    if (prev === 'slideModify') this.modifySlideID = null;
    if (prev === 'slideModify' || next === 'slideModify') this.modifySegIndex = null;
    if (next === 'slideModify' && this.selectedIDs.size === 1) {
      const id = this.selectedIDs.values().next().value;
      if (id !== undefined) {
        const ni = this.indexOfNote(id);
        if (ni !== null && isSlideNote(this.chart.notes[ni])) {
          this.modifySlideID = id;
        }
      }
    }
    this.emitUI();
  }

  static isPlacementTool(t: EditTool): boolean {
    return t === 'note' || t === 'wipe' || t === 'slide'; // EditorState.swift :: EditTool.isPlacement
  }

  get totalSec(): number {
    if (this.totalDirty) this.computeTotal();
    return this.totalCache;
  }

  get ignoredBeatCount(): number {
    if (this.totalDirty) this.computeTotal();
    return this.ignoredCache;
  }

  // MARK: Zoom & Beat math (EditorState.swift)

  static visibleBeats(z: number): number {
    // EditorState.swift :: EditorState.visibleBeats(forLevel:)
    const zz = Math.max(0.0, Math.min(EditorState.zoomCount - 1, z));
    if (zz <= 15.0) return 16.0 * Math.pow(1.0 / 16.0, zz / 15.0);
    return Math.pow(1.0 / 32.0, zz - 15.0);
  }

  static levelForVisibleBeats(v: number): number {
    // EditorState.swift :: EditorState.level(forVisibleBeats:)
    const vb = Math.max(1.0 / 32.0, Math.min(16.0, v));
    if (vb >= 1.0) return 15.0 * (1.0 - Math.log(vb) / Math.log(16.0));
    return 15.0 + -Math.log(vb) / Math.log(32.0);
  }

  get zoomIndex(): number {
    return Math.round(this.zoomLevel); // EditorState.swift :: EditorState.zoomIndex
  }

  get visibleBeats(): number {
    return EditorState.visibleBeats(this.zoomLevel); // EditorState.swift :: EditorState.visibleBeats
  }

  get stripBeats(): number {
    return 4.6; // EditorState.swift :: EditorState.stripBeats
  }

  get stripScrollBeats(): number {
    return this.visibleBeats; // EditorState.swift :: EditorState.stripScrollBeats
  }

  get zoomLabel(): string {
    return this.zoomIndex >= 16 ? '1/32拍' : `${this.zoomIndex + 1}/16`; // EditorState.swift :: EditorState.zoomLabel
  }

  get maxBeat(): number {
    return Math.max(1, this.timeMap.beatAtSec(this.totalSec)); // EditorState.swift :: EditorState.maxBeat
  }

  recomputeTotal(): void {
    this.totalDirty = true;
    this.densityDirty = true;
  }

  private computeTotal(): void {
    // EditorState.swift :: EditorState.computeTotal()
    this.totalDirty = false;
    const audioSec = (this.song?.duration ?? 0) + (this.chart.offsetMs ?? 0) / 1000.0;
    const limitSec = audioSec > 1 ? audioSec + 60.0 : 3.0 * 3600.0;
    const limitBeat = this.timeMap.beatAtSec(limitSec);
    let last = 0.0;
    let ignored = 0;
    for (const n of this.chart.notes) {
      const s = n.beat.value;
      if (Number.isFinite(s) && Math.abs(s) <= limitBeat) {
        if (s > last) last = s;
      } else {
        ignored += 1;
        continue;
      }
      for (const g of n.segs) {
        const b = s + g.beat.value;
        if (Number.isFinite(b) && Math.abs(b) <= limitBeat) {
          if (b > last) last = b;
        } else {
          ignored += 1;
        }
      }
    }
    this.ignoredCache = ignored;
    const noteSec = this.timeMap.secAtBeat(last) + 2.0; // EditorState.swift :: EditorState.computeTotal()
    this.totalCache = Math.max(audioSec, noteSec, 1.0); // EditorState.swift :: EditorState.computeTotal()
  }

  seekDensityRatios(): number[] {
    if (this.densityDirty || this.densityTotal !== this.totalSec || this.densityRatios.length === 0) {
      const counts = SeekDensity.counts(this.chart.notes, this.timeMap, this.totalSec);
      this.densityRatios = SeekDensity.ratios(counts);
      this.densityTotal = this.totalSec;
      this.densityDirty = false;
    }
    return this.densityRatios;
  }

  currentSec(): number {
    // EditorState.swift :: EditorState.currentSec()
    if (!this.isPlaying) return this.timeMap.secAtBeat(this._viewBeat);
    return this.playSec(this.frameHost);
  }

  private playSec(host: number): number {
    // EditorState.swift :: EditorState.playSec(atHost:)
    if (this.useEngine && this.engineAudio) {
      return Math.max(this.startSec, this.engineAudio.chartTime(host));
    }
    return this.startSec + Math.max(0, host - this.startWall) * this.rateNow;
  }

  currentBeat(): number {
    // EditorState.swift :: EditorState.currentBeat()
    return this.isPlaying ? this.timeMap.beatAtSec(this.currentSec()) : this._viewBeat;
  }

  get fxEffectMap(): EffectMap {
    // EditorState+FX.swift :: EditorState.fxEffectMap
    const key =
      this.chart.effects.map((e) => `${e.beat.label}:${e.kind}:${e.value}`).join('|') +
      '::' +
      this.chart.times.map((t) => `${t.beat.label}:${t.bpm}`).join('|');
    if (this.fxKey === key) return this.fxCache;
    const events: EffectEvent[] = [...this.chart.effects]
      .sort((a, b) => Beat.compare(a.beat, b.beat))
      .map((e) => ({
        t: this.timeMap.secAtBeat(e.beat.value),
        scroll: e.kind === 'scroll' ? e.value : null,
        jumpMs: e.kind === 'jump' ? e.value : 0,
      }));
    this.fxCache = EffectMap.make(events);
    this.fxKey = key;
    return this.fxCache;
  }

  geo(width: number, height: number): LaneGeo {
    // EditorState.swift :: EditorState.geo(_:)
    const ppb = height / this.visibleBeats;
    const fx = this.fxMode ? new FXWarp(this.fxEffectMap, this.timeMap, this.currentSec()) : null;
    return new LaneGeo(width, height, this.currentBeat(), ppb, fx);
  }

  timeString(sec: number): string {
    // EditorState.swift :: EditorState.timeString(_:)
    const s = Math.max(0, sec);
    const ms = Math.round(s * 1000);
    const min = Math.floor(ms / 60000);
    const secPart = Math.floor(ms / 1000) % 60;
    const msPart = ms % 1000;
    return `${String(min).padStart(2, '0')}:${String(secPart).padStart(2, '0')}.${String(msPart).padStart(3, '0')}`;
  }

  // MARK: Playback (GameAudio sample clock + requestAnimationFrame)

  togglePlay(): void {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  play(): void {
    if (this.isPlaying) return; // EditorState.swift :: EditorState.play()
    this.popup = 'none';
    unlockAudioContext();
    KeySound.shared.prepare();
    if (!this.engineAudio && this.song) {
      this.prepareEngineAudio();
    }
    const sec = Math.max(0, this.timeMap.secAtBeat(this._viewBeat));
    const offSec = this.chart.offsetMs / 1000.0;
    if (this.engineAudio) {
      this.useEngine = true;
      this.engineAudio.setSharpStretch(this._sharpStretch);
      this.engineAudio.setRate(this.playSpeed);
      this.engineAudio.begin(sec, offSec);
      const stretchTag = this.playSpeed < 1.0 ? `・伸ばした音(${this.engineAudio.stretchEngine})` : '';
      this.playInfo = `再生開始の下ごしらえ ${Math.round(this.engineAudio.lastBeginMs)} ms (${this.engineAudio.lastBeginWarm ? '準備済み' : '初回準備'}${stretchTag})`;
    } else {
      this.useEngine = false;
      this.playInfo = '';
    }
    const now = performance.now() / 1000.0;
    this.startSec = sec;
    this.startWall = now + EditorState.playLead; // EditorState.swift :: EditorState.play()
    this.rateNow = this.playSpeed;
    this.keyDone = sec - 0.000001; // EditorState.swift :: play() - trigger notes right at start beat
    this.frameHost = now;
    this.isPlaying = true;
    this.emitUI();
    this.startFrameLoop();
  }

  pause(): void {
    if (!this.isPlaying) return; // EditorState.swift :: EditorState.pause()
    const b = this.timeMap.beatAtSec(this.currentSec());
    this.stopFrameLoop();
    if (this.useEngine && this.engineAudio) {
      const q = this.engineAudio.queueStats();
      if (this.engineAudio.rate < 1.0) {
        if (q.min >= 0) {
          this.playInfo += ` / 先読みの残り最小 ${q.min}/${q.target}`;
        } else {
          this.playInfo += ` / 先読みが目標(${q.target})に届く前に停止`;
        }
      }
      this.engineAudio.halt();
    }
    KeySound.shared.cancelScheduled();
    this.isPlaying = false;
    this._viewBeat = Math.min(Math.max(0, b), this.maxBeat);
    this.emitUI();
  }

  private rebuildKeyTimes(): void {
    // EditorState.swift :: EditorState.rebuildKeyTimes()
    const out: number[] = [];
    for (const n of this.chart.notes) {
      out.push(this.timeMap.secAtBeat(n.beat.value));
    }
    out.sort((a, b) => a - b);
    const uniq: number[] = [];
    for (const t of out) {
      if (uniq.length > 0 && t - uniq[uniq.length - 1] < 0.001) continue; // 同時押しは1発にまとめる
      uniq.push(t);
    }
    this.keyTimes = uniq;
    this.keyDirty = false;
  }

  private scheduleKeySounds(nowHost: number): void {
    // EditorState.swift :: EditorState.scheduleKeySounds(now:)
    if (!this.isPlaying) return;
    const eng = this.useEngine ? this.engineAudio : null;
    if (eng) {
      const nowCtx = eng.currentAudioTime;
      const horizon = eng.chartTimeAtCtx(nowCtx + EditorState.keyLookahead);
      if (horizon <= this.keyDone) return;
      if (this._noteVolume <= 0.001) {
        this.keyDone = horizon;
        return;
      }
      if (this.keyDirty) this.rebuildKeyTimes();
      if (this.keyTimes.length === 0) {
        this.keyDone = horizon;
        return;
      }
      let lo = 0;
      let hi = this.keyTimes.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (this.keyTimes[mid] <= this.keyDone) lo = mid + 1;
        else hi = mid;
      }
      let i = lo;
      while (i < this.keyTimes.length && this.keyTimes[i] <= horizon) {
        const t = this.keyTimes[i];
        const whenCtx = eng.ctxTimeForChartTime(t);
        if (whenCtx > nowCtx - 0.08) {
          KeySound.shared.playAtCtxTime(whenCtx);
        }
        i += 1;
      }
      this.keyDone = horizon;
      return;
    }

    const horizon =
      this.startSec + (nowHost + EditorState.keyLookahead - this.startWall) * this.rateNow;
    if (horizon <= this.keyDone) return;
    if (this._noteVolume <= 0.001) {
      this.keyDone = horizon;
      return;
    }
    if (this.keyDirty) this.rebuildKeyTimes();
    if (this.keyTimes.length === 0) {
      this.keyDone = horizon;
      return;
    }
    let lo = 0;
    let hi = this.keyTimes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.keyTimes[mid] <= this.keyDone) lo = mid + 1;
      else hi = mid;
    }
    let ctxNow = 0;
    try {
      ctxNow = getSharedAudioContext().currentTime;
    } catch {
      this.keyDone = horizon;
      return;
    }
    let i = lo;
    while (i < this.keyTimes.length && this.keyTimes[i] <= horizon) {
      const t = this.keyTimes[i];
      const hostTarget = this.startWall + (t - this.startSec) / this.rateNow;
      if (hostTarget > nowHost - 0.08) {
        const whenCtx = ctxNow + (hostTarget - nowHost);
        KeySound.shared.playAtCtxTime(whenCtx);
      }
      i += 1;
    }
    this.keyDone = horizon;
  }

  private startFrameLoop(): void {
    this.stopFrameLoop();
    const tick = () => {
      if (!this.isPlaying) return;
      const now = performance.now() / 1000.0;
      this.frameHost = now;
      if (this.useEngine && this.engineAudio) {
        this.engineAudio.refreshAnchor();
      }
      this.scheduleKeySounds(now);
      this.emitFrame();
      if (this.currentSec() > this.totalSec + 0.5) {
        // EditorState.swift :: EditorState.onFrame(_:)
        this.pause();
        return;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopFrameLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  setViewBeat(b: number): void {
    this._viewBeat = Math.min(Math.max(0, b), this.maxBeat); // EditorState.swift :: EditorState.setViewBeat(_:)
    this.emitUI();
  }

  scrollViewBeat(b: number): void {
    // EditorState.swift :: EditorState.scrollViewBeat(_:)
    if (!this.snapViewToLFB || !Number.isFinite(b)) {
      this.setViewBeat(b);
      return;
    }
    const den = Math.max(1, this.snapDen);
    let s = Math.round(Math.max(0, b) * den) / den;
    const hi = this.maxBeat;
    if (s > hi) s = Math.floor(hi * den) / den;
    this.setViewBeat(s);
  }

  seekBegin(): void {
    // EditorState.swift :: EditorState.seekBegin()
    this.seekWasPlaying = this.isPlaying;
    if (this.isPlaying) this.pause();
  }

  seek(f: number): void {
    // EditorState.swift :: EditorState.seek(fraction:)
    const sec = Math.min(Math.max(0, f), 1) * this.totalSec;
    this.scrollViewBeat(this.timeMap.beatAtSec(sec));
  }

  seekEnd(): void {
    // EditorState.swift :: EditorState.seekEnd()
    if (this.seekWasPlaying) this.play();
    this.seekWasPlaying = false;
  }

  zoomIn(): void {
    // EditorState.swift :: EditorState.zoomIn()
    this.zoomLevel = Math.min(EditorState.zoomCount - 1, Math.floor(this.zoomLevel) + 1);
    this.emitUI();
  }

  zoomOut(): void {
    // EditorState.swift :: EditorState.zoomOut()
    this.zoomLevel = Math.max(0, Math.ceil(this.zoomLevel) - 1);
    this.emitUI();
  }

  pinchZoom(startVisibleBeats: number, scale: number): void {
    // EditorState.swift :: EditorState.pinchZoom(startVisibleBeats:scale:)
    if (!Number.isFinite(scale) || scale <= 0.01) return;
    this.zoomLevel = EditorState.levelForVisibleBeats(startVisibleBeats / scale);
    this.emitUI();
  }

  setSpeed(v: number): void {
    // EditorState.swift :: EditorState.setSpeed(_:)
    const nv = Math.min(Math.max(v, EditorState.speedMin), EditorState.speedMax);
    const was = this.isPlaying;
    if (was) this.pause();
    this.playSpeed = nv;
    this.popup = 'none';
    this.emitUI();
    if (was) this.play();
  }

  setDivide(d: number): void {
    // EditorState.swift :: EditorState.setDivide(_:)
    const nd = Math.min(Math.max(Math.trunc(d), EditorState.divideMin), EditorState.divideMax);
    this.snapDen = nd;
    this.chart.setTest('divide', nd);
    this.popup = 'none';
    this.scheduleSave();
    this.emitUI();
  }

  applyDivideInput(text: string): void {
    // EditorState.swift :: EditorState.applyDivideInput(_:)
    let t = normalizeNumberInput(text).trim();
    if (t.startsWith('1/')) t = t.slice(2);
    const v = Number.parseInt(t, 10);
    if (!Number.isFinite(v) || !/^[+-]?\d+$/.test(t)) {
      this.showToast('分割は 2〜1024 の整数で入力してください');
      return;
    }
    this.setDivide(v);
    if (this.snapDen !== v) {
      this.showToast(`分割を 1/${this.snapDen} にしました (入力できるのは 1/2〜1/1024)`);
    }
  }

  get smallTextBoost(): number {
    // EditorState.swift :: EditorState.smallTextBoost
    return this.compactLayout ? this.smallTextScale : 1;
  }

  openSidePanel(panel: SidePanel): void {
    // SideWindow.swift :: EditorState.openSidePanel(_:)
    this.popup = 'none';
    this.sidePanel = panel;
    this.emitUI();
  }

  closeSidePanel(): void {
    // SideWindow.swift :: EditorState.closeSidePanel()
    if (this.sidePanel === null) return;
    this.sidePanel = null;
    this.emitUI();
  }

  // MARK: FX (EditorState+FX.swift)

  toggleFX(): void {
    this.setFX(!this.fxMode);
  }

  setFX(on: boolean): void {
    // EditorState+FX.swift :: EditorState.setFX(_:)
    if (this.fxMode === on) return;
    if (on) {
      if (this.editing) this.leaveEdit();
      this.popup = 'none';
      this.showToast('FX: scroll / jump を反映して表示します (見るだけ。編集するときは FX を切ってください)');
    }
    this.fxMode = on;
    this.emitUI();
  }

  setEditing(on: boolean): void {
    if (on) {
      this.popup = 'none';
      this.setFX(false); // EditorView.swift :: RightPanel.mainButtons
      this.editing = true;
      this.emitUI();
    } else {
      this.leaveEdit();
    }
  }

  leaveEdit(): void {
    // EditorState+FX.swift :: EditorState.leaveEdit()
    this.stopPlugin();
    this.stopInteractivePlugin();
    this.advOpen = false;
    this.editing = false;
    this._tool = 'unselected';
    this.slideDraft = null;
    this.selectedIDs = new Set();
    this.lassoPoints = [];
    this.rangeStart = null;
    this.rangeEnd = null;
    this.modifySlideID = null;
    this.modifySegIndex = null;
    this.ghost = null;
    this.popup = 'none';
    this.emitUI();
  }

  // MARK: Undo / Redo (EditorState.swift)

  pushUndo(): void {
    // EditorState.swift :: EditorState.pushUndo()
    const snap = this.chart.cloneForSnapshot();
    this.undoStack.push(snap);
    if (this.undoStack.length > 60) this.undoStack.shift(); // EditorState.swift :: pushUndo cap 60
    this.redoStack = [];
    this.undoCount = this.undoStack.length;
    this.redoCount = 0;
  }

  dropLastUndo(): void {
    // EditorState.swift :: EditorState.dropLastUndo()
    if (this.undoStack.length === 0) return;
    this.undoStack.pop();
    this.undoCount = this.undoStack.length;
  }

  undo(): void {
    // EditorState.swift :: EditorState.undo()
    const s = this.undoStack.pop();
    if (!s) return;
    this.modifySegIndex = null;
    this.redoStack.push(this.chart.cloneForSnapshot());
    this.chart.notes = s.notes;
    this.chart.times = s.times;
    this.chart.effects = s.effects;
    this.undoCount = this.undoStack.length;
    this.redoCount = this.redoStack.length;
    this.chartChanged();
  }

  redo(): void {
    // EditorState.swift :: EditorState.redo()
    const s = this.redoStack.pop();
    if (!s) return;
    this.modifySegIndex = null;
    this.undoStack.push(this.chart.cloneForSnapshot());
    this.chart.notes = s.notes;
    this.chart.times = s.times;
    this.chart.effects = s.effects;
    this.undoCount = this.undoStack.length;
    this.redoCount = this.redoStack.length;
    this.chartChanged();
  }

  chartChanged(): void {
    // EditorState.swift :: EditorState.chartChanged()
    this.chart.bumpNotesRevision();
    this.pruneSelection();
    this.timeMap = new TimeMap(this.chart.times);
    this.keyDirty = true;
    this.recomputeTotal();
    this.scheduleSave();
    this.emitUI();
  }

  private pruneSelection(): void {
    // EditorState.swift :: EditorState.pruneSelection()
    if (this.modifySlideID !== null && this.indexOfNote(this.modifySlideID) === null) {
      this.modifySlideID = null;
    }
    if (this.modifySegIndex !== null) {
      const i = this.modifySlideIndex;
      if (i === null || this.modifySegIndex >= this.chart.notes[i].segs.length) {
        this.modifySegIndex = null;
      }
    }
    if (this.selectedIDs.size === 0 && this.orderIDs.length === 0) return;
    if (this.selectedIDs.size > 0) {
      const alive = this.aliveSubset(this.selectedIDs);
      if (alive) this.selectedIDs = alive;
    }
    if (this.orderIDs.length > 0) {
      const alive = this.aliveSubset(new Set(this.orderIDs));
      if (alive) this.orderIDs = this.orderIDs.filter((id) => alive.has(id));
    }
  }

  private aliveSubset(ids: Set<NoteID>): Set<NoteID> | null {
    const found = new Set<NoteID>();
    for (const n of this.chart.notes) {
      if (ids.has(n.id)) {
        found.add(n.id);
        if (found.size === ids.size) return null;
      }
    }
    return found;
  }

  // MARK: NoteIndex (EditorState.swift)

  private get currentNoteIndex(): NoteIndex {
    const rev = this.chart.notesRevision;
    if (rev !== this.noteIndexRevision) {
      this.noteIndexCache = new NoteIndex();
      this.noteIndexRevision = rev;
    }
    return this.noteIndexCache;
  }

  indexOfNote(id: NoteID): number | null {
    const ns = this.chart.notes;
    if (this.memoPos >= 0 && this.memoPos < ns.length && this.memoID === id && ns[this.memoPos].id === id) {
      return this.memoPos;
    }
    const p = this.currentNoteIndex.positionOfID(id, ns);
    if (p === undefined) return null;
    this.memoID = id;
    this.memoPos = p;
    return p;
  }

  notesOverlapping(lo: number, hi: number): number[] {
    return this.currentNoteIndex.indices(lo, hi, this.chart.notes);
  }

  visibleNoteIndices(g: LaneGeo): number[] {
    // EditorState.swift :: EditorState.visibleNoteIndices(_:)
    const ppb = g.ppb;
    if (!Number.isFinite(ppb) || ppb <= 0) return this.chart.notes.map((_, i) => i);
    const margin = 0.05 + 40.0 / ppb;
    return this.notesOverlapping(g.beatOf(g.H) - margin, g.beatOf(0) + margin);
  }

  // MARK: Save / Toast

  reportSessionSaveError(message: string): void {
    if (!this.sessionPersistenceEnabled) return;
    this.saveStatus = '保存失敗';
    this.showToast(message, 5.0);
  }

  private handleSessionSaveResult(res: SessionSaveResult): void {
    if (!this.sessionPersistenceEnabled) return;
    if (res.ok) {
      if (this.saveTimer === null) {
        this.saveStatus = '保存済み';
        this.emitUI();
      }
      return;
    }
    this.reportSessionSaveError(res.message);
  }

  scheduleSave(): void {
    // EditorState.swift :: EditorState.scheduleSave()
    this.saveStatus = '未保存…';
    if (this.saveTimer !== null) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      this.saveTimer = null;
      const serialized = this.chart.serialized();
      try {
        localStorage.setItem('malody_slide_editor.lastChart', serialized);
      } catch {
        // Ignore small localStorage cap; IndexedDB handles large charts
      }
      if (!this.sessionPersistenceEnabled) return;
      this.emitUI();
      void EditorSessionStorage.saveChart({
        mcText: serialized,
        mcName: this.mcName,
        oggFileName: this.oggFileName,
        bgFileName: this.bgFileName,
      }).then((res) => this.handleSessionSaveResult(res));
    }, 1200); // EditorState.swift :: scheduleSave deadline 1.2s
  }

  saveNow(): void {
    // EditorState.swift :: EditorState.saveNow()
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const serialized = this.chart.serialized();
    try {
      localStorage.setItem('malody_slide_editor.lastChart', serialized);
    } catch {
      // Ignore small localStorage cap; IndexedDB handles large charts
    }
    if (!this.sessionPersistenceEnabled) return;
    this.emitUI();
    void EditorSessionStorage.saveChart({
      mcText: serialized,
      mcName: this.mcName,
      oggFileName: this.oggFileName,
      bgFileName: this.bgFileName,
    }).then((res) => this.handleSessionSaveResult(res));
  }

  flushPendingSave(): void {
    if (this.saveTimer !== null && this.sessionPersistenceEnabled) {
      this.saveNow();
    }
  }

  dispose(): void {
    this.sessionPersistenceEnabled = false;
    this.stopPlugin();
    if (this.isPlaying) this.pause();
    KeySound.shared.cancelScheduled();
    this.engineAudio?.shutdown();
    this.engineAudio = null;
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    if (this.holdTimer !== null) {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    if (this.ownedBgUrl) {
      URL.revokeObjectURL(this.ownedBgUrl);
      this.ownedBgUrl = null;
    }
  }

  showToast(s: string, seconds = 2.2): void {
    // EditorState.swift :: EditorState.showToast(_:seconds:)
    this.toast = s;
    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast = null;
      this.emitUI();
    }, seconds * 1000);
    this.emitUI();
  }

  showPluginNotice(s: string): void {
    // EditorState.swift :: EditorState.showPluginNotice(_:)
    this.showToast(s, Math.min(6.0, 2.2 + s.length * 0.05));
  }

  // MARK: UIAdjust (UIAdjust.swift)

  enterUIAdjust(): void {
    // UIAdjust.swift :: EditorState.enterUIAdjust()
    if (this.isPlaying) this.pause();
    this.popup = 'none';
    if (this.sidePanel !== null) this.closeSidePanel();
    this.uiAdjustMode = true;
    this.emitUI();
  }

  exitUIAdjust(): void {
    // UIAdjust.swift :: EditorState.exitUIAdjust()
    this.uiAdjustMode = false;
    this.emitUI();
  }

  resetUIAdjust(compact = this.compactLayout): void {
    // UIAdjust.swift :: EditorState.resetUIAdjust()
    this.stripWidth = UIAdjustConstants.stripWidthDefault;
    this.rightPanelWidth = compact
      ? UIAdjustConstants.panelWidthPhone
      : UIAdjustConstants.panelWidthDefault;
  }

  // MARK: Meta menu (EditorState+Meta.swift)

  openMetaMenu(): void {
    this.popup = 'none';
    this.metaOpen = true;
    this.emitUI();
  }

  closeMetaMenu(): void {
    this.metaOpen = false;
    this.emitUI();
  }

  quitEditor(): void {
    // EditorState+Meta.swift :: EditorState.quitEditor()
    this.stopPlugin();
    this.stopInteractivePlugin();
    this.advOpen = false;
    this.pluginDialog = null;
    if (this.isPlaying) this.pause();
    if (this.saveTimer !== null) {
      window.clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.sessionPersistenceEnabled = false;
    try {
      localStorage.removeItem('malody_slide_editor.lastChart');
    } catch {
      // Ignore storage errors
    }
    void EditorSessionStorage.clearSession();
    this.onClose?.();
  }

  metaChanged(): void {
    // EditorState.swift :: EditorState.metaChanged()
    this.recomputeTotal();
    this.scheduleSave();
    this.emitUI();
  }

  setOffset(ms: number): void {
    // EditorState.swift :: EditorState.setOffset(_:)
    if (this.isPlaying) this.pause();
    this.chart.offsetMs = ms;
    this.metaChanged();
  }

  applyBackground(bytes: Uint8Array, sourceName = ''): string | null {
    // EditorState.swift :: EditorState.applyBackground(jpeg:)
    let name = this.chart.metaString(['background']).trim();
    if (!name) name = this.bgFileName.trim();
    if (!name) name = sourceName.trim();
    name = replaceExtWithJpg(name, 'bg.jpg');

    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const mime = detectImageMime(copy, name) || 'image/jpeg';
    const nextUrl = URL.createObjectURL(new Blob([copy], { type: mime }));
    if (this.ownedBgUrl) {
      URL.revokeObjectURL(this.ownedBgUrl);
    }
    this.ownedBgUrl = nextUrl;
    this.bgUrl = nextUrl;
    this.bgData = copy;
    this.bgFileName = name;
    this.chart.setMetaString(['background'], name);
    this.metaChanged();
    this.showToast(`背景を写真に入れ替えました (${name})`);
    if (this.sessionPersistenceEnabled) {
      void EditorSessionStorage.saveBackground(copy, name).then((res) => {
        if (!res.ok) this.handleSessionSaveResult(res);
      });
      this.saveNow();
    }
    return name;
  }

  setBackgroundBytes(bytes: Uint8Array | null, fileName = ''): void {
    if (this.ownedBgUrl) {
      URL.revokeObjectURL(this.ownedBgUrl);
      this.ownedBgUrl = null;
    } else if (this.bgUrl) {
      URL.revokeObjectURL(this.bgUrl);
    }
    if (bytes) {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const mime = detectImageMime(copy, fileName);
      const nextUrl = URL.createObjectURL(mime ? new Blob([copy], { type: mime }) : new Blob([copy]));
      this.ownedBgUrl = nextUrl;
      this.bgUrl = nextUrl;
      this.bgData = copy;
      this.bgFileName = fileName;
    } else {
      this.bgUrl = null;
      this.bgData = null;
      this.bgFileName = '';
    }
    if (this.sessionPersistenceEnabled) {
      void EditorSessionStorage.saveBackground(this.bgData, this.bgFileName).then((res) => {
        if (!res.ok) this.handleSessionSaveResult(res);
      });
      this.saveNow();
    } else {
      this.emitUI();
    }
  }

  setAudio(song: SongPCM | null, bytes: Uint8Array | null, fileName = ''): void {
    if (this.isPlaying) this.pause();
    if (this.engineAudio) {
      this.engineAudio.shutdown();
      this.engineAudio = null;
    }
    this.song = song;
    if (bytes) {
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      this.oggData = copy;
      this.oggFileName = fileName;
    } else {
      this.oggData = null;
      this.oggFileName = '';
    }
    if (song) {
      this.prepareEngineAudio();
      this.applyVolumes();
    }
    this.recomputeTotal();
    if (this._viewBeat > this.maxBeat) {
      this._viewBeat = this.maxBeat;
    }
    if (this.sessionPersistenceEnabled) {
      void EditorSessionStorage.saveAudio(this.oggData, this.oggFileName).then((res) => {
        if (!res.ok) this.handleSessionSaveResult(res);
      });
      this.saveNow();
    } else {
      this.emitUI();
    }
  }

  overflowNotes(): { count: number; firstBeat: Beat | null } {
    // EditorState+Meta.swift :: EditorState.overflowNotes()
    let count = 0;
    let first: Beat | null = null;
    for (const n of this.chart.notes) {
      const half = n.w / 2;
      let bad = n.x - half < 0 || n.x + half > 255;
      if (!bad) {
        for (const s of n.segs) {
          const ax = n.x + s.x;
          if (ax - half < 0 || ax + half > 255) {
            bad = true;
            break;
          }
        }
      }
      if (bad) {
        count += 1;
        if (!first || Beat.compare(n.beat, first) < 0) first = n.beat;
      }
    }
    return { count, firstBeat: first };
  }

  fixOverflowNotes(): void {
    // EditorState+Meta.swift :: EditorState.fixOverflowNotes()
    const { count } = this.overflowNotes();
    if (count === 0) {
      this.showToast('はみ出しているノーツはありません', 2.6);
      return;
    }
    this.pushUndo();
    for (const n of this.chart.notes) {
      let relMin = 0;
      let relMax = 0;
      for (const s of n.segs) {
        if (s.x < relMin) relMin = s.x;
        if (s.x > relMax) relMax = s.x;
      }
      n.x = this.laneFittedHead(n.x, n.w, relMin, relMax, null);
    }
    this.chartChanged();
    const { count: rest } = this.overflowNotes();
    if (rest === 0) {
      this.showToast(`${count} 個のノーツを枠に収めました (Undo で戻せます)`, 2.6);
    } else {
      this.showToast(
        `${count} 個を内側へ寄せました。幅が広すぎて収まりきらないものが ${rest} 個あります`,
        3.2
      );
    }
  }

  async shareMCZNow(): Promise<void> {
    try {
      const { blob, fileName } = await exportMCZBlob({
        chart: this.chart,
        mcName: this.mcName,
        audioData: this.oggData,
        audioFileName: this.oggFileName,
        bgData: this.bgData,
        bgFileName: this.bgFileName,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.showToast(`エクスポートしました (${fileName})`);
    } catch (e) {
      this.showToast(`エクスポートに失敗しました: ${String(e)}`);
    }
  }

  reviewChart(): void {
    // EditorState+Meta.swift :: EditorState.reviewChart()
    const beat = this.firstOverlapBeat();
    if (beat) {
      if (this.isPlaying) this.pause();
      this.setViewBeat(beat.value);
    } else {
      this.reviewNoticeTick += 1;
      this.emitUI();
    }
  }

  private firstOverlapBeat(): Beat | null {
    // EditorState+Meta.swift :: EditorState.firstOverlapBeat()
    const minGap = 1.0;
    const taps: { beat: Beat; left: number; right: number }[] = [];
    for (const n of this.chart.notes) {
      if (isSlideNote(n) || isWipeNote(n)) continue;
      const half = n.w / 2;
      taps.push({ beat: n.beat, left: n.x - half, right: n.x + half });
    }
    taps.sort((a, b) => {
      const c = Beat.compare(a.beat, b.beat);
      return c !== 0 ? c : a.left - b.left;
    });
    let i = 0;
    while (i < taps.length) {
      const beat = taps[i].beat;
      let maxRight = taps[i].right;
      let j = i + 1;
      while (j < taps.length && taps[j].beat.equals(beat)) {
        if (taps[j].left - maxRight < minGap) return beat;
        maxRight = Math.max(maxRight, taps[j].right);
        j += 1;
      }
      i = j;
    }
    return null;
  }

  loadChartJSON(jsonText: string, mcName = 'chart.mc'): void {
    const parsed = ChartData.parse(jsonText);
    parsed.times.sort((a, b) => Beat.compare(a.beat, b.beat));
    if (this.isPlaying) this.pause();
    this.chart = parsed;
    this.mcName = mcName;
    this.timeMap = new TimeMap(parsed.times);
    const d = parsed.testInt('divide');
    if (d !== undefined && d >= EditorState.divideMin && d <= EditorState.divideMax) {
      this.snapDen = d;
    }
    this.undoStack = [];
    this.redoStack = [];
    this.undoCount = 0;
    this.redoCount = 0;
    this.selectedIDs = new Set();
    this.orderIDs = [];
    this.modifySlideID = null;
    this.modifySegIndex = null;
    this.slideDraft = null;
    this.ghost = null;
    this.rangeStart = null;
    this.rangeEnd = null;
    this.lassoPoints = [];
    this.sidePanel = null;
    this.viewBeat = 0;
    this.recomputeTotal();
    this.saveNow();
  }

  // MARK: Snap & Width Helpers (EditorState+Tools.swift)

  snapBeat(v: number): Beat {
    return Beat.nearest(Math.max(0, v), this.snapDen); // EditorState+Tools.swift :: snapBeat(_:)
  }

  snapNote(centerX: number, wu: number): { x: number; w: number } {
    // EditorState+Tools.swift :: snapNote(centerX:widthUnits:)
    if (this.gridAlign && this.gridLines >= 1) {
      const n = this.gridLines;
      const cell = 255.0 / n;
      const cells = Math.min(n, Math.max(1, Math.round(wu / cell)));
      const w = Math.max(1, Math.round(cell * cells));
      const j = Math.max(0, Math.min(n, Math.round(centerX / cell)));
      return { x: this.laneFitted(Math.round(cell * j), w), w };
    }
    const w = Math.max(1, Math.min(255, wu));
    const cx = Math.max(0, Math.min(255, Math.round(centerX)));
    return { x: this.laneFitted(cx, w), w };
  }

  laneCenterRange(w: number): [number, number] {
    // EditorState+Tools.swift :: laneCenterRange(width:)
    const lo = Math.trunc((Math.max(1, Math.min(255, w)) + 1) / 2);
    const hi = 255 - lo;
    return lo <= hi ? [lo, hi] : [hi, lo];
  }

  laneFitted(x: number, w: number): number {
    // EditorState+Tools.swift :: laneFitted(_:width:)
    if (this.allowNoteOverflow) return x;
    const [lo, hi] = this.laneCenterRange(w);
    return Math.max(lo, Math.min(hi, x));
  }

  laneFittedHead(head: number, w: number, relMin: number, relMax: number, origHead: number | null): number {
    // EditorState+Tools.swift :: laneFittedHead(_:width:relMin:relMax:origHead:)
    const [rLo, rHi] = this.laneCenterRange(w);
    let minAbs = rLo;
    let maxAbs = rHi;
    if (origHead !== null) {
      minAbs = Math.min(minAbs, origHead + relMin);
      maxAbs = Math.max(maxAbs, origHead + relMax);
    }
    const lo = minAbs - relMin;
    const hi = maxAbs - relMax;
    return Math.max(lo, Math.min(hi, head));
  }

  private segSpan(n: Note): { min: number; max: number } {
    let lo = 0;
    let hi = 0;
    for (const s of n.segs) {
      lo = Math.min(lo, s.x);
      hi = Math.max(hi, s.x);
    }
    return { min: lo, max: hi };
  }

  gridLineX(j: number): number {
    const cell = 255.0 / Math.max(1, this.gridLines);
    return Math.round(cell * j);
  }

  nearestGridIndex(x: number): number {
    const n = Math.max(1, this.gridLines);
    const cell = 255.0 / n;
    return Math.min(n, Math.max(0, Math.round(x / cell)));
  }

  snapWidth(wu: number): number {
    // EditorState+Tools.swift :: snapWidth(_:)
    if (this.gridAlign && this.gridLines >= 1) {
      const cell = 255.0 / this.gridLines;
      const cells = Math.min(this.gridLines, Math.max(1, Math.round(wu / cell)));
      return Math.max(1, Math.round(cell * cells));
    }
    return Math.max(1, Math.min(255, wu));
  }

  // MARK: Lane Interaction (EditorState+Tools.swift)

  get laneToolActive(): boolean {
    return this.editing && this._tool !== 'unselected' && !this.fxMode; // EditorState+Tools.swift :: laneToolActive
  }

  holdBegan(): void {
    // EditorState+Tools.swift :: holdBegan()
    this.holdCancel();
    if (this.selectedIDs.size === 0) return;
    this.holdTimer = window.setTimeout(() => {
      this.holdTimer = null;
      this.holdFired();
    }, this.holdDeselectSec * 1000);
  }

  holdCancel(): void {
    if (this.holdTimer !== null) {
      window.clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  private holdFired(): void {
    if (this.laneToolActive || this.selectedIDs.size === 0) return;
    this.selectedIDs = new Set();
    this.showToast('選択を解除しました');
  }

  toggleTool(t: EditTool): void {
    this.tool = this._tool === t ? 'unselected' : t;
  }

  removeButtonTapped(): void {
    // EditorState+Tools.swift :: removeButtonTapped()
    if (this.selectedIDs.size === 0 || this._tool === 'slideModify') {
      this.toggleTool('remove');
    } else if (this.removeSelected()) {
      this.tool = 'remove';
    }
  }

  removeSelected(): boolean {
    if (this.isPlaying) {
      this.showToast('再生中は編集できません。停止してから操作してください');
      return false;
    }
    const ids = this.selectedIDs;
    const before = this.chart.notes.length;
    if (!this.chart.notes.some((n) => ids.has(n.id))) {
      this.selectedIDs = new Set();
      this.emitUI();
      return true;
    }
    this.pushUndo();
    this.chart.notes = this.chart.notes.filter((n) => !ids.has(n.id));
    const removed = before - this.chart.notes.length;
    this.selectedIDs = new Set();
    this.chartChanged();
    this.showToast(`ノーツを ${removed} 個削除しました`);
    return true;
  }

  laneTouch(start: Point2D, current: Point2D, size: { width: number; height: number }, phase: LanePhase): void {
    // EditorState+Tools.swift :: laneTouch(start:current:size:phase:)
    const g = this.geo(size.width, size.height);

    if (this._tool === 'plugin') {
      if (phase === 'began') this.dragMoved = false;
      if (hypot(current.x - start.x, current.y - start.y) > 10) this.dragMoved = true;
      if (this.isPlaying) {
        if (phase === 'ended') {
          this.showToast('再生中は編集できません。停止してから操作してください');
        }
        if (phase === 'ended') this.dragMoved = false;
        return;
      }
      this.pluginTouch(start, current, g, phase);
      if (phase === 'ended') this.dragMoved = false;
      return;
    }

    if (phase === 'began') {
      if (this.dragMode === 'moving') this.finishMove();
      if (this.dragMode === 'segDrag') this.finishSegDrag();
      this.resetDragState();
      if (this.isPlaying) {
        this.dragMode = 'ignore';
      } else {
        this.beginTouch(start, g);
      }
    }
    if (this.dragMode === 'idle') return;

    if (hypot(current.x - start.x, current.y - start.y) > 10) this.dragMoved = true;

    if (this.dragMode === 'pendingMove' && this.dragMoved) {
      this.beginMove();
    }

    switch (this.dragMode) {
      case 'moving':
        this.applyMove(start, current, g);
        if (phase === 'ended') this.finishMove();
        break;
      case 'pendingMove':
        if (phase === 'ended' && this.dragToggleOnTap && !this.dragMoved && this.dragTouchedID !== null) {
          const next = new Set(this.selectedIDs);
          next.delete(this.dragTouchedID);
          this.selectedIDs = next;
          this.emitUI();
        }
        break;
      case 'segDrag':
        if (this.dragMoved) this.dragSeg(current, g);
        if (phase === 'ended') this.finishSegDrag();
        break;
      case 'lasso':
        this.lassoTouch(current, g, phase === 'ended');
        break;
      case 'place':
      case 'legacy':
        this.laneDrag(start, current, size, phase === 'ended');
        break;
      case 'ignore':
        if (phase === 'ended' && this.isPlaying) {
          this.showToast('再生中は編集できません。停止してから操作してください');
        }
        break;
    }

    if (phase === 'ended') this.resetDragState();
  }

  private resetDragState(): void {
    this.dragMode = 'idle';
    this.dragMoved = false;
    this.dragTouchedID = null;
    this.dragToggleOnTap = false;
    this.moveTargets = [];
  }

  private beginTouch(p: Point2D, g: LaneGeo): void {
    // EditorState+Tools.swift :: beginTouch(at:g:)
    switch (this._tool) {
      case 'note':
      case 'wipe':
      case 'slide':
        if (this._tool === 'slide' && this.slideDraft !== null) {
          this.dragMode = 'place';
        } else {
          const hit = this.hitNote(p, g);
          if (hit !== null) {
            const id = this.chart.notes[hit].id;
            this.dragTouchedID = id;
            if (this.selectedIDs.has(id)) {
              this.dragToggleOnTap = true;
            } else {
              const next = new Set(this.selectedIDs);
              next.add(id);
              this.selectedIDs = next;
              this.dragToggleOnTap = false;
              this.emitUI();
            }
            this.dragMode = 'pendingMove';
          } else if (this.selectedIDs.size > 0) {
            this.selectedIDs = new Set();
            this.dragMode = 'ignore';
            this.emitUI();
          } else {
            this.dragMode = 'place';
          }
        }
        break;
      case 'slideModify': {
        const hitSeg = this.hitSegAny(p, g);
        if (hitSeg) {
          const [i, j] = hitSeg;
          const n = this.chart.notes[i];
          const s = n.segs[j];
          if (this.modifySlideID !== n.id) this.selectModifySlide(n.id);
          this.modifySegIndex = j;
          this.segDragNoteID = n.id;
          this.segDragIndex = j;
          this.segDragOrig = { beat: s.beat, x: s.x };
          this.segDragGrab = {
            width: g.px(n.x + s.x) - p.x,
            height: g.py(n.beat.value + s.beat.value) - p.y,
          };
          this.segDragUndoPushed = false;
          this.dragMode = 'segDrag';
          this.emitFrame();
        } else {
          this.dragMode = 'legacy';
        }
        break;
      }
      case 'lasso':
        this.lassoPoints = [p];
        this.dragMode = 'lasso';
        this.emitFrame();
        break;
      case 'remove':
      case 'selectRange':
      case 'order':
        this.dragMode = 'legacy';
        break;
      default:
        this.dragMode = 'ignore';
    }
  }

  private laneDrag(start: Point2D, current: Point2D, size: { width: number; height: number }, ended: boolean): void {
    // EditorState+Tools.swift :: laneDrag(start:current:size:ended:)
    if (this.isPlaying) {
      if (ended) this.showToast('再生中は編集できません。停止してから操作してください');
      return;
    }
    const g = this.geo(size.width, size.height);
    const moved = hypot(current.x - start.x, current.y - start.y) > 10; // EditorState+Tools.swift :: laneDrag

    switch (this._tool) {
      case 'order':
        if (ended && !moved) this.orderTap(current, g);
        break;
      case 'note':
      case 'wipe': {
        const b = this.snapBeat(g.beatOf(current.y));
        const p = this.snapNote(g.xOf(current.x), this.widthUnits);
        if (this.ghost !== null) this.ghost = null;
        if (ended) {
          this.addNote({
            beat: b,
            x: p.x,
            w: p.w,
            type: this._tool === 'wipe' ? 4 : undefined,
            segs: [],
            extra: {},
            id: nextNoteID(),
          });
        }
        break;
      }
      case 'slide': {
        const b = this.snapBeat(g.beatOf(current.y));
        const base = this.slideDraftBase();
        const from = this.slideDraftLastPoint();
        if (base && from) {
          const p = this.snapNote(g.xOf(current.x), base.w);
          if (this.ghost !== null) this.ghost = null;
          if (!this.allowUnorderedSeg && b.lessThan(from.beat)) {
            if (ended) this.finishSlide();
          } else if (ended) {
            this.appendDraftSeg(b, p.x);
          }
        } else {
          const p = this.snapNote(g.xOf(current.x), this.widthUnits);
          if (this.ghost !== null) this.ghost = null;
          if (ended) {
            this.slideDraft = { beat: b, x: p.x, w: p.w, noteID: nextNoteID() };
            this.showToast('始点を置きました。続けて seg をタップしてください (終わるときは「完」)');
          }
        }
        break;
      }
      case 'remove':
        if (ended && !moved) {
          const i = this.hitNote(current, g);
          if (i !== null) this.removeTapped(i, current, g);
        }
        break;
      case 'selectRange':
        if (ended && !moved) {
          const b = this.snapBeat(g.beatOf(current.y));
          if (this.rangeStart === null || this.rangeEnd !== null) {
            this.rangeStart = b;
            this.rangeEnd = null;
            this.selectedIDs = new Set();
            this.showToast('始点を設定しました。終点をタップしてください');
          } else {
            const s = this.rangeStart;
            const lo = s.lessThan(b) ? s : b;
            const hi = s.lessThan(b) ? b : s;
            this.rangeStart = lo;
            this.rangeEnd = hi;
            this.selectNotes(lo, hi);
          }
        }
        break;
      case 'slideModify':
        if (ended && !moved) this.slideModifyTap(current, g);
        break;
      default:
        break;
    }
  }

  private beginMove(): void {
    // EditorState+Tools.swift :: beginMove()
    const targets: { index: number; orig: Note }[] = [];
    for (let i = 0; i < this.chart.notes.length; i++) {
      if (this.selectedIDs.has(this.chart.notes[i].id)) {
        targets.push({ index: i, orig: cloneNote(this.chart.notes[i], false) });
      }
    }
    if (targets.length === 0) {
      this.dragMode = 'ignore';
      return;
    }
    let anchor = targets[0].orig.beat;
    if (this.dragTouchedID !== null) {
      const t = targets.find((x) => x.orig.id === this.dragTouchedID);
      if (t) anchor = t.orig.beat;
    }
    let minBeat = targets[0].orig.beat;
    let left = 255.0;
    let right = 0.0;
    for (const t of targets) {
      const n = t.orig;
      if (n.beat.lessThan(minBeat)) minBeat = n.beat;
      for (const s of n.segs) {
        const sb = n.beat.add(s.beat);
        if (sb.lessThan(minBeat)) minBeat = sb;
      }
      let minX = n.x;
      let maxX = n.x;
      for (const s of n.segs) {
        const sx = n.x + s.x;
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
      }
      const half = this.allowNoteOverflow ? 0.0 : n.w / 2.0;
      left = Math.min(left, minX - half);
      right = Math.max(right, maxX + half);
    }
    this.moveTargets = targets;
    this.moveAnchorBeat = anchor;
    this.moveMinBeat = minBeat;
    this.moveLeftEdge = left;
    this.moveRightEdge = right;
    this.moveLastDelta = Beat.zero;
    this.moveLastDX = 0;
    this.pushUndo();
    this.dragMode = 'moving';
  }

  private applyMove(start: Point2D, current: Point2D, g: LaneGeo): void {
    // EditorState+Tools.swift :: applyMove(start:current:g:)
    for (const t of this.moveTargets) {
      if (t.index >= this.chart.notes.length || this.chart.notes[t.index].id !== t.orig.id) {
        this.dragMode = 'ignore';
        this.moveTargets = [];
        return;
      }
    }
    const rawBeats = (start.y - current.y) / g.ppb;
    let delta: Beat;
    if (this.resnapExistingNotes) {
      delta = this.snapBeat(this.moveAnchorBeat.value + rawBeats).sub(this.moveAnchorBeat);
    } else {
      delta = Beat.nearest(rawBeats, this.snapDen);
    }
    if (!this.moveMinBeat.lessThan(Beat.zero) && this.moveMinBeat.add(delta).lessThan(Beat.zero)) {
      delta = Beat.zero.sub(this.moveMinBeat);
    }
    const rawX = g.xOf(current.x) - g.xOf(start.x);
    if (this.gridAlign && this.gridLines >= 1 && this.gridCenterAlign) {
      this.applyCenteredMove(rawX, delta);
      return;
    }
    let dx = this.snapDeltaX(rawX);
    const minDX = Math.min(0, Math.ceil(-this.moveLeftEdge));
    const maxDX = Math.max(0, Math.floor(255.0 - this.moveRightEdge));
    dx = Math.max(minDX, Math.min(maxDX, dx));

    if (delta.equals(this.moveLastDelta) && dx === this.moveLastDX) return;
    this.moveLastDelta = delta;
    this.moveLastDX = dx;
    for (const t of this.moveTargets) {
      this.chart.notes[t.index].beat = this.movedBeat(t.orig.beat, delta);
      this.chart.notes[t.index].x = t.orig.x + dx;
    }
    this.emitFrame();
  }

  private movedBeat(orig: Beat, delta: Beat): Beat {
    if (delta.equals(Beat.zero)) return orig;
    const b = orig.add(delta);
    if (this.resnapExistingNotes) return b;
    const g = gcdIntPos(b.numerator, b.d);
    return Beat.ticks(b.numerator / g, b.d / g);
  }

  private applyCenteredMove(rawX: number, delta: Beat): void {
    // EditorState+Tools.swift :: applyCenteredMove(rawX:delta:)
    this.moveLastDelta = delta;
    this.moveLastDX = 0;
    let dirty = false;
    for (const t of this.moveTargets) {
      const orig = t.orig;
      let head = this.centeredMoveX(orig.x, rawX);
      if (!this.allowNoteOverflow) {
        const span = this.segSpan(orig);
        head = this.laneFittedHead(head, orig.w, span.min, span.max, orig.x);
      } else if (orig.segs.length > 0) {
        head = this.keepSegsInLane(head, orig);
      }
      const newBeat = this.movedBeat(orig.beat, delta);
      const cur = this.chart.notes[t.index];
      if (cur.beat.equals(newBeat) && cur.x === head) continue;
      cur.beat = newBeat;
      cur.x = head;
      dirty = true;
    }
    if (dirty) this.emitFrame();
  }

  private keepSegsInLane(head: number, orig: Note): number {
    let relMin = 0;
    let relMax = 0;
    for (const s of orig.segs) {
      relMin = Math.min(relMin, s.x);
      relMax = Math.max(relMax, s.x);
    }
    const n = Math.max(1, this.gridLines);
    const minAbs = Math.min(0, orig.x + relMin);
    const maxAbs = Math.max(255, orig.x + relMax);
    const fits = (h: number) => h + relMin >= minAbs && h + relMax <= maxAbs;
    if (fits(head)) return head;
    let idx = this.nearestGridIndex(head);
    while (idx > 0 && this.gridLineX(idx) + relMax > maxAbs) idx -= 1;
    while (idx < n && this.gridLineX(idx) + relMin < minAbs) idx += 1;
    const h = this.gridLineX(idx);
    return fits(h) ? h : orig.x;
  }

  private centeredMoveX(origX: number, rawX: number): number {
    const n = Math.max(1, this.gridLines);
    const cell = 255.0 / n;
    if (Math.abs(rawX) < cell / 2) return origX;
    return this.gridLineX(this.nearestGridIndex(origX + rawX));
  }

  private snapDeltaX(raw: number): number {
    if (this.gridAlign && this.gridLines >= 1) {
      const cell = 255.0 / this.gridLines;
      return Math.round(Math.round(raw / cell) * cell);
    }
    return Math.round(raw);
  }

  private finishMove(): void {
    // EditorState+Tools.swift :: finishMove()
    let changed = !(this.moveLastDelta.equals(Beat.zero) && this.moveLastDX === 0);
    if (!changed) {
      for (const t of this.moveTargets) {
        if (t.index >= this.chart.notes.length) continue;
        const n = this.chart.notes[t.index];
        if (n.x !== t.orig.x || !n.beat.equals(t.orig.beat) || n.segs.length !== t.orig.segs.length) {
          changed = true;
          break;
        }
        for (let k = 0; k < n.segs.length; k++) {
          if (n.segs[k].x !== t.orig.segs[k].x) {
            changed = true;
            break;
          }
        }
        if (changed) break;
      }
    }
    this.moveTargets = [];
    if (changed) {
      this.chartChanged();
    } else {
      this.dropLastUndo();
      this.emitUI();
    }
  }

  // MARK: Width Slider (EditorState+Tools.swift)

  widthSliderBegan(): void {
    this.widthSliderEnded();
    if (this.selectedIDs.size === 0) return;
    if (this.isPlaying) {
      this.showToast('再生中は選択中のノーツの幅を変えられません。停止してから操作してください');
      return;
    }
    for (let i = 0; i < this.chart.notes.length; i++) {
      if (this.selectedIDs.has(this.chart.notes[i].id)) {
        this.widthTargets.push({ index: i, orig: cloneNote(this.chart.notes[i], false) });
      }
    }
  }

  widthSliderMoved(v: number): void {
    this.widthUnits = v;
    if (this.widthTargets.length === 0) {
      this.emitUI();
      return;
    }
    for (const t of this.widthTargets) {
      if (t.index >= this.chart.notes.length || this.chart.notes[t.index].id !== t.orig.id) {
        this.widthTargets = [];
        this.widthUndoPushed = false;
        this.emitUI();
        return;
      }
    }
    if (!this.widthUndoPushed) {
      this.pushUndo();
      this.widthUndoPushed = true;
    }
    for (const t of this.widthTargets) {
      this.chart.notes[t.index] = this.resized(t.orig, v);
    }
    this.emitUI();
  }

  widthSliderEnded(): void {
    if (this.widthUndoPushed) {
      let changed = false;
      for (const t of this.widthTargets) {
        if (t.index >= this.chart.notes.length) continue;
        const n = this.chart.notes[t.index];
        if (n.x !== t.orig.x || n.w !== t.orig.w) changed = true;
      }
      if (changed) this.chartChanged();
      else {
        this.dropLastUndo();
        this.emitUI();
      }
    }
    this.widthTargets = [];
    this.widthUndoPushed = false;
  }

  private resized(orig: Note, wu: number): Note {
    const n = cloneNote(orig, false);
    n.w = this.snapWidth(wu);
    if (!this.allowNoteOverflow) {
      const span = this.segSpan(orig);
      n.x = this.laneFittedHead(orig.x, n.w, span.min, span.max, null);
    }
    return n;
  }

  // MARK: Lasso (EditorState+Tools.swift)

  private lassoTouch(current: Point2D, g: LaneGeo, ended: boolean): void {
    if (!ended) {
      const last = this.lassoPoints[this.lassoPoints.length - 1];
      if (last && hypot(current.x - last.x, current.y - last.y) < 2) return; // EditorState+Tools.swift :: lassoTouch
      this.lassoPoints.push(current);
      this.emitFrame();
      return;
    }
    const poly = this.lassoPoints;
    this.lassoPoints = [];
    if (!this.dragMoved) {
      this.lassoTap(current, g);
    } else {
      this.selectInLasso(poly, g);
    }
    this.emitUI();
  }

  private lassoTap(p: Point2D, g: LaneGeo): void {
    const i = this.hitNote(p, g);
    if (i !== null) {
      const id = this.chart.notes[i].id;
      const next = new Set(this.selectedIDs);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      this.selectedIDs = next;
    } else if (this.selectedIDs.size > 0) {
      this.selectedIDs = new Set();
    }
  }

  private selectInLasso(poly: Point2D[], g: LaneGeo): void {
    if (poly.length < 3) {
      this.showToast('範囲内にノーツがありません');
      return;
    }
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const q of poly) {
      minX = Math.min(minX, q.x);
      maxX = Math.max(maxX, q.x);
      minY = Math.min(minY, q.y);
      maxY = Math.max(maxY, q.y);
    }
    const inside = (q: Point2D) =>
      q.x >= minX && q.x <= maxX && q.y >= minY && q.y <= maxY && windingContains(q, poly);

    const ids = new Set(this.selectedIDs);
    let found = 0;
    let added = 0;
    for (const n of this.chart.notes) {
      const yHead = g.py(n.beat.value) - (isSlideNote(n) ? 0 : BAR_LIFT);
      let hit = inside({ x: g.px(n.x), y: yHead });
      if (!hit) {
        for (const s of n.segs) {
          if (inside({ x: g.px(n.x + s.x), y: g.py(n.beat.value + s.beat.value) })) {
            hit = true;
            break;
          }
        }
      }
      if (!hit) continue;
      found += 1;
      if (!ids.has(n.id)) {
        ids.add(n.id);
        added += 1;
      }
    }
    this.selectedIDs = ids;
    if (found === 0) this.showToast('範囲内にノーツがありません');
    else if (added === 0) this.showToast('範囲内のノーツはすべて選択済みです');
    else this.showToast(`${added} 個のノーツを選択に追加しました (選択中 ${ids.size} 個)`);
  }

  // MARK: Add / Hit / Remove (EditorState+Tools.swift)

  addNote(n: Note): void {
    if (n.beat.value < 0) return;
    if (n.segs.length === 0) {
      const v = n.beat.value;
      const isTap = !isWipeNote(n);
      const nLeft = n.x - n.w / 2;
      const nRight = n.x + n.w / 2;
      for (const i of this.notesOverlapping(v - 1e-9, v + 1e-9)) {
        const e = this.chart.notes[i];
        if (!e.beat.equals(n.beat) || e.segs.length !== 0) continue;
        if (isTap) {
          if (!isWipeNote(e)) {
            const eLeft = e.x - e.w / 2;
            const eRight = e.x + e.w / 2;
            if (nLeft < eRight && eLeft < nRight) return;
          }
        } else if (e.x === n.x && e.w === n.w && e.type === n.type) {
          return;
        }
      }
    }
    this.pushUndo();
    this.chart.notes.push(n);
    this.chartChanged();
  }

  hitNote(p: Point2D, g: LaneGeo): number | null {
    // EditorState+Tools.swift :: hitNote(at:g:)
    const ppb = g.ppb;
    if (!Number.isFinite(ppb) || ppb <= 0) {
      for (let i = this.chart.notes.length - 1; i >= 0; i--) {
        if (this.noteHit(this.chart.notes[i], p, g)) return i;
      }
      return null;
    }
    const b = g.beatOf(p.y);
    const m = (32.0 + BAR_LIFT) / ppb; // EditorState+Tools.swift :: hitNote margin 32.0 + barLift
    const list = this.notesOverlapping(b - m, b + m);
    for (let k = list.length - 1; k >= 0; k--) {
      const i = list[k];
      if (this.noteHit(this.chart.notes[i], p, g)) return i;
    }
    return null;
  }

  noteHit(n: Note, p: Point2D, g: LaneGeo): boolean {
    // EditorState+Tools.swift :: noteHit(_:at:g:)
    const y0 = g.py(n.beat.value);
    const cx = g.px(n.x);
    const minHitW = 8; // EditorState+Tools.swift :: minHitW
    const hw = (Math.max(n.w, minHitW) / 255.0) * g.trackW * 0.5;
    const yBar = isSlideNote(n) ? y0 : y0 - BAR_LIFT;
    if (Math.abs(p.y - yBar) <= 14 && Math.abs(p.x - cx) <= hw + 6) return true; // EditorState+Tools.swift :: hit tolerance 14 / +6
    if (isSlideNote(n)) {
      const pts: Point2D[] = [{ x: cx, y: y0 }];
      for (const s of n.segs) {
        pts.push({ x: g.px(n.x + s.x), y: g.py(n.beat.value + s.beat.value) });
      }
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k];
        const b = pts[k + 1];
        const poly = [
          { x: a.x - hw, y: a.y },
          { x: a.x + hw, y: a.y },
          { x: b.x + hw, y: b.y },
          { x: b.x - hw, y: b.y },
        ];
        if (pointInPolygon(p, poly)) return true;
      }
      for (const q of pts) {
        if (hypot(q.x - p.x, q.y - p.y) < 16) return true; // EditorState+Tools.swift :: seg dot radius 16
      }
    }
    return false;
  }

  removeTapped(i: number, p: Point2D, g: LaneGeo): void {
    // EditorState+Tools.swift :: removeTapped(note:at:g:)
    if (i >= this.chart.notes.length) return;
    const n = this.chart.notes[i];
    if (!isSlideNote(n)) {
      this.pushUndo();
      this.chart.notes.splice(i, 1);
      this.chartChanged();
      return;
    }
    const hw = (n.w / 255.0) * g.trackW * 0.5;
    const pts: Point2D[] = [{ x: g.px(n.x), y: g.py(n.beat.value) }];
    for (const s of n.segs) {
      pts.push({ x: g.px(n.x + s.x), y: g.py(n.beat.value + s.beat.value) });
    }
    let bestK = 0;
    let bestScore = Infinity;
    for (let k = 0; k < pts.length; k++) {
      const dx = Math.max(0, Math.abs(pts[k].x - p.x) - hw);
      const dy = pts[k].y - p.y;
      const score = hypot(dx, dy) + 0.001 * hypot(pts[k].x - p.x, dy);
      if (score < bestScore) {
        bestScore = score;
        bestK = k;
      }
    }
    if (bestK <= 1) {
      this.pushUndo();
      this.chart.notes.splice(i, 1);
      this.chartChanged();
      return;
    }
    const removed = n.segs.length - (bestK - 1);
    this.pushUndo();
    this.chart.notes[i].segs.splice(bestK - 1);
    this.chartChanged();
    this.showToast(`seg #${bestK} 以降 (${removed} 個) を削除しました`);
  }

  // MARK: Selection / Copy / Paste / Flip / Convert (EditorState+Tools.swift)

  private selectedIndices(): number[] {
    if (this.selectedIDs.size === 0) return [];
    const out: number[] = [];
    for (let i = 0; i < this.chart.notes.length; i++) {
      if (this.selectedIDs.has(this.chart.notes[i].id)) out.push(i);
    }
    return out;
  }

  selectNotes(lo: Beat, hi: Beat): void {
    const ids = new Set<NoteID>();
    for (const n of this.chart.notes) {
      if (!n.beat.lessThan(lo) && !n.beat.greaterThan(hi)) ids.add(n.id);
    }
    this.selectedIDs = ids;
    this.showToast(ids.size === 0 ? '範囲内にノーツがありません' : `${ids.size} 個のノーツを選択しました`);
  }

  beginSelectRange(): void {
    this.editing = true;
    this.tool = 'selectRange';
    this.rangeStart = null;
    this.rangeEnd = null;
    this.showToast('範囲の始点の拍をタップしてください');
  }

  copySelection(): void {
    const idx = this.selectedIndices();
    if (idx.length === 0) {
      this.showToast('コピーするノーツが選択されていません');
      return;
    }
    let base = this.chart.notes[idx[0]].beat;
    for (const i of idx) {
      if (this.chart.notes[i].beat.lessThan(base)) base = this.chart.notes[i].beat;
    }
    let keptRangeOffset = false;
    if (this.copyKeepsRangeOffset && this.rangeStart !== null && this.rangeEnd !== null && !base.lessThan(this.rangeStart)) {
      keptRangeOffset = !base.equals(this.rangeStart);
      base = this.rangeStart;
    }
    const list: Note[] = [];
    for (const i of idx) {
      const m = cloneNote(this.chart.notes[i], false);
      m.beat = m.beat.sub(base);
      list.push(m);
    }
    this.clip = list;
    this.showToast(
      keptRangeOffset
        ? `${list.length} 個のノーツをコピーしました (範囲の始点からのズレも保存)`
        : `${list.length} 個のノーツをコピーしました`
    );
  }

  paste(): void {
    if (this.clip.length === 0) {
      this.showToast('コピーされたノーツがありません');
      return;
    }
    const base = this.snapBeat(this.currentBeat());
    this.pushUndo();
    const pasted = new Set<NoteID>();
    for (const n of this.clip) {
      const m = cloneNote(n, true);
      m.beat = base.add(n.beat);
      pasted.add(m.id);
      this.chart.notes.push(m);
    }
    this.selectedIDs = pasted;
    this.chartChanged();
    this.showToast(`${this.clip.length} 個を貼り付けました`);
  }

  private isOnGridLine(x: number): boolean {
    return this.gridLineX(this.nearestGridIndex(x)) === x;
  }

  private flippedX(x: number, onGrid: boolean): number {
    if (onGrid) return this.gridLineX(this.gridLines - this.nearestGridIndex(x));
    return 255 - x;
  }

  flipHorizontal(): void {
    // EditorState+Tools.swift :: flipHorizontal()
    const targets = this.selectedIndices();
    if (targets.length === 0) {
      this.showToast('ノーツが選択されていません。反転するノーツを選択してください');
      return;
    }
    let onGrid = this.gridAlign && this.gridLines >= 1;
    if (onGrid) {
      outer: for (const i of targets) {
        const n = this.chart.notes[i];
        if (!this.isOnGridLine(n.x)) {
          onGrid = false;
          break outer;
        }
        for (const s of n.segs) {
          if (!this.isOnGridLine(n.x + s.x)) {
            onGrid = false;
            break outer;
          }
        }
      }
    }
    this.pushUndo();
    for (const i of targets) {
      const headX = this.chart.notes[i].x;
      const newHead = this.flippedX(headX, onGrid);
      for (const seg of this.chart.notes[i].segs) {
        const absX = headX + seg.x;
        seg.x = this.flippedX(absX, onGrid) - newHead;
      }
      this.chart.notes[i].x = newHead;
    }
    this.chartChanged();
  }

  slideToWipe(): void {
    // EditorState+Tools.swift :: slideToWipe()
    const r = this.selectedIndices();
    if (r.length === 0) {
      this.showToast('先にノーツを選択してください (Time range で範囲選択もできます)');
      return;
    }
    const slides = r.filter((i) => isSlideNote(this.chart.notes[i]));
    if (slides.length === 0) {
      this.showToast('選択中のノーツにスライドがありません');
      return;
    }
    this.pushUndo();
    const created: Note[] = [];
    for (const i of slides) {
      const n = this.chart.notes[i];
      created.push({ beat: n.beat, x: n.x, w: n.w, type: 4, segs: [], extra: {}, id: nextNoteID() });
      for (const s of n.segs) {
        created.push({
          beat: n.beat.add(s.beat),
          x: Math.max(0, Math.min(255, n.x + s.x)),
          w: n.w,
          type: 4,
          segs: [],
          extra: {},
          id: nextNoteID(),
        });
      }
    }
    for (const i of [...slides].sort((a, b) => b - a)) this.chart.notes.splice(i, 1);
    this.chart.notes.push(...created);
    for (const n of created) this.selectedIDs.add(n.id);
    this.chartChanged();
    this.showToast(`${slides.length} 個のスライドをWipeに変換しました`);
  }

  wipeToSlide(): void {
    // EditorState+Tools.swift :: wipeToSlide()
    const r = this.selectedIndices();
    if (r.length === 0) {
      this.showToast('先にノーツを選択してください (Time range で範囲選択もできます)');
      return;
    }
    const wipes = r.filter((i) => isWipeNote(this.chart.notes[i]) && !isSlideNote(this.chart.notes[i]));
    if (wipes.length < 2) {
      this.showToast('選択中のWipeが2個以上必要です');
      return;
    }
    const sorted = [...wipes].sort((a, b) => Beat.compare(this.chart.notes[a].beat, this.chart.notes[b].beat));
    const first = this.chart.notes[sorted[0]];
    const segs: Seg[] = [];
    for (let k = 1; k < sorted.length; k++) {
      const n = this.chart.notes[sorted[k]];
      segs.push({ beat: n.beat.sub(first.beat), x: n.x - first.x });
    }
    this.pushUndo();
    const slide: Note = { beat: first.beat, x: first.x, w: first.w, type: undefined, segs, extra: {}, id: nextNoteID() };
    for (const i of [...wipes].sort((a, b) => b - a)) this.chart.notes.splice(i, 1);
    this.chart.notes.push(slide);
    this.selectedIDs.add(slide.id);
    this.chartChanged();
    this.showToast(`Wipe ${wipes.length} 個を1本のスライドにしました`);
  }

  // MARK: Slide Draft (EditorState+Tools.swift)

  private slideDraftIndex(): number | null {
    if (!this.slideDraft) return null;
    return this.indexOfNote(this.slideDraft.noteID);
  }

  slideDraftBase(): { beat: Beat; x: number; w: number } | null {
    if (!this.slideDraft) return null;
    const i = this.slideDraftIndex();
    if (i !== null) {
      const n = this.chart.notes[i];
      return { beat: n.beat, x: n.x, w: n.w };
    }
    return { beat: this.slideDraft.beat, x: this.slideDraft.x, w: this.slideDraft.w };
  }

  slideDraftLastPoint(): { beat: Beat; x: number } | null {
    const base = this.slideDraftBase();
    if (!base) return null;
    const i = this.slideDraftIndex();
    if (i !== null) {
      const segs = this.chart.notes[i].segs;
      if (segs.length > 0) {
        const last = segs[segs.length - 1];
        return { beat: base.beat.add(last.beat), x: base.x + last.x };
      }
    }
    return { beat: base.beat, x: base.x };
  }

  private appendDraftSeg(b: Beat, x: number): void {
    const d = this.slideDraft;
    const base = this.slideDraftBase();
    const last = this.slideDraftLastPoint();
    if (!d || !base || !last) return;
    if (b.equals(last.beat) && x === last.x) {
      this.showToast('直前の点と同じ位置です');
      return;
    }
    const seg: Seg = { beat: b.sub(base.beat), x: x - base.x };
    this.pushUndo();
    const i = this.slideDraftIndex();
    if (i !== null) {
      this.chart.notes[i].segs.push(seg);
    } else {
      this.chart.notes.push({
        beat: base.beat,
        x: base.x,
        w: base.w,
        type: undefined,
        segs: [seg],
        extra: {},
        id: d.noteID,
      });
    }
    this.chartChanged();
  }

  finishSlide(): void {
    if (!this.slideDraft) return;
    const i = this.slideDraftIndex();
    const count = i !== null ? this.chart.notes[i].segs.length : 0;
    this.slideDraft = null;
    this.ghost = null;
    this.emitUI();
    if (count === 0) this.showToast('seg が無いので、始点を取り消しました');
    else this.showToast(`スライドを作成しました (seg ${count} 個)`);
  }

  // MARK: Slide modify (EditorState+Tools.swift)

  get modifySlideIndex(): number | null {
    return this.modifySlideID !== null ? this.indexOfNote(this.modifySlideID) : null;
  }

  selectModifySlide(id: NoteID): void {
    this.modifySlideID = id;
    this.modifySegIndex = null;
    this.selectedIDs = new Set([id]);
    this.emitUI();
  }

  deselectModifySlide(): void {
    if (this.modifySlideID !== null) {
      const next = new Set(this.selectedIDs);
      next.delete(this.modifySlideID);
      this.selectedIDs = next;
    }
    this.modifySlideID = null;
    this.modifySegIndex = null;
    this.emitUI();
  }

  private slideModifyTap(p: Point2D, g: LaneGeo): void {
    const curIdx = this.modifySlideIndex;
    if (curIdx !== null && isSlideNote(this.chart.notes[curIdx]) && this.noteHit(this.chart.notes[curIdx], p, g)) {
      this.deselectModifySlide();
      return;
    }
    for (let i = this.chart.notes.length - 1; i >= 0; i--) {
      const n = this.chart.notes[i];
      if (isSlideNote(n) && n.id !== this.modifySlideID && this.noteHit(n, p, g)) {
        this.selectModifySlide(n.id);
        return;
      }
    }
    if (curIdx !== null && isSlideNote(this.chart.notes[curIdx])) {
      this.addSegAt(curIdx, p, g);
    }
  }

  private addSegAt(i: number, p: Point2D, g: LaneGeo): void {
    const n = this.chart.notes[i];
    const b = this.snapBeat(g.beatOf(p.y));
    const lastSeg = n.segs[n.segs.length - 1];
    const lastBeat = lastSeg ? n.beat.add(lastSeg.beat) : n.beat;
    if (!this.allowUnorderedSeg && b.lessThan(lastBeat)) {
      this.deselectModifySlide();
      return;
    }
    const q = this.snapNote(g.xOf(p.x), n.w);
    let same = b.equals(n.beat) && q.x === n.x;
    for (const s of n.segs) {
      if (n.beat.add(s.beat).equals(b) && n.x + s.x === q.x) same = true;
    }
    if (same) {
      this.showToast('その位置には、すでに点があります');
      return;
    }
    this.pushUndo();
    this.chart.notes[i].segs.push({ beat: b.sub(n.beat), x: q.x - n.x });
    this.chartChanged();
    this.showToast(`seg #${this.chart.notes[i].segs.length} を追加しました`);
  }

  private hitSegAny(p: Point2D, g: LaneGeo): [number, number] | null {
    const reach = 26; // EditorState+Tools.swift :: hitSegAny reach 26pt
    let best: [number, number] | null = null;
    let bestScore = Infinity;
    for (let i = this.chart.notes.length - 1; i >= 0; i--) {
      const n = this.chart.notes[i];
      if (!isSlideNote(n)) continue;
      const bonus = n.id === this.modifySlideID ? 3 : 0; // EditorState+Tools.swift :: hitSegAny bonus 3
      for (let j = 0; j < n.segs.length; j++) {
        const s = n.segs[j];
        const qy = g.py(n.beat.value + s.beat.value);
        if (Math.abs(qy - p.y) > reach) continue;
        const qx = g.px(n.x + s.x);
        const d = hypot(qx - p.x, qy - p.y);
        if (d >= reach) continue;
        const score = d - bonus;
        if (score < bestScore) {
          bestScore = score;
          best = [i, j];
        }
      }
    }
    return best;
  }

  private dragSeg(current: Point2D, g: LaneGeo): void {
    const id = this.segDragNoteID;
    const i = id !== null ? this.indexOfNote(id) : null;
    if (i === null || this.segDragIndex >= this.chart.notes[i].segs.length) {
      this.dragMode = 'ignore';
      return;
    }
    const n = this.chart.notes[i];
    const cur = n.segs[this.segDragIndex];
    let segBeat = this.segDragOrig ? this.segDragOrig.beat : cur.beat;
    if (this.allowSegVerticalMove) {
      let b = this.snapBeat(g.beatOf(current.y + this.segDragGrab.height));
      if (!this.allowUnorderedSeg) {
        const myBeat = n.beat.add(cur.beat);
        const j = this.segDragIndex;
        const prevBeat = j === 0 ? n.beat : n.beat.add(n.segs[j - 1].beat);
        if (!prevBeat.greaterThan(myBeat) && b.lessThan(prevBeat)) b = prevBeat;
        if (j + 1 < n.segs.length) {
          const nextBeat = n.beat.add(n.segs[j + 1].beat);
          if (!nextBeat.lessThan(myBeat) && b.greaterThan(nextBeat)) b = nextBeat;
        }
      }
      segBeat = b.sub(n.beat);
    }
    const q = this.snapNote(g.xOf(current.x + this.segDragGrab.width), n.w);
    const newSeg: Seg = { beat: segBeat, x: q.x - n.x };
    if (newSeg.beat.equals(cur.beat) && newSeg.x === cur.x) return;
    if (!this.segDragUndoPushed) {
      this.pushUndo();
      this.segDragUndoPushed = true;
    }
    this.chart.notes[i].segs[this.segDragIndex] = newSeg;
    this.emitFrame();
  }

  private finishSegDrag(): void {
    this.modifySegIndex = null;
    const pushed = this.segDragUndoPushed;
    const orig = this.segDragOrig;
    const id = this.segDragNoteID;
    this.segDragNoteID = null;
    this.segDragOrig = null;
    this.segDragUndoPushed = false;
    if (!pushed) {
      this.emitFrame();
      return;
    }
    if (id !== null && orig) {
      const i = this.indexOfNote(id);
      if (i !== null && this.segDragIndex < this.chart.notes[i].segs.length) {
        const s = this.chart.notes[i].segs[this.segDragIndex];
        if (s.beat.equals(orig.beat) && s.x === orig.x) {
          this.dropLastUndo();
          this.emitUI();
          return;
        }
      }
    }
    this.chartChanged();
  }

  // MARK: Lua Plugins (EditorState+Plugins.swift)

  runPlugin(item: PluginItem): void {
    // EditorState+Plugins.swift :: EditorState.runPlugin(_:)
    if (this.pluginRunning) return;
    if (item.isInteractive) {
      this.toggleInteractivePlugin(item);
      return;
    }
    if (!item.isRunnable) {
      this.showToast('このプラグインは実行できません');
      return;
    }
    // 別の実行型プラグインを動かすときも、操作型プラグインの後始末をしてから実行する
    this.stopInteractivePlugin();
    if (this._tool === 'plugin') this._tool = 'unselected';
    if (this.isPlaying) this.pause();
    this.popup = 'none';
    this.pluginRunning = true;
    this.pluginLog = '';
    this.emitUI();

    const title = item.title;
    const snapshot = this.buildPluginSnapshot();
    const handle = LuaEngine.run({
      source: item.source,
      fileName: item.fileName,
      pluginName: title,
      snapshot,
      onLog: (chunk) => {
        if (this.activePluginHandle !== handle) return;
        this.pluginLog += chunk;
        this.emitUI();
      },
      onNotice: (text) => {
        if (this.activePluginHandle !== handle) return;
        this.showPluginNotice(text);
      },
      onPrompt: (prompt) => this.openPluginPromptDialog(handle, title, prompt),
    });
    this.activePluginHandle = handle;

    void handle.promise.then((outcome) => {
      if (this.activePluginHandle === handle) {
        this.activePluginHandle = null;
      }
      this.pluginRunning = false;

      let log = outcome.log;
      const unsupported = outcome.unsupported;
      const notified = outcome.notified;

      switch (outcome.result.status) {
        case 'ok':
          if (outcome.patch) {
            this.applyWorkerPatch(outcome.patch);
          }
          if (unsupported.length === 0) {
            if (!notified) this.showToast(`「${title}」を実行しました`);
          } else {
            const names = unsupported.join(', ');
            if (log.length > 0 && !log.endsWith('\n')) log += '\n';
            log += `[未対応] まだ対応していない関数が呼ばれたので、何もせずに通過しました: ${names}\n`;
            if (!notified) {
              this.showPluginNotice(`「${title}」を実行しました (未対応の関数を通過: ${names})`);
            }
          }
          break;
        case 'aborted':
          log = this.pluginLog;
          this.showToast(`「${title}」を中断しました`);
          break;
        case 'failed':
          this.resolvePluginDialog(null);
          this.pluginDialog = {
            id: ++this.pluginDialogSeq,
            kind: 'message',
            title: `${title} — エラー`,
            message: outcome.result.message,
          };
          break;
      }

      this.pluginLog = log;
      this.emitUI();
    });
  }

  private openPluginPromptDialog(
    handle: RunningPluginHandle,
    pluginTitle: string,
    prompt: PluginPromptRequest
  ): Promise<string | null> {
    if (this.activePluginHandle !== handle) {
      return Promise.resolve(null);
    }
    this.resolvePluginDialog(null);

    return new Promise((resolve) => {
      const id = ++this.pluginDialogSeq;
      this.pluginDialogResolver = resolve;

      switch (prompt.kind) {
        case 'input':
          this.pluginDialog = {
            id,
            kind: 'input',
            title: pluginTitle,
            message: prompt.message,
            defaultText: prompt.defaultText,
          };
          break;
        case 'choice':
          this.pluginDialog = {
            id,
            kind: 'choice',
            title: pluginTitle,
            message: prompt.message,
            options: prompt.options,
          };
          break;
        case 'filePick':
          this.pluginDialog = {
            id,
            kind: 'filePick',
            title: pluginTitle,
            message: prompt.message,
            fromPhotos: prompt.fromPhotos,
          };
          break;
        case 'imagePreview': {
          const vb = this.visibleBeats;
          const aspect = Number.isFinite(vb) && vb > 0 ? 820.0 / vb / 837.6 : 0.85;
          this.pluginDialog = {
            id,
            kind: 'imagePreview',
            title: pluginTitle,
            message: prompt.message,
            imageBytes: base64ToBytes(prompt.imageBase64),
            imageParams: {
              length: prompt.length,
              ticks: prompt.ticks,
              threshold: prompt.threshold,
              invert: prompt.invert,
              beatAspect: aspect,
            },
          };
          break;
        }
        case 'decodeImage':
          this.pluginDialogResolver = null;
          resolve(null);
          return;
      }
      this.emitUI();
    });
  }

  showPluginMessage(title: string, message: string): void {
    this.resolvePluginDialog(null);
    this.pluginDialog = {
      id: ++this.pluginDialogSeq,
      kind: 'message',
      title,
      message,
    };
    this.emitUI();
  }

  stopPlugin(): void {
    // EditorState+Plugins.swift :: EditorState.stopPlugin()
    if (this.activePluginHandle) {
      const h = this.activePluginHandle;
      h.stop();
    }
    this.resolvePluginDialog(null);
  }

  resolvePluginDialog(answer: string | null = null): void {
    // EditorState+Plugins.swift :: EditorState.resolvePluginDialog(_:)
    const res = this.pluginDialogResolver;
    this.pluginDialogResolver = null;
    if (this.pluginDialog) {
      this.pluginDialog = null;
      this.emitUI();
    }
    res?.(answer);
  }

  clearPluginLog(): void {
    this.pluginLog = '';
    this.emitUI();
  }

  private buildPluginSnapshot(): PluginSnapshot {
    const rawMeta = this.chart.root.meta;
    const meta =
      typeof rawMeta === 'object' && rawMeta !== null && !Array.isArray(rawMeta)
        ? (structuredClone(rawMeta) as Record<string, unknown>)
        : {};
    return {
      notes: this.chart.notes.map((n) => ({
        id: n.id,
        beat: [n.beat.m, n.beat.n, n.beat.d],
        x: n.x,
        w: n.w,
        type: n.type,
        segs: n.segs.map((s) => ({
          beat: [s.beat.m, s.beat.n, s.beat.d],
          x: s.x,
        })),
        extra: structuredClone(n.extra),
      })),
      times: this.chart.times.map((t) => ({
        beat: [t.beat.m, t.beat.n, t.beat.d],
        bpm: t.bpm,
      })),
      effects: this.chart.effects.map((e) => ({
        beat: [e.beat.m, e.beat.n, e.beat.d],
        kind: e.kind,
        value: e.value,
        extra: structuredClone(e.extra),
      })),
      selectedIDs: [...this.selectedIDs],
      orderIDs: [...this.orderIDs],
      currentSec: this.currentSec(),
      currentBeat: this.currentBeat(),
      divide: this.snapDen,
      widthUnits: this.widthUnits,
      gridLines: this.gridLines,
      meta,
    };
  }

  private applyWorkerPatch(patch: WorkerPatch): void {
    const idRemap = new Map<number, number>();
    const mapId = (id: number): NoteID => {
      if (id >= 0) return id;
      let mapped = idRemap.get(id);
      if (mapped === undefined) {
        mapped = nextNoteID();
        idRemap.set(id, mapped);
      }
      return mapped;
    };

    if (patch.dirty && patch.notes && patch.times && patch.effects) {
      // 1回の実行 = Undo 1回分 (PluginBridge.swift :: touch / EditorState+Plugins.swift)
      this.pushUndo();
      this.chart.notes = patch.notes.map((n) => ({
        id: mapId(n.id),
        beat: new Beat(n.beat[0], n.beat[1], n.beat[2]),
        x: n.x,
        w: n.w,
        type: n.type,
        segs: n.segs.map((s) => ({
          beat: new Beat(s.beat[0], s.beat[1], s.beat[2]),
          x: s.x,
        })),
        extra: n.extra,
      }));
      this.chart.times = patch.times.map((t) => ({
        beat: new Beat(t.beat[0], t.beat[1], t.beat[2]),
        bpm: t.bpm,
      }));
      this.chart.effects = patch.effects.map((e) => ({
        beat: new Beat(e.beat[0], e.beat[1], e.beat[2]),
        kind: e.kind,
        value: e.value,
        extra: e.extra,
      }));
    }

    if (patch.selectedChanged || patch.dirty) {
      this.selectedIDs = new Set(patch.selectedIDs.map(mapId));
    }
    if (patch.orderChanged || patch.dirty) {
      this.orderIDs = patch.orderIDs.map(mapId);
    }
    if (patch.gridChanged) {
      this.gridLines = patch.gridLines;
    }
    if (patch.seekToBeat) {
      const sb = new Beat(patch.seekToBeat[0], patch.seekToBeat[1], patch.seekToBeat[2]);
      this.setViewBeat(sb.value);
    }
    if (patch.dirty) {
      this.chartChanged();
    } else if (patch.selectedChanged || patch.orderChanged || patch.gridChanged) {
      this.emitUI();
    }
  }

  // MARK: Order tap (EditorState+Plugins.swift)

  orderTap(p: Point2D, g: LaneGeo): void {
    // EditorState+Plugins.swift :: orderTap(at:g:)
    let hitAny = false;
    for (let i = this.chart.notes.length - 1; i >= 0; i--) {
      const n = this.chart.notes[i];
      if (!isSlideNote(n) || !this.noteHit(n, p, g)) continue;
      hitAny = true;
      if (this.orderIDs.includes(n.id)) continue;
      this.orderIDs = [...this.orderIDs, n.id];
      this.showToast(this.orderIDs.length === 1 ? '1 番目を選択 (本体)' : `${this.orderIDs.length} 番目を追加`);
      return;
    }
    if (hitAny) {
      this.showToast('このスライドは選択済みです');
    } else if (this.orderIDs.length > 0) {
      this.orderIDs = [];
      this.showToast('順番に選択をリセットしました');
    }
  }

  // MARK: Interactive Plugins (EditorState+Plugins.swift :: PluginType 2)

  toggleInteractivePlugin(item: PluginItem): void {
    // EditorState+Plugins.swift :: EditorState.toggleInteractivePlugin(_:)
    if (this.pluginRunning) return;
    if (!item.isRunnable) {
      this.showToast('このプラグインは実行できません');
      return;
    }
    if (this.activePluginID === item.id) {
      this.stopInteractivePlugin();
      if (this._tool === 'plugin') this._tool = 'unselected';
      this.emitUI();
      return;
    }
    this.stopInteractivePlugin();
    if (this.isPlaying) this.pause();
    this.popup = 'none';
    this.pluginSprites = [];
    const session = new PluginSession(item, this);
    this.pluginSession = session;
    this.activePluginID = item.id;
    this.tool = 'plugin';
    if (!session.start()) {
      this.stopInteractivePlugin();
      if (this._tool === 'plugin') this._tool = 'unselected';
    }
    this.emitUI();
  }

  stopInteractivePlugin(): void {
    // EditorState+Plugins.swift :: EditorState.stopInteractivePlugin()
    const s = this.pluginSession;
    if (!s) {
      this.activePluginID = null;
      this.pluginSprites = [];
      this.pluginDragStarted = false;
      return;
    }
    this.pluginSession = null;
    this.activePluginID = null;
    s.stop();
    this.pluginSprites = [];
    this.pluginDragStarted = false;
    this.emitUI();
  }

  pluginTouch(start: Point2D, current: Point2D, g: LaneGeo, phase: LanePhase): void {
    // EditorState+Plugins.swift :: EditorState.pluginTouch(start:current:g:phase:)
    const session = this.pluginSession;
    if (!session) return;
    if (phase === 'began') this.pluginDragStarted = false;
    if (!this.pluginDragStarted && this.dragMoved) {
      this.pluginDragStarted = true;
      session.setClick(start, g, this); // OnDragStart は指を置いた位置
      session.bridge.beginGesture();
      session.call('OnDragStart');
    }
    if (this.pluginDragStarted) {
      session.setClick(current, g, this);
      session.call('OnDragMove');
    }
    if (phase === 'ended') {
      if (this.pluginDragStarted) {
        session.call('OnDragEnd');
      } else {
        session.setClick(current, g, this);
        session.bridge.beginGesture();
        session.call('OnClick');
      }
      this.pluginDragStarted = false;
    }
  }

  // MARK: BPM (EditorState+Tools.swift :: addOrReplaceBPM / removeBPM)

  addOrReplaceBPM(beat: Beat, bpm: number): void {
    // EditorState+Tools.swift :: EditorState.addOrReplaceBPM(beat:bpm:)
    if (beat.value < 0) return;
    const v = Math.max(10, Math.min(3000, bpm)); // EditorState+Tools.swift :: addOrReplaceBPM (10...3000)
    this.pushUndo();
    const idx = this.chart.times.findIndex((t) => t.beat.equals(beat));
    if (idx >= 0) {
      this.chart.times[idx].bpm = v;
    } else {
      this.chart.times.push({ beat, bpm: v });
    }
    this.chart.times.sort((a, b) => Beat.compare(a.beat, b.beat));
    this.chartChanged();
  }

  removeBPM(idx: number): void {
    // EditorState+Tools.swift :: EditorState.removeBPM(at:)
    if (!(idx > 0 && idx < this.chart.times.length)) {
      this.showToast('先頭のBPMは削除できません');
      return;
    }
    this.pushUndo();
    this.chart.times.splice(idx, 1);
    this.chartChanged();
  }

  // MARK: Effect (scroll / jump) (EditorState+Tools.swift :: addOrReplaceEffect / removeEffect)

  addOrReplaceEffect(beat: Beat, kind: EffectKind, value: number): void {
    // EditorState+Tools.swift :: EditorState.addOrReplaceEffect(beat:kind:value:)
    if (!Number.isFinite(value)) return;
    this.pushUndo();
    const idx = this.chart.effects.findIndex((e) => e.beat.equals(beat) && e.kind === kind);
    if (idx >= 0) {
      this.chart.effects[idx].value = value;
    } else {
      this.chart.effects.push({ beat, kind, value, extra: {} });
    }
    this.chart.effects.sort((a, b) => Beat.compare(a.beat, b.beat));
    this.chartChanged();
  }

  removeEffect(idx: number): void {
    // EditorState+Tools.swift :: EditorState.removeEffect(at:)
    if (!(idx >= 0 && idx < this.chart.effects.length)) return;
    this.pushUndo();
    this.chart.effects.splice(idx, 1);
    this.chartChanged();
  }
}

function gcdIntPos(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x === 0 ? 1 : x;
}
