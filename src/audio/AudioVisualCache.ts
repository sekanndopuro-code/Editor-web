// Manages precomputed waveform mipmaps and GPU-ready spectrogram tiles for a SongPCM.
import type { SongPCM } from './AudioEngine';
import type {
  AudioVisualWorkerInMessage,
  AudioVisualWorkerOutMessage,
  SpectrogramTileTransfer,
} from './audioVisualWorker';

export interface WaveformLevel {
  rate: number;
  peaks: Uint8Array;
}

export interface WaveformData {
  duration: number;
  levels: WaveformLevel[];
}

export interface SpectrogramTile {
  t0: number;
  t1: number;
  width: number;
  height: number;
  image: ImageBitmap | HTMLCanvasElement;
}

export interface SpectrogramData {
  duration: number;
  width: number;
  rowsPerSec: number;
  tiles: SpectrogramTile[];
}

function isImageBitmap(img: ImageBitmap | HTMLCanvasElement): img is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap;
}

async function decodeTile(tile: SpectrogramTileTransfer): Promise<SpectrogramTile> {
  const clamped = new Uint8ClampedArray(tile.pixels);
  const imgData = new ImageData(clamped, tile.width, tile.rows);

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(imgData);
      return {
        t0: tile.t0,
        t1: tile.t1,
        width: tile.width,
        height: tile.rows,
        image: bitmap,
      };
    } catch {
      // Fallback to offscreen HTMLCanvasElement below
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = tile.width;
  canvas.height = tile.rows;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.putImageData(imgData, 0, 0);
  }
  return {
    t0: tile.t0,
    t1: tile.t1,
    width: tile.width,
    height: tile.rows,
    image: canvas,
  };
}

function closeSpectrogramData(data: SpectrogramData | null): void {
  if (!data) return;
  for (const tile of data.tiles) {
    if (isImageBitmap(tile.image)) {
      try {
        tile.image.close();
      } catch {
        // Ignore already-closed bitmap
      }
    }
  }
}

export class AudioVisualCache {
  private worker: Worker | null = null;
  private song: SongPCM | null = null;
  private songId = 0;
  private songSent = false;

  waveform: WaveformData | null = null;
  spectrogram: SpectrogramData | null = null;

  private waveformRequested = false;
  private spectrogramRequested = false;

  private readonly onReady: () => void;
  private readonly onStatus?: (msg: string) => void;
  private specToastTimer: number | null = null;

  constructor(onReady: () => void, onStatus?: (msg: string) => void) {
    this.onReady = onReady;
    this.onStatus = onStatus;
  }

  setSong(song: SongPCM | null): void {
    if (this.song === song) return;
    this.clearTimers();
    this.song = song;
    this.songId += 1;
    this.songSent = false;
    this.waveform = null;
    this.waveformRequested = false;
    closeSpectrogramData(this.spectrogram);
    this.spectrogram = null;
    this.spectrogramRequested = false;

    if (this.worker) {
      const msg: AudioVisualWorkerInMessage = { type: 'clear' };
      this.worker.postMessage(msg);
    }
  }

  ensureWaveform(need: boolean): void {
    if (!need || !this.song || this.waveform || this.waveformRequested) return;
    this.waveformRequested = true;
    this.sendSongIfNeeded();
    const msg: AudioVisualWorkerInMessage = {
      type: 'computeWaveform',
      songId: this.songId,
    };
    this.ensureWorker().postMessage(msg);
  }

  ensureSpectrogram(need: boolean): void {
    if (!need || !this.song || this.spectrogram || this.spectrogramRequested) return;
    this.spectrogramRequested = true;
    this.sendSongIfNeeded();

    if (this.onStatus && this.specToastTimer === null) {
      const expectedSongId = this.songId;
      this.specToastTimer = window.setTimeout(() => {
        this.specToastTimer = null;
        if (this.songId === expectedSongId && this.spectrogramRequested && !this.spectrogram) {
          this.onStatus?.('スペクトログラムを計算中...');
        }
      }, 180);
    }

    const msg: AudioVisualWorkerInMessage = {
      type: 'computeSpectrogram',
      songId: this.songId,
    };
    this.ensureWorker().postMessage(msg);
  }

  dispose(): void {
    this.clearTimers();
    this.song = null;
    this.songId += 1;
    this.songSent = false;
    this.waveform = null;
    this.waveformRequested = false;
    closeSpectrogramData(this.spectrogram);
    this.spectrogram = null;
    this.spectrogramRequested = false;
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private clearTimers(): void {
    if (this.specToastTimer !== null) {
      window.clearTimeout(this.specToastTimer);
      this.specToastTimer = null;
    }
  }

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./audioVisualWorker.ts', import.meta.url), {
        type: 'module',
      });
      this.worker.onmessage = (ev: MessageEvent<AudioVisualWorkerOutMessage>) => {
        this.handleWorkerMessage(ev.data);
      };
      this.worker.onerror = (err) => {
        console.error('AudioVisual Worker エラー:', err);
        this.clearTimers();
        this.waveformRequested = false;
        this.spectrogramRequested = false;
      };
    }
    return this.worker;
  }

  private sendSongIfNeeded(): void {
    if (this.songSent || !this.song) return;
    this.songSent = true;
    const worker = this.ensureWorker();
    const { left, right, frames, sampleRate } = this.song;
    const mono = new Float32Array(frames);
    if (right === left) {
      mono.set(left);
    } else {
      for (let i = 0; i < frames; i++) {
        mono[i] = 0.5 * (left[i] + right[i]);
      }
    }
    const msg: AudioVisualWorkerInMessage = {
      type: 'setSong',
      songId: this.songId,
      mono: mono.buffer,
      frames,
      sampleRate,
    };
    worker.postMessage(msg, [mono.buffer]);
  }

  private handleWorkerMessage(msg: AudioVisualWorkerOutMessage): void {
    if (msg.songId !== this.songId) return;

    if (msg.type === 'error') {
      console.error(`AudioVisual (${msg.kind}) 計算エラー:`, msg.message);
      if (msg.kind === 'waveform') {
        this.waveformRequested = false;
      } else {
        this.clearTimers();
        this.spectrogramRequested = false;
      }
      return;
    }

    if (msg.type === 'waveform') {
      this.waveform = {
        duration: msg.duration,
        levels: msg.levels.map((lv) => ({
          rate: lv.rate,
          peaks: new Uint8Array(lv.peaks),
        })),
      };
      this.waveformRequested = false;
      this.onReady();
      return;
    }

    if (msg.type === 'spectrogram') {
      const expectedId = msg.songId;
      void Promise.all(msg.tiles.map((t) => decodeTile(t))).then((tiles) => {
        if (expectedId !== this.songId) {
          for (const tile of tiles) {
            if (isImageBitmap(tile.image)) {
              try {
                tile.image.close();
              } catch {
                // Ignore
              }
            }
          }
          return;
        }
        const hadPendingNotice = this.specToastTimer === null;
        this.clearTimers();
        closeSpectrogramData(this.spectrogram);
        this.spectrogram = {
          duration: msg.duration,
          width: msg.width,
          rowsPerSec: msg.rowsPerSec,
          tiles,
        };
        this.spectrogramRequested = false;
        if (hadPendingNotice) {
          this.onStatus?.('スペクトログラムの準備ができました');
        }
        this.onReady();
      });
    }
  }
}
