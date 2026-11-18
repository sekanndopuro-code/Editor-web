// KeySound.swift + KeySoundData.swift
// ノーツサウンドは hitsound の ogg 4種類から選べます (HitSoundData.ts に埋め込み)。
import { getSharedAudioContext, SongPCM, unlockAudioContext } from './AudioEngine';
import { HIT_SOUND_BASE64 } from './HitSoundData';

export type NoteSoundId = 'hit' | 'hit-1' | 'hit-2' | 'sample-normal';

/** 設定画面に出す選択肢 (表示順) */
export const NOTE_SOUND_OPTIONS: readonly { id: NoteSoundId; label: string }[] = [
  { id: 'hit', label: 'hit' },
  { id: 'hit-1', label: 'hit-1' },
  { id: 'hit-2', label: 'hit-2' },
  { id: 'sample-normal', label: 'sample-normal' },
];

/** 以前の内蔵音 (hit-1 の低音質版) の代わりになる初期値 */
export const DEFAULT_NOTE_SOUND: NoteSoundId = 'hit-1';

export function isNoteSoundId(v: unknown): v is NoteSoundId {
  return NOTE_SOUND_OPTIONS.some((o) => o.id === v);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i) & 0xff;
  return out;
}

/** KeySound.swift :: KeySound */
export class KeySound {
  static readonly shared = new KeySound();

  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private _volume = 0.8; // KeySound.swift :: volume
  private _soundId: NoteSoundId = DEFAULT_NOTE_SOUND;
  private scheduled = new Set<AudioBufferSourceNode>();

  // 展開済みの音 (選んだ音だけ先に展開し、他は選ばれた時に展開する)
  private buffers = new Map<NoteSoundId, AudioBuffer>();
  private loading = new Map<NoteSoundId, Promise<void>>();
  private failed = new Set<NoteSoundId>();

  private constructor() {}

  get volume(): number {
    return this._volume;
  }

  set volume(v: number) {
    const clamped = Math.min(Math.max(v, 0), 1);
    this._volume = clamped;
    if (this.gainNode && this.ctx) {
      this.gainNode.gain.value = clamped;
      try {
        this.gainNode.gain.setValueAtTime(clamped, this.ctx.currentTime);
      } catch {
        // Ignore if AudioContext is unavailable
      }
    }
  }

  get soundId(): NoteSoundId {
    return this._soundId;
  }

  set soundId(id: NoteSoundId) {
    if (!isNoteSoundId(id)) return;
    this._soundId = id;
    if (this.ensureConfigured()) void this.load(id);
  }

  /** KeySound.swift :: KeySound.prepare() */
  prepare(): void {
    if (this.ensureConfigured()) void this.load(this._soundId);
  }

  private ensureConfigured(): boolean {
    try {
      const ctx = getSharedAudioContext();
      if (this.ctx !== ctx) {
        this.ctx = ctx;
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = this._volume;
        this.gainNode.connect(ctx.destination);
        this.buffers.clear();
        this.loading.clear();
        this.failed.clear();
      }
      return this.gainNode !== null;
    } catch {
      return false;
    }
  }

  private load(id: NoteSoundId): Promise<void> {
    if (this.buffers.has(id) || this.failed.has(id)) return Promise.resolve();
    const pending = this.loading.get(id);
    if (pending) return pending;
    const ctx = this.ctx;
    const p = (async () => {
      try {
        // Web Audio で展開できなければ WASM の ogg-vorbis に切り替わる (iPad Safari 対策)
        const pcm = await SongPCM.decode(base64ToBytes(HIT_SOUND_BASE64[id]), `${id}.ogg`);
        if (this.ctx === ctx) this.buffers.set(id, pcm.audioBuffer);
      } catch {
        this.failed.add(id);
      } finally {
        this.loading.delete(id);
      }
    })();
    this.loading.set(id, p);
    return p;
  }

  /** 設定画面での試聴用: 展開が終わるのを待ってから1回鳴らす */
  async preview(): Promise<void> {
    unlockAudioContext(); // ユーザー操作の中で同期的に解除する
    if (!this.ensureConfigured()) return;
    await this.load(this._soundId);
    this.playNow();
  }

  /** KeySound.swift :: KeySound.playNow() */
  playNow(): void {
    if (this._volume <= 0.001) return;
    unlockAudioContext();
    const buf = this.currentBuffer();
    if (!buf || !this.ctx || !this.gainNode) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gainNode);
    this.trackSource(src);
    src.start(0);
  }

  /** KeySound.swift :: KeySound.play(atTime:) mapped onto shared AudioContext time */
  playAtCtxTime(whenCtx: number): void {
    if (this._volume <= 0.001) return;
    const buf = this.currentBuffer();
    if (!buf || !this.ctx || !this.gainNode) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gainNode);
    this.trackSource(src);
    if (whenCtx > now + 0.002) {
      src.start(whenCtx);
    } else {
      src.start(0);
    }
  }

  /** 選んでいる音の展開済みバッファ (まだなら展開を始めて null) */
  private currentBuffer(): AudioBuffer | null {
    if (!this.ensureConfigured()) return null;
    const buf = this.buffers.get(this._soundId);
    if (buf) return buf;
    void this.load(this._soundId);
    return null;
  }

  /** KeySound.swift :: KeySound.cancelScheduled() */
  cancelScheduled(): void {
    for (const src of Array.from(this.scheduled)) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        // Ignore already-stopped nodes
      }
      try {
        src.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.scheduled.delete(src);
    }
  }

  private trackSource(src: AudioBufferSourceNode): void {
    this.scheduled.add(src);
    src.onended = () => {
      this.scheduled.delete(src);
      try {
        src.disconnect();
      } catch {
        // Ignore disconnect errors
      }
    };
  }
}
