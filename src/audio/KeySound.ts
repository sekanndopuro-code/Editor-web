// KeySound.swift + KeySoundData.swift
import { getSharedAudioContext, unlockAudioContext } from './AudioEngine';

// KeySoundData.swift :: KeySoundData
const KEY_SOUND_SAMPLE_RATE = 44100; // KeySoundData.swift :: sampleRate
const KEY_SOUND_PEAK = 0.8896; // KeySoundData.swift :: peak
const KEY_SOUND_PCM16_BASE64 =
  'AAADAA4AFwAZABwAMABWAIUAvAD8AKIAt/6Q/KT8mP4OAa0ApfwX/bsBawGu/64ADACK/vT9hv38/eT+CABUARkBTv8K/ST86/2w/5MA7gA3/6kAcgQ1/lLy' +
  'deuD45PcLuc5AToNxPqS5kbqVfFL7S3tlPFQ8WrwhfSe+v/8OAP4CML20eU6+NIOGhhnHo8UQAgjD8ISHwU68YLlc+th9Z39MQ7HGBMRKAYrCloVTQpz+I8A' +
  'fAdCAFX+B/XO6UvyKv8wA8L8G/Pl/nsRiAsJAn0Bn/mO9psFliEyO9o8EzX0N3w1dC6VL64uWigkJYUhsBU+CY8GaAqmDiMP+w0PELwM6wED/Hj4GPdBBlkX' +
  'DhslJ1Q2sTE3J58j0CgyLmwi4xgnFzMA7etw+9ERSxYcENv8gePp4/L68QAt7vTWKcgTxcbFcMMewnjDqsBDsw2m7KkptzC+Hb1OtIqp6KV9qdmtFasNpw6u' +
  'F7fVtm6348R02dvpffdXBVESMSAWKz0wDTWRPMNFQ0vBTS5UYVf1Ur1R6FPeUtNOsEVTN6YpAyD0GkwY+xJ3CgUCd/hu7M3hUdm50UnMvsRGuQmyaLQ8vUDC' +
  'AMCmwEnEqsPsxG/NYdcF3ozinObT6tjwcvfP+7D/dwViDd8WZx+qJvgvLzptP28+7zvnO6E9y0DRRcRIKkh7SapOlVP8Vopa9F3ZX3JfelxGV11R7UyOSc9E' +
  'pT/3Oxk3QC8vJ5wfwhbqDSAGHPxN7uTfndL4xYi7gLT5rtSogaICntyaAZfDkyKSGZAyjiOO4o9flI2aip49oKiiqqcjsGy7oshc2DDqNPznC8MWlh/rLLg9' +
  'YUuwU7FW+1SnUWxO4UuBS/xLqkqHRvs+yTWWLokqLihkJQ0hfhtbFPMKKQBC9ZbqSuCY1rHNWsYEweW8Q7qruf+557sLwBnDj8NJw8vCHcM0xgvMptMG3P7j' +
  'hOox7yLznfe+/B0CsgaPCQELpQzZEN4X4R+nKF8yMjtaQUdF1khdTJhOAE9NTYVJUUXSQZs+UjsYOMY1TDVqNi04ajmgOAM1bC8aKfUhxxkyEUsI3v5B9Rzs' +
  'b+QC3uzWuc5Dx8/BXr36tzyxpKqlpYqip6Djn4+h36VEq7exC7oSw9jL+dRl3jzoF/Or/eMGIRAgGikj2ClIL5s0yjjQO88+c0CrP6I9lDqmNsAyTi9zLVAt' +
  'jSx6KtQnySMzHjgYMRLpCzgFPP7c9tTurucy4wjgj9y72Z7Yz9gV2erYXdnp2lrcDN1n3bTdON4u3zng4OB84Z3iDORi5cTm0+j/68Tvg/OY94v8sQJKCiUT' +
  'nBxrJUIsRjE4NSI4QjrDO907hjruOGo3CzZuNQk1zjOyMcwuRivfJ9EkIyIeIAke4RoFFwATJQ6oByoA2fio8TPq5uIt3HjW69GnzUbJUsUewvS/xr4Lvqm9' +
  'v72Cvve/pMH2w8PHkczS0YTXit0G5NzqwPEB+ZYA0gdcDhcUtxigHAEhziVbKSMr3Ct7KxEqjyiJJ84myiXpIx4hDR5jGy4ZJBf6FD8Stw6SChwGvwG4/df5' +
  'JfbT8mzvYevz5rPi1t5O2wjYHdXR0tbRGNMn1kHZnNvd3d/gnuQB6Kbqau1Y8N3yMvXa90j77//dBR4MYBHMFZUa6R+3JP8nQSpzLAUugy6xLi8vMTBXMVAy' +
  'fzN0NJ40uDSmNGQz3TCHLeUpISZDIloeBRp4FQ8RCwxDBnwAwPrE9HTu7OeJ4a/bg9a80XTNssqoyafJccrGy4HNws8K0vfTH9bx2NfbBt5u36Tgd+JR5cTo' +
  'oez+8B71wfi4/DoBAQa4Co4OOhGxE8AWFhoqHbAfLCFoIY0gyR7xHKobKRoMGOkVkhOnEIYNjArkB48FggMEArQArv5Y/D76b/ds8wfvu+p/5tLiWuCa3svc' +
  'wNtI3Jjdct9P4rXl2uhE6zHtb++Z8VDzp/WW+Df7H/7CAVUFhAi+C0gP6hJIFpUZ/xy8H1IhViLNIiAiniAKH68dwxyFHBcdTx53H+8f3B9UH5IeLR76HREd' +
  'ThvrGG4VBxGKDOAH9AKR/s/6t/Yb8gbuCOt36N7lreM54pvh8+EE41rkWuWi5Z3lpeWs5fDlX+Zj5ujlf+W+5crmeeij6vDsj+8s85X3OvzeADkFnwlxDgIT' +
  'sxZ5GSQbvRvNG3gbXRqtGC8X4xVVFNQSnhEHEN4NtAsiCXEFHAHS/Nn45fQm8HrrSujM5YjjbeJe4s3iZOPD4yPkteSL5ePmIOjD6IfpCOvv7KruPvAS8iL0' +
  'Tfap+Gn7zP6nAnoG5wnlDMAPdhLxFHEXtBldG58clh01HoQevB72HsEeOh7CHcccTBsIGuAYtRemFrEV8xQJFFMSDBDsDdsLVQnGBp4EZQISADr+A/0+/G37' +
  '+fnM92f1kPMI8tvvU+0366fpVeiv5h7ld+Qa5FnjkOI04p3izeNr5V/n0unl7IHwfPRv+Ln7kv6ZAbkE6QffCtUMBw5WD/cQfRKTE5oU0hXPFmEXfRfVFmoV' +
  'gxNcERQPrwwLCuoGYQOL/0r77Pa28pbu0+qa58jkh+L64BLgqt+p3wLglOCK4QLjouSj5lnpUex4763yOvVD9zn5I/t6/VsAKQPIBSEI4wmgC+0NWRCnEvMU' +
  'BBfYGHwanBsaHPkbXhukGq0ZixjRFzMXABY5FC8SSxDNDqMN+wzSDI0M6gtAC7sKKgpZCXwIGAhsCDEJuglOCesHOAabBL4CAABv/NH4h/VE8tjuhuu56D/m' +
  'vOPl4U/hKOEQ4cThl+Mt5gHp+euh79PzovcU+4f+kgFSBH8H9QoFDncQdxIAFNkUPRXHFZwWNBfcFn0VoBNuEdYObAx7CmQI1AXiAoP/JfyD+Xr3X/UC81vw' +
  'Qu0c6mfn3+Rw4p7gUt813r/dSt6K3z7hb+ND5nzpauz07o3xbfS/90j7Yv41AUUEIAclCWwKigv3DDQOmQ6iDrkOVw6VDUENgQ26DV8NkgzQCwULAwpBCfUI' +
  'zQjhCF0J0gkLCoUKagv8C9wLugvsC+ULzws5DIoMKQyrC2UL6wolCksJSgjoBvYEvwLSAPj+yfyN+pn49vbM9S319vTw9L/0C/S78hzx7e+z7zTwIPGK8mL0' +
  'ZPbB+Az8SQCiBCgInApqDCoOCBB6ETcSqhKEEggRDQ/WDSgNbQyWC5YKPgkkB08E7gF/AOf+iPzw+aH3kvWE837xu+8J7h3s4emA543lVuS349bjkORv5avm' +
  'T+gQ6m3sb+8D8uPzpvWd9wv6AP0NAMwC3gSnBTEFuQQuBQoGrgYlByEHaAadBT8F9ARJBDwDKAJEAWwAtP+j/1cALgH2AVIDbAXuB8wKSA2VDtIPDxJRFHQV' +
  'ZRWDFF0TLhK6EKkOuAtiCFkFbgKP/yX9FPs4+ZT3Cfb19Lz0IfWQ9XT1BvUS9Y31R/aX99f4Mvk/+Y/5F/oy+xb9S/9LAesCRgSQBf8GmwglCm8LXgzODAMN' +
  'fQ1XDiwPig95DzMP4Q7dDvAOJg5XDCUK0gcYBdABgv6b+7r4wfUQ86Twa+5m7GnqyuhT6BHpWeqr68fszO1F74TxdfR196b5R/sZ/e7+cgCOASYCSgLqAS8B' +
  'lQAAAJ3/2f8+AIQAvgCQAAwAm/9p/4//2P/6/7v/L/88/xYAzQBDAd4BbwL7ArwDnwSBBUwGBwewBzEIkQjkCFwJDQppCs8JcgjQBgUFOQOCAXf/GP0b+/75' +
  'm/lw+UX5pPm5+qn7z/t3+zP7Dvu5+jf6sPkT+Xf4+feK92n3G/ic+Vj77Pxl/vz/3wEFBEAGTQjjCRMLFwwCDRAOZw+rEBMRKxDKDuYNDQ22Cx4KjAgUB1sF' +
  'NQMjAR7/u/wD+gz3IPS08b/vGO637KnrKes766TrQ+w77cDukvBr8l/0T/ZD+ID62/z4/nMAEQFEAa0BjwK5A6YEGgUOBVsEHAO5AckAagDo/zT//f5F/+n/' +
  '4wDSAYoCHwOpA6YEHgZHB+sHbAiKCPMHTAc/B38Hoge7B9MHpgcSB4IGRgbYBeYEpwMJAmIAWv+n/uP9Pf3M/Kn82vwu/Z393v2N/d78C/wa+yn6OPk6+Df3' +
  'QfZ+9R31K/Wi9bT2efhU+t/7nv3r/1ICGgQVBQUGggclCVAK+gqnC5kMcQ3wDfkNRg3/C4MKzwjxBiEFegPrAUAAd/7K/HX7U/ry+Gb3H/b99MfzuvIT8uTx' +
  'KPLM8pXzNfTF9Gv12fUX9qz2nPd1+Dj5MfpQ+2X8cP1F/sn+KP8p/5L+wP0Y/cv83/wc/Zn9nf4IAJ0BNAOkBOEF5gakByEIkwgRCTUJrwjRB/EGAQYoBccE' +
  '0gQNBYgFDwY1BikGLgYDBr4FtAW4BVwFZwQJA8EBxQDa/8L+jP17/Kz79fpf+h76Dfrn+dr5B/pR+s76k/tL/M/8bP1I/iv/5v+JAE0BEwKXAgsDqgNpBEcF' +
  'SgZpB3MIJgm6CbEK1wugDBUNRw3mDNwLXAqWCMEG1ASSAioACP5H/ML6cPlw+LD34vYD9lr19vTY9BT1W/VY9S31E/U99eT1wfZT96/3G/iP+Az5r/lO+rj6' +
  'IPvU+5f89Pzy/Nr81Pz+/EL9cv2v/Qz+SP5y/rn+8P4i/4r/8v9VAP4AsgEfAmsCgAInApoBFwGpAGUAIwCV//n+1P43/8//agAOAaoBGgJsArwC/QIYAxwD' +
  'NgNiA1sDMwMtA/YCQAJ2Aa8Agv81/mD98fyl/G78V/yh/Fn9L/4W/xoA6QCHAWIChgOrBLAFiwZKB/YHZQiJCKUI8AhJCXEJeQmDCV8JEwkCCSYJDwmYCN4H' +
  'DAdWBr8FGAV5BBEErAMPA0ACUQE7APf+q/2Y/KP7h/pX+S/4Ivd79jT2Bvb99ST2Y/ab9p/2mfb49oH3tve59+T3RPjB+Fj59flt+sb6Pvvl+4H80/zz/D79' +
  'xv1i/h7//f/DACsBPQFbAZMBbAHPABYAc//l/jz+Xv2O/PL7lvuh+/77ivwf/Xf9r/0Q/oj+Kv8kACQBzgEpAnkC4wI0AzgD0wICAhcBVgCO/63+8v2j/c/9' +
  'M/6u/kD/q//c/wEAMACkAH8BXgLcAu8C6AIhA3kDzwNBBL4EWQU+BhYHhge/BxoIoQgVCYMJJgqHCiYKYwmvCAYIQgdYBmsFhASjAw8D2QK6Ao4COAKoAQYB' +
  'fwApAML/6/7f/Qf9bvwH/LX7afs4++z6Wfq6+T756/i0+I/4tPhA+f753vrP+6j8fv1c/hv/n//Z//z/UgDUAGUB5gEAAnkBowD8/47/A/9V/qT90/z5+1r7' +
  'GPs0+3T7sfv8+xv8Avw+/Or8fv3Z/S7+eP6J/nn+q/4o/3j/a/81/+f+W/6d/QH9yPzm/DX9i/3P/Rv+qP6H/3YAIgFzAXkBWAFVAYgB0gEdAiUCugEtAbcA' +
  'TgAlAGMA1ABUAcwBIAKFAjwDIAT0BLUFeAY6B7wHyQefB5sHnQdgB+0GZAbsBbkFpQU2BTgEBgMNAlsBugAKAFL/rf4y/tL9d/0n/eL8iPwa/KX7Nfvz+u36' +
  '3/qp+pP61Ppi+yH8+/zY/ZX+Dv9r//r/owAbAVsBeAGCAaoB9QFCAqgCHQMwA9MChQJ3AnMCVAILAnEBiQCc//H+g/4m/sP9Vv3w/MD80Pzj/Nv8zPy8/K38' +
  'pPyq/NX8Hv1Z/YX9sv3I/cv92/3q/e/9/P0S/if+M/4o/iv+aP63/u3+HP9Z/5//4f8LABgAGAAPAAwAIgBHAHoAyAAVATsBQQFDAWEBmAHLAfsBNAJpAqoC' +
  'FAONA/0DZgSwBNoEEwVOBVUFHQW0BCkEpQM+A9sCVgKhAc8AAABI/77+av4x/uz9h/0V/cX8qPys/OT8VP29/fb9Jf5w/tr+V//e/2oA9gB0AdoBGQIkAhUC' +
  'EAITAhoCHgISAvkB5AHUAdEB5gHwAdABgQETAawAYAARAK//UP/+/rb+f/5U/jT+Iv4T/gD+6P25/X39XP1R/Tz9J/0r/Un9hf3e/Tv+k/7t/j3/fP+5//D/' +
  'EwAtAEcAUwBPAD8AIAD7/+j/2//F/6r/jP91/3j/kP+k/7P/w//I/8z/6P8bAFAAeACMAJQAlQCVAKEAvQDbAPAA/AAEAQcBCAEOARgBFQH8ANcAsgCWAIYA' +
  'gwCHAIgAfABiAEgAMgAXAPT/zf+s/5b/iP95/2v/ZP9o/3//p//L/+b///8VACgAPwBbAHcAkAClALQAwgDNANMA1wDYANUAzgDHALkAowCMAHMAUwAxABIA' +
  '/f/w/+P/1f/G/7j/q/+j/6T/qv+w/7D/qP+f/5z/n/+m/6z/rf+q/6r/r/+4/8b/0//e/+n/8v/5/wAACAAOABMAFAASAA0ACQAIAAgABQABAPz/9v/x/+7/' +
  '7P/s/+v/6//q/+n/6v/s/+7/8f/z//b/+f/8////AgAEAAYABwAIAAgACAAIAAgACAAHAAcABgAFAAQABAADAAIAAQABAAAAAAAAAAAAAAAAAAAAAAAAAAAA' +
  'AAAAAAAA';

/** KeySound.swift :: KeySound */
export class KeySound {
  static readonly shared = new KeySound();

  private static readonly synthDur = 0.02; // KeySound.swift :: synthDur
  private static readonly softClipDrive = 0; // KeySound.swift :: softClipDrive

  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private buffer: AudioBuffer | null = null;
  private bufferDur = 0.02; // KeySound.swift :: bufferDur
  private _volume = 0.8; // KeySound.swift :: volume
  private scheduled = new Set<AudioBufferSourceNode>();

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

  /** KeySound.swift :: KeySound.prepare() */
  prepare(): void {
    this.ensureConfigured();
  }

  private ensureConfigured(): boolean {
    try {
      const ctx = getSharedAudioContext();
      if (this.ctx !== ctx) {
        this.ctx = ctx;
        this.gainNode = ctx.createGain();
        this.gainNode.gain.value = this._volume;
        this.gainNode.connect(ctx.destination);
        this.buffer = KeySound.makeSampleBuffer(ctx) ?? KeySound.makeFallbackBuffer(ctx);
        this.bufferDur = this.buffer ? this.buffer.duration : 0.02;
      }
      return this.buffer !== null && this.gainNode !== null;
    } catch {
      return false;
    }
  }

  /** KeySound.swift :: KeySound.playNow() */
  playNow(): void {
    if (this._volume <= 0.001) return;
    unlockAudioContext();
    if (!this.ensureConfigured() || !this.ctx || !this.gainNode || !this.buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gainNode);
    this.trackSource(src);
    src.start(0);
  }

  /** KeySound.swift :: KeySound.play(atTime:) mapped onto shared AudioContext time */
  playAtCtxTime(whenCtx: number): void {
    if (this._volume <= 0.001) return;
    if (!this.ensureConfigured() || !this.ctx || !this.gainNode || !this.buffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gainNode);
    this.trackSource(src);
    if (whenCtx > now + 0.002) {
      src.start(whenCtx);
    } else {
      src.start(0);
    }
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

  /** KeySound.swift :: KeySound.makeSampleBuffer(format:) */
  private static makeSampleBuffer(ctx: AudioContext): AudioBuffer | null {
    try {
      const bin = atob(KEY_SOUND_PCM16_BASE64);
      const byteLen = bin.length;
      const count = Math.floor(byteLen / 2);
      if (count <= 0) return null;
      const buf = ctx.createBuffer(1, count, KEY_SOUND_SAMPLE_RATE);
      const ch = buf.getChannelData(0);
      const drive = KeySound.softClipDrive;
      const peak = KEY_SOUND_PEAK;
      const norm = drive > 0 ? Math.tanh(drive) : 1;
      for (let i = 0; i < count; i++) {
        const lo = bin.charCodeAt(2 * i) & 0xff;
        const hi = bin.charCodeAt(2 * i + 1) & 0xff;
        const raw = ((hi << 8) | lo) << 16 >> 16; // Int16 little-endian sign-extend
        let s = raw / 32768;
        if (drive > 0) {
          s = (Math.tanh((drive * s) / peak) / norm) * peak;
        }
        ch[i] = s;
      }
      return buf;
    } catch {
      return null;
    }
  }

  /** KeySound.swift :: KeySound.makeBuffer(format:) synthesized fallback */
  private static makeFallbackBuffer(ctx: AudioContext): AudioBuffer {
    const sr = KEY_SOUND_SAMPLE_RATE;
    const dur = KeySound.synthDur;
    const count = Math.max(1, Math.floor(sr * dur));
    const buf = ctx.createBuffer(1, count, sr);
    const ch = buf.getChannelData(0);
    const base = 6600.0; // KeySound.swift :: base (Hz)
    const drive = 100.0; // KeySound.swift :: drive
    const partials: readonly [number, number, number][] = [
      [1.0, 1.0, 0.012],
      [2.76, 0.5, 0.008],
      [5.4, 0.22, 0.005],
    ];
    const norm = Math.tanh(drive);
    let seed = 12345 >>> 0;
    for (let i = 0; i < count; i++) {
      const t = i / sr;
      let s = 0;
      for (const [ratio, amp, tau] of partials) {
        s += amp * Math.sin(2.0 * Math.PI * base * ratio * t) * Math.exp(-t / tau);
      }
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const noise = (seed / 4294967295.0) * 2.0 - 1.0;
      s += 0.3 * noise * Math.exp(-t / 0.0012);
      s *= Math.min(1.0, t / 0.0004); // 0.4ms rise
      const tail = dur - t;
      if (tail < 0.008) s *= tail / 0.008; // 8ms fadeout
      ch[i] = (Math.tanh(drive * s) / norm) * 0.9;
    }
    return buf;
  }
}
