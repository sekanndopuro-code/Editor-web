// RubberBandPCMSource.swift + AudioController.swift (PCMSource, SongPCMSource)
// Backed by Rubber Band Library compiled to WebAssembly (rubberband-wasm).
import { RubberBandInterface, RubberBandOption, type RubberBandState } from 'rubberband-wasm';
import rubberbandWasmUrl from 'rubberband-wasm/dist/rubberband.wasm?url';

export interface PCMSource {
  readonly sampleRate: number;
  seek(frame: number): void;
  read(
    l: Float32Array,
    lOffset: number,
    r: Float32Array,
    rOffset: number,
    frames: number
  ): number;
}

export interface SongPCMView {
  readonly sampleRate: number;
  readonly frames: number;
  readonly left: Float32Array;
  readonly right: Float32Array;
}

let cachedInterface: RubberBandInterface | null = null;
let loadingPromise: Promise<RubberBandInterface> | null = null;

export function getCachedRubberBand(): RubberBandInterface | null {
  return cachedInterface;
}

export function preloadRubberBand(): void {
  void ensureRubberBand().catch(() => {
    // Retried on explicit playback start if preloading failed transiently
  });
}

export async function ensureRubberBand(): Promise<RubberBandInterface> {
  if (cachedInterface) return cachedInterface;
  if (!loadingPromise) {
    loadingPromise = (async () => {
      const response = await fetch(rubberbandWasmUrl);
      if (!response.ok) {
        throw new Error(`rubberband.wasm の読み込みに失敗しました (${response.status})`);
      }
      let module: WebAssembly.Module;
      if (typeof WebAssembly.compileStreaming === 'function') {
        try {
          module = await WebAssembly.compileStreaming(response.clone());
        } catch {
          const bytes = await response.arrayBuffer();
          module = await WebAssembly.compile(bytes);
        }
      } else {
        const bytes = await response.arrayBuffer();
        module = await WebAssembly.compile(bytes);
      }
      const iface = await RubberBandInterface.initialize(module);
      cachedInterface = iface;
      return iface;
    })().catch((err) => {
      loadingPromise = null;
      throw err;
    });
  }
  return loadingPromise;
}

/**
 * AudioController.swift :: SongPCMSource
 * Lightweight view over already-decoded SongPCM buffers.
 */
export class SongPCMSource implements PCMSource {
  readonly song: SongPCMView;
  private pos = 0;

  constructor(song: SongPCMView) {
    this.song = song;
  }

  get sampleRate(): number {
    return this.song.sampleRate;
  }

  seek(frame: number): void {
    this.pos = Math.max(0, Math.min(Math.trunc(frame), this.song.frames));
  }

  read(
    l: Float32Array,
    lOffset: number,
    r: Float32Array,
    rOffset: number,
    frames: number
  ): number {
    const n = Math.min(frames, this.song.frames - this.pos);
    if (n <= 0) return 0;
    l.set(this.song.left.subarray(this.pos, this.pos + n), lOffset);
    r.set(this.song.right.subarray(this.pos, this.pos + n), rOffset);
    this.pos += n;
    return n;
  }
}

/**
 * RubberBandPCMSource.swift :: RubberBandPCMSource
 * Pitch-preserving time-stretcher matching the Swift implementation's exact options and latency alignment:
 *   ProcessRealTime | ThreadingNever | ChannelsTogether | EngineFiner (R3) or WindowShort (R2)
 * Output frame n corresponds to source frame (want + n * rate) with startup delay trimmed via pad + skip.
 */
export class RubberBandPCMSource implements PCMSource {
  /** RubberBandPCMSource.swift :: RubberBandPCMSource.trimFrames */
  static trimFrames = 0;
  /** RubberBandPCMSource.swift :: RubberBandPCMSource.finerMinRate (0.0 = always use EngineFiner R3) */
  static finerMinRate = 0.0;

  readonly sampleRate: number;
  readonly rate: number;
  readonly engineLabel: string;

  private readonly rb: RubberBandInterface;
  private readonly base: PCMSource;
  private readonly state: RubberBandState;
  private readonly maxIn = 4096;

  private readonly inLPtr: number;
  private readonly inRPtr: number;
  private readonly outLPtr: number;
  private readonly outRPtr: number;
  private readonly dumpLPtr: number;
  private readonly dumpRPtr: number;
  private readonly inPtrs: number;
  private readonly outPtrs: number;

  private readonly jsInL = new Float32Array(4096);
  private readonly jsInR = new Float32Array(4096);

  private skip = 0;
  private silence = 0;
  private baseEOF = false;
  private sentFinal = false;
  private disposed = false;

  constructor(rb: RubberBandInterface, base: PCMSource, rate: number, sharp = false) {
    // RubberBandPCMSource.swift :: init(base:rate:sharp:)
    const r = Math.min(Math.max(rate, 0.05), 1.0);
    let opts =
      RubberBandOption.RubberBandOptionProcessRealTime |
      RubberBandOption.RubberBandOptionThreadingNever |
      RubberBandOption.RubberBandOptionChannelsTogether;
    const finer = !sharp && r >= RubberBandPCMSource.finerMinRate;
    if (finer) {
      opts |= RubberBandOption.RubberBandOptionEngineFiner;
    } else {
      opts |= RubberBandOption.RubberBandOptionWindowShort;
    }

    const state = rb.rubberband_new(Math.round(base.sampleRate), 2, opts, 1.0 / r, 1.0);
    if (!state) {
      throw new Error('Rubber Band の初期化に失敗しました');
    }
    rb.rubberband_set_max_process_size(state, this.maxIn);

    const floatBufBytes = this.maxIn * 4;
    this.rb = rb;
    this.base = base;
    this.rate = r;
    this.sampleRate = base.sampleRate;
    this.engineLabel = finer ? 'Rubber Band R3' : 'Rubber Band R2';
    this.state = state;

    this.inLPtr = rb.malloc(floatBufBytes);
    this.inRPtr = rb.malloc(floatBufBytes);
    this.outLPtr = rb.malloc(floatBufBytes);
    this.outRPtr = rb.malloc(floatBufBytes);
    this.dumpLPtr = rb.malloc(floatBufBytes);
    this.dumpRPtr = rb.malloc(floatBufBytes);
    this.inPtrs = rb.malloc(8);
    this.outPtrs = rb.malloc(8);
  }

  dispose(): void {
    // RubberBandPCMSource.swift :: deinit
    if (this.disposed) return;
    this.disposed = true;
    this.rb.rubberband_delete(this.state);
    this.rb.free(this.inLPtr);
    this.rb.free(this.inRPtr);
    this.rb.free(this.outLPtr);
    this.rb.free(this.outRPtr);
    this.rb.free(this.dumpLPtr);
    this.rb.free(this.dumpRPtr);
    this.rb.free(this.inPtrs);
    this.rb.free(this.outPtrs);
  }

  seek(frame: number): void {
    // RubberBandPCMSource.swift :: seek(to:)
    if (this.disposed) return;
    const want = Math.max(0, Math.trunc(frame));
    this.rb.rubberband_reset(this.state);
    this.rb.rubberband_set_time_ratio(this.state, 1.0 / this.rate);
    this.baseEOF = false;
    this.sentFinal = false;

    const pad = this.rb.rubberband_get_preferred_start_pad(this.state);
    const shift = this.rb.rubberband_get_start_delay(this.state) + RubberBandPCMSource.trimFrames;
    this.skip = Math.max(0, shift);
    this.silence = Math.max(0, -shift);

    const from = want - pad;
    let zeroLead = 0;
    if (from < 0) {
      zeroLead = -from;
      this.base.seek(0);
    } else {
      this.base.seek(from);
    }

    let left = pad;
    while (left > 0) {
      const n = Math.min(left, this.maxIn);
      zeroLead = this.fill(n, zeroLead);
      this.process(n, false);
      left -= n;
    }
  }

  read(
    l: Float32Array,
    lOffset: number,
    r: Float32Array,
    rOffset: number,
    frames: number
  ): number {
    // RubberBandPCMSource.swift :: read(into:_:frames:)
    if (this.disposed || frames <= 0) return 0;
    let done = 0;
    let spins = 0;

    while (done < frames) {
      spins += 1;
      if (spins > 8192) break;

      if (this.silence > 0) {
        const n = Math.min(this.silence, frames - done);
        l.fill(0, lOffset + done, lOffset + done + n);
        r.fill(0, rOffset + done, rOffset + done + n);
        this.silence -= n;
        done += n;
        continue;
      }

      const avail = this.rb.rubberband_available(this.state);
      if (avail < 0) break;
      if (avail === 0) {
        if (this.sentFinal) break;
        this.feedMore();
        continue;
      }

      if (this.skip > 0) {
        const n = Math.min(avail, this.skip, this.maxIn);
        this.rb.memWritePtr(this.outPtrs, this.dumpLPtr);
        this.rb.memWritePtr(this.outPtrs + 4, this.dumpRPtr);
        const got = this.rb.rubberband_retrieve(this.state, this.outPtrs, n);
        if (got <= 0) break;
        this.skip -= got;
        continue;
      }

      const n = Math.min(avail, frames - done, this.maxIn);
      this.rb.memWritePtr(this.outPtrs, this.outLPtr);
      this.rb.memWritePtr(this.outPtrs + 4, this.outRPtr);
      const got = this.rb.rubberband_retrieve(this.state, this.outPtrs, n);
      if (got <= 0) break;

      l.set(this.rb.memReadF32(this.outLPtr, got), lOffset + done);
      r.set(this.rb.memReadF32(this.outRPtr, got), rOffset + done);
      done += got;
    }

    return done;
  }

  private feedMore(): void {
    // RubberBandPCMSource.swift :: feedMore(_:)
    let req = this.rb.rubberband_get_samples_required(this.state);
    if (req <= 0) req = 256;
    req = Math.min(req, this.maxIn);
    this.fill(req, 0);
    if (this.baseEOF) {
      this.sentFinal = true;
      this.process(req, true);
    } else {
      this.process(req, false);
    }
  }

  private fill(n: number, zeroLead: number): number {
    // RubberBandPCMSource.swift :: fill(_:zeroLead:)
    let off = 0;
    if (zeroLead > 0) {
      const z = Math.min(zeroLead, n);
      this.jsInL.fill(0, 0, z);
      this.jsInR.fill(0, 0, z);
      zeroLead -= z;
      off = z;
    }
    while (off < n && !this.baseEOF) {
      const got = this.base.read(this.jsInL, off, this.jsInR, off, n - off);
      if (got <= 0) {
        this.baseEOF = true;
        break;
      }
      off += got;
    }
    if (off < n) {
      this.jsInL.fill(0, off, n);
      this.jsInR.fill(0, off, n);
    }
    return zeroLead;
  }

  private process(n: number, isFinal: boolean): void {
    // RubberBandPCMSource.swift :: process(_:_:final:)
    this.rb.memWrite(this.inLPtr, this.jsInL.subarray(0, n));
    this.rb.memWrite(this.inRPtr, this.jsInR.subarray(0, n));
    this.rb.memWritePtr(this.inPtrs, this.inLPtr);
    this.rb.memWritePtr(this.inPtrs + 4, this.inRPtr);
    this.rb.rubberband_process(this.state, this.inPtrs, n, isFinal ? 1 : 0);
  }
}
