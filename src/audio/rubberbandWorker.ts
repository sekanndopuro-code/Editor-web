// Dedicated Web Worker for off-main-thread Rubber Band time-stretching and resampling.
import type { RubberBandInterface } from 'rubberband-wasm';
import {
  SongPCMSource,
  RubberBandPCMSource,
  ensureRubberBand,
  type SongPCMView,
} from './RubberBandPCMSource';

export type RubberBandWorkerInMessage =
  | {
      type: 'setSong';
      left: ArrayBuffer;
      right: ArrayBuffer | null;
      frames: number;
      sampleRate: number;
    }
  | {
      type: 'start';
      gen: number;
      rate: number;
      sharp: boolean;
      startFrame: number;
      ctxSampleRate: number;
      targetSeq: number;
    }
  | {
      type: 'credit';
      gen: number;
      targetSeq: number;
    }
  | {
      type: 'halt';
      gen: number;
    };

export type RubberBandWorkerOutMessage =
  | {
      type: 'chunk';
      gen: number;
      seq: number;
      frames: number;
      left: ArrayBuffer;
      right: ArrayBuffer;
      eof: boolean;
    }
  | {
      type: 'warmed';
    }
  | {
      type: 'error';
      gen: number;
      message: string;
    };

interface WorkerHost {
  addEventListener(type: 'message', listener: (ev: MessageEvent<RubberBandWorkerInMessage>) => void): void;
  postMessage(message: RubberBandWorkerOutMessage, transfer?: Transferable[]): void;
}

const CHUNK_OUT_FRAMES = 8192;
const SRC_BUF_CAP = 32768;

const host = self as unknown as WorkerHost;

let songView: SongPCMView | null = null;
let latestGen = 0;

interface ActiveSession {
  gen: number;
  stretcher: RubberBandPCMSource;
  ctxSampleRate: number;
  ratio: number;
  sameRate: boolean;
  sentSeq: number;
  targetSeq: number;
  eof: boolean;
  srcBufL: Float32Array;
  srcBufR: Float32Array;
  srcBufCount: number;
  srcPos: number;
  srcEOF: boolean;
  scratchL: Float32Array;
  scratchR: Float32Array;
}

let active: ActiveSession | null = null;
let pumpTimer: ReturnType<typeof setTimeout> | null = null;

function disposeActive(): void {
  if (pumpTimer !== null) {
    clearTimeout(pumpTimer);
    pumpTimer = null;
  }
  if (active) {
    active.stretcher.dispose();
    active = null;
  }
}

function schedulePump(): void {
  if (pumpTimer !== null || !active) return;
  if (active.eof || active.sentSeq >= active.targetSeq) return;
  // Yield to the worker event loop between chunks so newer 'halt'/'start' messages preempt immediately.
  pumpTimer = setTimeout(pumpNextChunk, 0);
}

function produceOneChunk(s: ActiveSession): {
  frames: number;
  left: Float32Array;
  right: Float32Array;
  eof: boolean;
} {
  let written = 0;

  if (s.sameRate) {
    const got = s.stretcher.read(s.scratchL, 0, s.scratchR, 0, CHUNK_OUT_FRAMES);
    if (got <= 0) {
      s.eof = true;
    } else {
      written = got;
    }
  } else {
    const ratio = s.ratio;
    while (written < CHUNK_OUT_FRAMES) {
      const idx = Math.floor(s.srcPos);
      if (idx + 1 >= s.srcBufCount && !s.srcEOF) {
        if (idx > 0) {
          const rest = Math.max(0, s.srcBufCount - idx);
          if (rest > 0) {
            s.srcBufL.copyWithin(0, idx, s.srcBufCount);
            s.srcBufR.copyWithin(0, idx, s.srcBufCount);
          }
          s.srcBufCount = rest;
          s.srcPos -= idx;
        }
        const pull = Math.min(8192, SRC_BUF_CAP - s.srcBufCount);
        if (pull > 0) {
          const got = s.stretcher.read(s.srcBufL, s.srcBufCount, s.srcBufR, s.srcBufCount, pull);
          if (got <= 0) {
            s.srcEOF = true;
          } else {
            s.srcBufCount += got;
          }
        }
        continue;
      }

      if (idx >= s.srcBufCount) {
        s.eof = true;
        break;
      }

      const frac = s.srcPos - idx;
      const l0 = s.srcBufL[idx];
      const r0 = s.srcBufR[idx];
      const l1 = idx + 1 < s.srcBufCount ? s.srcBufL[idx + 1] : 0;
      const r1 = idx + 1 < s.srcBufCount ? s.srcBufR[idx + 1] : 0;
      s.scratchL[written] = l0 + (l1 - l0) * frac;
      s.scratchR[written] = r0 + (r1 - r0) * frac;
      written += 1;
      s.srcPos += ratio;
    }

    const drop = Math.floor(s.srcPos);
    if (drop > 0) {
      const keep = Math.max(0, s.srcBufCount - drop);
      if (keep > 0) {
        s.srcBufL.copyWithin(0, drop, s.srcBufCount);
        s.srcBufR.copyWithin(0, drop, s.srcBufCount);
      }
      s.srcBufCount = keep;
      s.srcPos -= drop;
    }
  }

  if (written <= 0) {
    s.eof = true;
    return {
      frames: 0,
      left: new Float32Array(0),
      right: new Float32Array(0),
      eof: true,
    };
  }

  const outL = new Float32Array(written);
  const outR = new Float32Array(written);
  outL.set(s.scratchL.subarray(0, written));
  outR.set(s.scratchR.subarray(0, written));
  return { frames: written, left: outL, right: outR, eof: s.eof };
}

function pumpNextChunk(): void {
  pumpTimer = null;
  const s = active;
  if (!s || s.gen !== latestGen || s.eof || s.sentSeq >= s.targetSeq) {
    return;
  }

  try {
    const chunk = produceOneChunk(s);
    if (s.gen !== latestGen) return;

    const seq = s.sentSeq;
    s.sentSeq += 1;
    const leftBuf = chunk.left.buffer as ArrayBuffer;
    const rightBuf = chunk.right.buffer as ArrayBuffer;
    host.postMessage(
      {
        type: 'chunk',
        gen: s.gen,
        seq,
        frames: chunk.frames,
        left: leftBuf,
        right: rightBuf,
        eof: chunk.eof,
      },
      [leftBuf, rightBuf]
    );
    schedulePump();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    host.postMessage({ type: 'error', gen: s.gen, message: msg });
    disposeActive();
  }
}

async function startSession(msg: Extract<RubberBandWorkerInMessage, { type: 'start' }>): Promise<void> {
  disposeActive();
  latestGen = Math.max(latestGen, msg.gen);
  if (!songView) {
    host.postMessage({ type: 'error', gen: msg.gen, message: '音源が設定されていません' });
    return;
  }

  let rb: RubberBandInterface;
  try {
    rb = await ensureRubberBand();
  } catch (err) {
    if (msg.gen === latestGen) {
      const text = err instanceof Error ? err.message : String(err);
      host.postMessage({ type: 'error', gen: msg.gen, message: text });
    }
    return;
  }

  // Bail immediately if a newer 'start' or 'halt' arrived while WASM was initializing
  if (msg.gen !== latestGen || !songView) return;

  try {
    const stretcher = new RubberBandPCMSource(rb, new SongPCMSource(songView), msg.rate, msg.sharp);
    stretcher.seek(msg.startFrame);

    if (msg.gen !== latestGen) {
      stretcher.dispose();
      return;
    }

    const ratio = songView.sampleRate / msg.ctxSampleRate;
    active = {
      gen: msg.gen,
      stretcher,
      ctxSampleRate: msg.ctxSampleRate,
      ratio,
      sameRate: Math.abs(ratio - 1.0) < 1e-6,
      sentSeq: 0,
      targetSeq: msg.targetSeq,
      eof: false,
      srcBufL: new Float32Array(SRC_BUF_CAP),
      srcBufR: new Float32Array(SRC_BUF_CAP),
      srcBufCount: 0,
      srcPos: 0,
      srcEOF: false,
      scratchL: new Float32Array(CHUNK_OUT_FRAMES),
      scratchR: new Float32Array(CHUNK_OUT_FRAMES),
    };

    pumpNextChunk();
  } catch (err) {
    if (msg.gen === latestGen) {
      const text = err instanceof Error ? err.message : String(err);
      host.postMessage({ type: 'error', gen: msg.gen, message: text });
    }
    disposeActive();
  }
}

host.addEventListener('message', (ev) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'setSong': {
      const left = new Float32Array(msg.left);
      const right = msg.right ? new Float32Array(msg.right) : left;
      songView = {
        left,
        right,
        frames: msg.frames,
        sampleRate: msg.sampleRate,
      };
      // Warm up WASM module early inside the worker as soon as a song loads
      void ensureRubberBand()
        .then(() => {
          host.postMessage({ type: 'warmed' });
        })
        .catch(() => {});
      break;
    }
    case 'halt': {
      if (msg.gen >= latestGen) {
        latestGen = msg.gen;
        disposeActive();
      }
      break;
    }
    case 'start': {
      latestGen = Math.max(latestGen, msg.gen);
      void startSession(msg);
      break;
    }
    case 'credit': {
      if (active && msg.gen === active.gen && msg.gen === latestGen) {
        if (msg.targetSeq > active.targetSeq) {
          active.targetSeq = msg.targetSeq;
          schedulePump();
        }
      }
      break;
    }
  }
});
