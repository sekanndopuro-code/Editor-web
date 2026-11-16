// AudioController.swift (SongPCM) + PCMCache.swift note + EditorState.swift (GameAudio Web Audio API implementation)
import { OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis';
import type {
  RubberBandWorkerInMessage,
  RubberBandWorkerOutMessage,
} from './rubberbandWorker';

let sharedAudioCtx: AudioContext | null = null;
let audioUnlocked = false;

/** Shared AudioContext aligned with AudioSessionSetup (interactive low-latency playback) */
export function getSharedAudioContext(): AudioContext {
  if (!sharedAudioCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) {
      throw new Error('このブラウザは Web Audio API に対応していません');
    }
    sharedAudioCtx = new AudioCtx({ latencyHint: 'interactive' });
  }
  return sharedAudioCtx;
}

/** Synchronously resume/unlock Web Audio inside user gesture handlers (required for iPad Safari) */
export function unlockAudioContext(): void {
  try {
    const ctx = getSharedAudioContext();
    const state = ctx.state as string;
    if (state === 'suspended' || state === 'interrupted') {
      void ctx.resume();
    }
    if (!audioUnlocked) {
      audioUnlocked = true;
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    }
  } catch {
    // Ignore unlock errors when AudioContext cannot be initialized yet
  }
}

function isOggHeader(data: Uint8Array): boolean {
  // AudioController.swift :: SongPCM.decode "OggS"
  return (
    data.length >= 4 &&
    data[0] === 0x4f &&
    data[1] === 0x67 &&
    data[2] === 0x67 &&
    data[3] === 0x53
  );
}

/**
 * AudioController.swift :: SongPCM
 * PCMCache.swift: decode the full song once on open into Float32 PCM (left/right) and share it.
 */
export class SongPCM {
  /** AudioController.swift :: SongPCM.maxFrames (48kHz * 60 * 20 = 20 minutes) */
  static readonly maxFrames = 48_000 * 60 * 20;

  readonly sampleRate: number;
  readonly frames: number;
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly info: string;
  readonly audioBuffer: AudioBuffer;

  get duration(): number {
    // AudioController.swift :: SongPCM.duration
    return this.frames / this.sampleRate;
  }

  constructor(
    left: Float32Array,
    right: Float32Array | null,
    frames: number,
    sampleRate: number,
    info: string,
    audioBuffer: AudioBuffer
  ) {
    this.left = left;
    this.right = right ?? left; // AudioController.swift :: mono shares left without doubling memory
    this.frames = frames;
    this.sampleRate = sampleRate;
    this.info = info;
    this.audioBuffer = audioBuffer;
  }

  /**
   * AudioController.swift :: SongPCM.decode(data:fileName:)
   * Tries native Web Audio decodeAudioData first; falls back to WASM Ogg Vorbis decoder (for iPad Safari).
   */
  static async decode(data: Uint8Array, fileName: string): Promise<SongPCM> {
    const t0 = performance.now();
    const ctx = getSharedAudioContext();
    const isOgg = isOggHeader(data) || fileName.toLowerCase().endsWith('.ogg');

    // Copy into an independent ArrayBuffer since decodeAudioData detaches its input buffer.
    const arrayCopy = data.slice().buffer;
    let firstError: unknown = null;

    try {
      const buffer = await ctx.decodeAudioData(arrayCopy);
      if (buffer.length <= 0 || buffer.sampleRate <= 0) {
        throw new Error('音源にデータがありません');
      }
      if (buffer.length > SongPCM.maxFrames) {
        throw new Error('曲が長すぎます (20分まで)');
      }
      const left = buffer.getChannelData(0);
      const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;
      const ms = Math.round(performance.now() - t0);
      const info = `Web Audio API で展開 (${Math.round(buffer.sampleRate)} Hz・${buffer.numberOfChannels}ch・${ms} ms)`;
      return new SongPCM(left, right, buffer.length, buffer.sampleRate, info, buffer);
    } catch (err) {
      firstError = err;
    }

    if (isOgg) {
      const decoder = new OggVorbisDecoder();
      try {
        await decoder.ready;
        const decoded = await decoder.decodeFile(data);
        const frames = decoded.samplesDecoded;
        const sr = decoded.sampleRate;
        if (frames <= 0 || sr <= 0 || decoded.channelData.length === 0) {
          throw new Error('音源にデータがありません');
        }
        if (frames > SongPCM.maxFrames) {
          throw new Error('曲が長すぎます (20分まで)');
        }
        const channels = Math.min(2, decoded.channelData.length);
        const audioBuffer = ctx.createBuffer(channels, frames, sr);
        const lRaw = decoded.channelData[0].subarray(0, frames);
        audioBuffer.getChannelData(0).set(lRaw);
        if (channels > 1) {
          const rRaw = decoded.channelData[1].subarray(0, frames);
          audioBuffer.getChannelData(1).set(rRaw);
        }
        const left = audioBuffer.getChannelData(0);
        const right = channels > 1 ? audioBuffer.getChannelData(1) : null;
        const ms = Math.round(performance.now() - t0);
        const info = `ogg-vorbis で展開 (${Math.round(sr)} Hz・${channels}ch・${ms} ms)`;
        return new SongPCM(left, right, frames, sr, info, audioBuffer);
      } catch (oggErr) {
        const msg = oggErr instanceof Error ? oggErr.message : String(oggErr);
        throw new Error(`ogg を読み込めませんでした (${msg})`);
      } finally {
        decoder.free();
      }
    }

    const fallbackMsg = firstError instanceof Error ? firstError.message : String(firstError);
    throw new Error(fallbackMsg || '音源を読み込めませんでした');
  }
}

/**
 * Sample-clock-synchronized music playback engine matching EditorState.swift :: GameAudio.
 * At rate = 1.0 plays SongPCM directly; at rate < 1.0 streams chunked AudioBuffers generated
 * in a dedicated Web Worker (RubberBandPCMSource + rubberband-wasm) so pitch stays unchanged,
 * chart/key sounds never drift, and the UI thread stays smooth even during rapid speed switches.
 */
export class GameAudio {
  private static readonly chunkOutFrames = 8192;
  private static readonly initialLookaheadChunks = 5;
  private static readonly queueAheadSec = 0.85;
  private static readonly rapidSwitchWindowMs = 250;
  private static readonly rapidSwitchDebounceMs = 60;

  readonly song: SongPCM;
  rate = 1.0;
  sharp = false;
  lastBeginMs = 0;
  lastBeginWarm = false;

  private readonly ctx: AudioContext;
  private readonly gainNode: GainNode;
  private readonly activeSources = new Set<AudioBufferSourceNode>();
  private volume = 1.0;
  private playing = false;
  private playGen = 0;
  private waitingFirstChunk = false;
  private stretcherActive = false;
  private streamEOF = false;
  private anchorChartTime = 0;
  private anchorCtxTime = 0;
  private hostToCtxOffset = 0;

  // Worker streaming & rapid-switch debouncing (rate < 1.0)
  private worker: Worker | null = null;
  private songSentToWorker = false;
  private workerWarmed = false;
  private debounceTimer: number | null = null;
  private lastStretchedBeginAtMs = 0;
  private pendingSongTime = 0;
  private nextChunkCtxTime = 0;
  private receivedChunks = 0;
  private lastRequestedSeq = 0;
  private reachedTarget = false;
  private minQueuedChunks = -1;

  constructor(song: SongPCM) {
    this.song = song;
    this.ctx = getSharedAudioContext();
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = this.volume;
    this.gainNode.connect(this.ctx.destination);
    this.ensureWorker();
  }

  get outputLatency(): number {
    return this.ctx.outputLatency || this.ctx.baseLatency || 0;
  }

  get currentAudioTime(): number {
    return this.ctx.currentTime;
  }

  get stretchEngine(): string {
    return this.sharp ? 'Rubber Band R2' : 'Rubber Band R3';
  }

  /** Toggle transient sharpness (sharp = R2 shorter window, false = R3 finer). */
  setSharpStretch(sharp: boolean): void {
    this.sharp = sharp;
  }

  /** Queue depth diagnostics for SETTING display. */
  queueStats(): { min: number; target: number } {
    return {
      min: this.reachedTarget ? this.minQueuedChunks : -1,
      target: GameAudio.initialLookaheadChunks,
    };
  }

  /** Set playback speed factor (RubberBandPCMSource.swift :: [0.05, 1.0]). */
  setRate(r: number): void {
    const clamped = Math.min(Math.max(r, 0.05), 1.0);
    this.rate = clamped >= 0.999 ? 1.0 : clamped;
  }

  /** AudioContext time matching the given chartTime (EditorState.swift :: uptime(atChartTime:)) */
  ctxTimeForChartTime(chartTime: number): number {
    return this.anchorCtxTime + (chartTime - this.anchorChartTime) / this.rate;
  }

  /** ChartTime at the given AudioContext time (EditorState.swift :: chartTime(atUptime:)) */
  chartTimeAtCtx(ctxTime: number): number {
    if (!this.playing) return this.anchorChartTime;
    if (this.waitingFirstChunk) return this.anchorChartTime - 0.001;
    if (ctxTime <= this.anchorCtxTime) return this.anchorChartTime;
    return this.anchorChartTime + (ctxTime - this.anchorCtxTime) * this.rate;
  }

  setVolume(v: number): void {
    // EditorState.swift :: applyVolumes / engineAudio?.setVolume
    const clamped = Math.min(Math.max(v, 0), 1);
    this.volume = clamped;
    this.gainNode.gain.value = clamped;
    try {
      this.gainNode.gain.setValueAtTime(clamped, this.ctx.currentTime);
    } catch {
      // Ignore if AudioContext is closed
    }
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./rubberbandWorker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (ev: MessageEvent<RubberBandWorkerOutMessage>) => {
        this.handleWorkerMessage(ev.data);
      };
      this.worker.onerror = (err) => {
        console.error('Rubber Band Worker エラー:', err);
      };
    }
    if (!this.songSentToWorker) {
      this.songSentToWorker = true;
      const leftCopy = new Float32Array(this.song.left);
      const isMono = this.song.right === this.song.left;
      const rightCopy = isMono ? null : new Float32Array(this.song.right);
      const transfers: Transferable[] = [leftCopy.buffer];
      if (rightCopy) transfers.push(rightCopy.buffer);
      const msg: RubberBandWorkerInMessage = {
        type: 'setSong',
        left: leftCopy.buffer,
        right: rightCopy ? rightCopy.buffer : null,
        frames: this.song.frames,
        sampleRate: this.song.sampleRate,
      };
      this.worker.postMessage(msg, transfers);
    }
    return this.worker;
  }

  /**
   * EditorState.swift :: a.begin(chartTime: sec, offsetTotal: offSec)
   * Audio offset rule from ChartModel.swift :: ChartData.offsetMs:
   *   songTime = chartTime - offsetTotal
   */
  begin(chartTime: number, offsetTotal: number): void {
    const t0 = performance.now();
    this.halt();
    unlockAudioContext();

    const lead = 0.05; // EditorState.swift :: EditorState.playLead
    const startCtxTime = this.ctx.currentTime + lead;
    const songTime = chartTime - offsetTotal;

    const gen = this.playGen;
    this.anchorChartTime = chartTime;
    this.anchorCtxTime = startCtxTime;
    this.playing = true;
    this.waitingFirstChunk = false;
    this.stretcherActive = false;
    this.streamEOF = false;
    this.reachedTarget = false;
    this.minQueuedChunks = -1;
    this.refreshHostClock();

    if (this.rate >= 0.999) {
      this.lastBeginWarm = true;
      const src = this.ctx.createBufferSource();
      src.buffer = this.song.audioBuffer;
      src.connect(this.gainNode);

      if (songTime >= 0) {
        if (songTime < this.song.duration) {
          src.start(startCtxTime, songTime);
        }
      } else {
        src.start(startCtxTime + -songTime, 0);
      }

      this.activeSources.add(src);
      src.onended = () => {
        this.activeSources.delete(src);
        try {
          src.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      };
    } else if (songTime >= this.song.duration) {
      this.lastBeginWarm = true;
      this.streamEOF = true;
    } else {
      this.lastBeginWarm = this.workerWarmed;
      const worker = this.ensureWorker();
      const rate = this.rate;
      const sharp = this.sharp;
      const rapidSwitch = t0 - this.lastStretchedBeginAtMs < GameAudio.rapidSwitchWindowMs;
      this.lastStretchedBeginAtMs = t0;

      this.stretcherActive = true;
      this.waitingFirstChunk = true;
      this.pendingSongTime = songTime;
      this.receivedChunks = 0;
      this.lastRequestedSeq = GameAudio.initialLookaheadChunks;

      const startFrame = songTime >= 0 ? Math.round(songTime * this.song.sampleRate) : 0;
      const dispatchStart = () => {
        if (!this.playing || this.playGen !== gen) return;
        const msg: RubberBandWorkerInMessage = {
          type: 'start',
          gen,
          rate,
          sharp,
          startFrame,
          ctxSampleRate: this.ctx.sampleRate,
          targetSeq: GameAudio.initialLookaheadChunks,
        };
        worker.postMessage(msg);
      };

      if (rapidSwitch) {
        this.debounceTimer = window.setTimeout(() => {
          this.debounceTimer = null;
          dispatchStart();
        }, GameAudio.rapidSwitchDebounceMs);
      } else {
        dispatchStart();
      }
    }

    this.lastBeginMs = performance.now() - t0;
  }

  private handleWorkerMessage(msg: RubberBandWorkerOutMessage): void {
    if (msg.type === 'warmed') {
      this.workerWarmed = true;
      return;
    }

    // Discard any delayed chunks or errors belonging to canceled/superseded generations
    if (!this.playing || msg.gen !== this.playGen) return;

    if (msg.type === 'error') {
      console.error('Rubber Band Worker 処理エラー:', msg.message);
      this.halt();
      return;
    }

    this.workerWarmed = true;

    if (this.waitingFirstChunk) {
      this.waitingFirstChunk = false;
      const startCtxTime = this.ctx.currentTime + 0.05;
      this.anchorCtxTime = startCtxTime;
      this.refreshHostClock();
      this.nextChunkCtxTime =
        this.pendingSongTime >= 0
          ? startCtxTime
          : startCtxTime + -this.pendingSongTime / this.rate;
    }

    if (msg.frames > 0) {
      const ctxRate = this.ctx.sampleRate;
      const buf = this.ctx.createBuffer(2, msg.frames, ctxRate);
      buf.getChannelData(0).set(new Float32Array(msg.left));
      buf.getChannelData(1).set(new Float32Array(msg.right));

      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.gainNode);
      this.activeSources.add(src);
      src.onended = () => {
        this.activeSources.delete(src);
        try {
          src.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      };
      src.start(this.nextChunkCtxTime);
      this.nextChunkCtxTime += msg.frames / ctxRate;
      this.receivedChunks += 1;
      if (this.receivedChunks >= GameAudio.initialLookaheadChunks) {
        this.reachedTarget = true;
      }
      if (this.reachedTarget && !msg.eof) {
        const queued = this.activeSources.size;
        this.minQueuedChunks =
          this.minQueuedChunks < 0 ? queued : Math.min(this.minQueuedChunks, queued);
      }
    }

    if (msg.eof) {
      this.streamEOF = true;
    }
  }

  private refreshHostClock(): void {
    const perfNow = performance.now() / 1000.0;
    const ts =
      typeof this.ctx.getOutputTimestamp === 'function' ? this.ctx.getOutputTimestamp() : null;
    if (
      ts &&
      typeof ts.contextTime === 'number' &&
      typeof ts.performanceTime === 'number' &&
      Number.isFinite(ts.contextTime) &&
      Number.isFinite(ts.performanceTime) &&
      ts.contextTime > 0 &&
      ts.performanceTime > 0 &&
      Math.abs(ts.performanceTime / 1000.0 - perfNow) < 5.0
    ) {
      this.hostToCtxOffset = ts.performanceTime / 1000.0 - ts.contextTime;
    } else {
      this.hostToCtxOffset = perfNow - Math.max(0, this.ctx.currentTime - this.outputLatency);
    }
  }

  /** EditorState.swift :: onFrame engineAudio?.refreshAnchor() */
  refreshAnchor(): void {
    this.refreshHostClock();
    if (
      this.playing &&
      this.stretcherActive &&
      !this.streamEOF &&
      !this.waitingFirstChunk &&
      this.worker
    ) {
      if (this.reachedTarget) {
        const queued = this.activeSources.size;
        this.minQueuedChunks =
          this.minQueuedChunks < 0 ? queued : Math.min(this.minQueuedChunks, queued);
      }
      const queuedSec = this.nextChunkCtxTime - this.ctx.currentTime;
      if (queuedSec < GameAudio.queueAheadSec) {
        const chunkSec = GameAudio.chunkOutFrames / this.ctx.sampleRate;
        const needAhead = Math.ceil(Math.max(0, GameAudio.queueAheadSec + 0.15 - queuedSec) / chunkSec);
        const wantedSeq = this.receivedChunks + Math.max(1, needAhead);
        if (wantedSeq > this.lastRequestedSeq) {
          this.lastRequestedSeq = wantedSeq;
          const msg: RubberBandWorkerInMessage = {
            type: 'credit',
            gen: this.playGen,
            targetSeq: wantedSeq,
          };
          this.worker.postMessage(msg);
        }
      }
    }
  }

  /** EditorState.swift :: a.chartTime(atUptime: h) */
  chartTime(hostSec: number): number {
    if (!this.playing || this.waitingFirstChunk) return this.anchorChartTime;
    if (this.ctx.state !== 'running') return this.anchorChartTime;
    const audibleCtx = hostSec - this.hostToCtxOffset;
    if (audibleCtx <= this.anchorCtxTime) return this.anchorChartTime;
    return this.anchorChartTime + (audibleCtx - this.anchorCtxTime) * this.rate;
  }

  /** EditorState.swift :: a.halt() */
  halt(): void {
    this.playGen += 1;
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.playing = false;
    this.waitingFirstChunk = false;
    this.stretcherActive = false;
    this.streamEOF = true;
    if (this.worker) {
      const msg: RubberBandWorkerInMessage = { type: 'halt', gen: this.playGen };
      this.worker.postMessage(msg);
    }
    for (const src of this.activeSources) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        // Ignore if source has not started or already stopped
      }
      try {
        src.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    }
    this.activeSources.clear();
  }

  /** EditorState.swift :: engineAudio?.shutdown() */
  shutdown(): void {
    this.halt();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.songSentToWorker = false;
    this.workerWarmed = false;
    try {
      this.gainNode.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  }
}
