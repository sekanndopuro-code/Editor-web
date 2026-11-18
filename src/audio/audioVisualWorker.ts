// Dedicated Web Worker for off-main-thread waveform mipmap and spectrogram STFT generation.

export type AudioVisualWorkerInMessage =
  | {
      type: 'setSong';
      songId: number;
      mono: ArrayBuffer;
      frames: number;
      sampleRate: number;
    }
  | {
      type: 'computeWaveform';
      songId: number;
    }
  | {
      type: 'computeSpectrogram';
      songId: number;
    }
  | {
      type: 'clear';
    };

export interface SpectrogramTileTransfer {
  t0: number;
  t1: number;
  width: number;
  rows: number;
  pixels: ArrayBuffer;
}

export interface WaveformLevelTransfer {
  rate: number;
  peaks: ArrayBuffer;
}

export type AudioVisualWorkerOutMessage =
  | {
      type: 'waveform';
      songId: number;
      duration: number;
      levels: WaveformLevelTransfer[];
    }
  | {
      type: 'spectrogram';
      songId: number;
      duration: number;
      width: number;
      rowsPerSec: number;
      tiles: SpectrogramTileTransfer[];
    }
  | {
      type: 'error';
      songId: number;
      kind: 'waveform' | 'spectrogram';
      message: string;
    };

interface WorkerHost {
  addEventListener(type: 'message', listener: (ev: MessageEvent<AudioVisualWorkerInMessage>) => void): void;
  postMessage(message: AudioVisualWorkerOutMessage, transfer?: Transferable[]): void;
}

const host = self as unknown as WorkerHost;

let cachedSongId = -1;
let cachedMono: Float32Array | null = null;
let cachedFrames = 0;
let cachedSampleRate = 0;

// Inferno-like fire colormap matching black -> deep indigo -> crimson -> orange -> amber-gold
const COLOR_STOPS: readonly [number, number, number, number, number][] = [
  [0.0, 0, 0, 0, 0],
  [0.08, 18, 0, 72, 165],
  [0.2, 58, 0, 128, 225],
  [0.36, 148, 8, 52, 245],
  [0.54, 210, 32, 0, 252],
  [0.72, 238, 114, 0, 255],
  [0.88, 252, 186, 48, 255],
  [1.0, 255, 242, 175, 255],
];

const LUT = new Uint8ClampedArray(256 * 4);
for (let i = 0; i < 256; i++) {
  const t = i / 255;
  let s0 = COLOR_STOPS[0];
  let s1 = COLOR_STOPS[COLOR_STOPS.length - 1];
  for (let k = 0; k < COLOR_STOPS.length - 1; k++) {
    if (t >= COLOR_STOPS[k][0] && t <= COLOR_STOPS[k + 1][0]) {
      s0 = COLOR_STOPS[k];
      s1 = COLOR_STOPS[k + 1];
      break;
    }
  }
  const span = s1[0] - s0[0];
  const f = span > 1e-6 ? (t - s0[0]) / span : 0;
  LUT[i * 4] = Math.round(s0[1] + (s1[1] - s0[1]) * f);
  LUT[i * 4 + 1] = Math.round(s0[2] + (s1[2] - s0[2]) * f);
  LUT[i * 4 + 2] = Math.round(s0[3] + (s1[3] - s0[3]) * f);
  LUT[i * 4 + 3] = Math.round(s0[4] + (s1[4] - s0[4]) * f);
}

const FFT_SIZE = 1024;
const HALF_FFT = FFT_SIZE >> 1; // 512 frequency bins
const SPEC_WIDTH = 256; // 2 bins max-pooled per pixel column
const TILE_ROWS = 512;

const HANN = new Float32Array(FFT_SIZE);
for (let i = 0; i < FFT_SIZE; i++) {
  HANN[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
}

const BIT_REV = new Uint16Array(FFT_SIZE);
{
  const bits = Math.round(Math.log2(FFT_SIZE));
  for (let i = 0; i < FFT_SIZE; i++) {
    let x = i;
    let r = 0;
    for (let b = 0; b < bits; b++) {
      r = (r << 1) | (x & 1);
      x >>= 1;
    }
    BIT_REV[i] = r;
  }
}

const TWIDDLE_COS = new Float32Array(HALF_FFT);
const TWIDDLE_SIN = new Float32Array(HALF_FFT);
for (let i = 0; i < HALF_FFT; i++) {
  const ang = (-2 * Math.PI * i) / FFT_SIZE;
  TWIDDLE_COS[i] = Math.cos(ang);
  TWIDDLE_SIN[i] = Math.sin(ang);
}

function fftInPlace(re: Float32Array, im: Float32Array): void {
  for (let i = 0; i < FFT_SIZE; i++) {
    const j = BIT_REV[i];
    if (j > i) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let len = 2; len <= FFT_SIZE; len <<= 1) {
    const half = len >> 1;
    const step = FFT_SIZE / len;
    for (let i = 0; i < FFT_SIZE; i += len) {
      for (let j = 0; j < half; j++) {
        const k = j * step;
        const wr = TWIDDLE_COS[k];
        const wi = TWIDDLE_SIN[k];
        const i2 = i + j + half;
        const tre = re[i2] * wr - im[i2] * wi;
        const tim = re[i2] * wi + im[i2] * wr;
        const i1 = i + j;
        re[i2] = re[i1] - tre;
        im[i2] = im[i1] - tim;
        re[i1] += tre;
        im[i1] += tim;
      }
    }
  }
}

function computeWaveform(songId: number, mono: Float32Array, frames: number, sr: number): void {
  const duration = frames / sr;
  const baseRate = 2000;
  const baseCount = Math.max(1, Math.ceil(duration * baseRate));
  const baseBuf = new ArrayBuffer(baseCount);
  const basePeaks = new Uint8Array(baseBuf);

  for (let i = 0; i < baseCount; i++) {
    const s0 = Math.floor((i * sr) / baseRate);
    const s1 = Math.min(frames, Math.ceil(((i + 1) * sr) / baseRate));
    let maxAbs = 0;
    for (let s = s0; s < s1; s++) {
      const v = mono[s];
      const av = v < 0 ? -v : v;
      if (av > maxAbs) maxAbs = av;
    }
    const q = Math.round(Math.min(1, maxAbs) * 255);
    basePeaks[i] = q;
  }

  const levels: { rate: number; data: Uint8Array; buf: ArrayBuffer }[] = [
    { rate: baseRate, data: basePeaks, buf: baseBuf },
  ];
  let prev = basePeaks;
  let prevRate = baseRate;
  for (let lvl = 0; lvl < 3; lvl++) {
    const nextRate = prevRate / 4;
    const nextLen = Math.max(1, Math.ceil(prev.length / 4));
    const nextBuf = new ArrayBuffer(nextLen);
    const next = new Uint8Array(nextBuf);
    for (let i = 0; i < nextLen; i++) {
      const start = i * 4;
      const end = Math.min(prev.length, start + 4);
      let m = 0;
      for (let j = start; j < end; j++) {
        if (prev[j] > m) m = prev[j];
      }
      next[i] = m;
    }
    levels.push({ rate: nextRate, data: next, buf: nextBuf });
    prev = next;
    prevRate = nextRate;
  }

  const transfers: Transferable[] = [];
  const payload: WaveformLevelTransfer[] = levels.map((lv) => {
    transfers.push(lv.buf);
    return { rate: lv.rate, peaks: lv.buf };
  });

  const out: AudioVisualWorkerOutMessage = {
    type: 'waveform',
    songId,
    duration,
    levels: payload,
  };
  host.postMessage(out, transfers);
}

function computeSpectrogram(songId: number, mono: Float32Array, frames: number, sr: number): void {
  const duration = frames / sr;
  const rowsPerSec = duration > 600 ? 60 : 100;
  const totalRows = Math.max(1, Math.ceil(duration * rowsPerSec));

  const dbGrid = new Float32Array(totalRows * SPEC_WIDTH);
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const normFactor = 1.0 / (FFT_SIZE * 0.25);

  const histBins = 256;
  const histMin = -120;
  const histMax = 12;
  const hist = new Uint32Array(histBins);
  const halfFftOffset = HALF_FFT;

  for (let row = 0; row < totalRows; row++) {
    const centerSample = Math.round(((row + 0.5) / rowsPerSec) * sr);
    const startSample = centerSample - halfFftOffset;

    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = startSample + i;
      const s = idx >= 0 && idx < frames ? mono[idx] : 0;
      re[i] = s * HANN[i];
      im[i] = 0;
    }

    fftInPlace(re, im);

    const rowOffset = row * SPEC_WIDTH;
    for (let x = 0; x < SPEC_WIDTH; x++) {
      // Skip DC bin 0 for column 0 so DC offset does not create an edge stripe
      const b0 = x === 0 ? 1 : x * 2;
      const b1 = x * 2 + 1;
      const m0 = Math.hypot(re[b0], im[b0]);
      const m1 = Math.hypot(re[b1], im[b1]);
      const mag = (m0 > m1 ? m0 : m1) * normFactor;
      const db = 20 * Math.log10(mag + 1e-7);
      dbGrid[rowOffset + x] = db;

      const hIdx = Math.max(
        0,
        Math.min(histBins - 1, Math.floor(((db - histMin) / (histMax - histMin)) * histBins))
      );
      hist[hIdx] += 1;
    }
  }

  // Adaptive dynamic range: find 99.85th percentile to avoid dark spectra on quiet tracks
  const totalCells = totalRows * SPEC_WIDTH;
  const targetRank = Math.floor(totalCells * 0.9985);
  let accum = 0;
  let p998Db = -12;
  for (let h = 0; h < histBins; h++) {
    accum += hist[h];
    if (accum >= targetRank) {
      p998Db = histMin + ((h + 0.5) / histBins) * (histMax - histMin);
      break;
    }
  }
  const refMaxDb = Math.max(-28, Math.min(6, p998Db + 2));
  const refMinDb = refMaxDb - 74;
  const invRange = 1.0 / (refMaxDb - refMinDb);

  const tiles: SpectrogramTileTransfer[] = [];
  const transfers: Transferable[] = [];

  for (let rowStart = 0; rowStart < totalRows; rowStart += TILE_ROWS) {
    const rows = Math.min(TILE_ROWS, totalRows - rowStart);
    const pixelBuf = new ArrayBuffer(SPEC_WIDTH * rows * 4);
    const pixels = new Uint8ClampedArray(pixelBuf);

    for (let r = 0; r < rows; r++) {
      const globalRow = rowStart + r;
      // Store row 0 at top = later time, row (rows-1) at bottom = earlier time
      const destRow = rows - 1 - r;
      const srcOffset = globalRow * SPEC_WIDTH;
      const dstOffset = destRow * SPEC_WIDTH * 4;

      for (let x = 0; x < SPEC_WIDTH; x++) {
        const db = dbGrid[srcOffset + x];
        let norm = (db - refMinDb) * invRange;
        if (norm < 0) norm = 0;
        else if (norm > 1) norm = 1;
        const lutIdx = Math.round(norm * 255) * 4;
        const p = dstOffset + x * 4;
        pixels[p] = LUT[lutIdx];
        pixels[p + 1] = LUT[lutIdx + 1];
        pixels[p + 2] = LUT[lutIdx + 2];
        pixels[p + 3] = LUT[lutIdx + 3];
      }
    }

    const t0 = rowStart / rowsPerSec;
    const t1 = Math.min(duration, (rowStart + rows) / rowsPerSec);
    transfers.push(pixelBuf);
    tiles.push({
      t0,
      t1,
      width: SPEC_WIDTH,
      rows,
      pixels: pixelBuf,
    });
  }

  const out: AudioVisualWorkerOutMessage = {
    type: 'spectrogram',
    songId,
    duration,
    width: SPEC_WIDTH,
    rowsPerSec,
    tiles,
  };
  host.postMessage(out, transfers);
}

host.addEventListener('message', (ev) => {
  const msg = ev.data;
  if (msg.type === 'clear') {
    cachedSongId = -1;
    cachedMono = null;
    cachedFrames = 0;
    cachedSampleRate = 0;
    return;
  }
  if (msg.type === 'setSong') {
    cachedSongId = msg.songId;
    cachedMono = new Float32Array(msg.mono);
    cachedFrames = msg.frames;
    cachedSampleRate = msg.sampleRate;
    return;
  }
  if (msg.type === 'computeWaveform') {
    if (msg.songId !== cachedSongId || !cachedMono) return;
    try {
      computeWaveform(msg.songId, cachedMono, cachedFrames, cachedSampleRate);
    } catch (err) {
      const out: AudioVisualWorkerOutMessage = {
        type: 'error',
        songId: msg.songId,
        kind: 'waveform',
        message: err instanceof Error ? err.message : String(err),
      };
      host.postMessage(out);
    }
    return;
  }
  if (msg.type === 'computeSpectrogram') {
    if (msg.songId !== cachedSongId || !cachedMono) return;
    try {
      computeSpectrogram(msg.songId, cachedMono, cachedFrames, cachedSampleRate);
    } catch (err) {
      const out: AudioVisualWorkerOutMessage = {
        type: 'error',
        songId: msg.songId,
        kind: 'spectrogram',
        message: err instanceof Error ? err.message : String(err),
      };
      host.postMessage(out);
    }
  }
});
