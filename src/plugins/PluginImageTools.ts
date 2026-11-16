// PluginImageTools & rendering helpers ported from PluginImagePreview.swift.
// Shared by DecodeImage (Lua bridge) and ShowImagePreview UI so preview matches created holds identically.

import { decodeImageToUpright, PLUGIN_MAX_LONG_SIDE } from '../core/ImageNormalize';

export const PLUGIN_IMAGE_LANE_WIDTH = 256;

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV = (() => {
  const t = new Int16Array(256).fill(-1);
  for (let i = 0; i < 64; i++) t[B64_CHARS.charCodeAt(i)] = i;
  return t;
})();

export function base64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '');
  const n = clean.length;
  const out = new Uint8Array(Math.floor((n * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < n; i++) {
    const code = B64_REV[clean.charCodeAt(i)];
    if (code < 0) continue;
    acc = (acc << 6) | code;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  const n = bytes.length;
  for (let i = 0; i < n; i += 3) {
    const a = bytes[i];
    const b = i + 1 < n ? bytes[i + 1] : 0;
    const c = i + 2 < n ? bytes[i + 2] : 0;
    out += B64_CHARS[a >> 2] + B64_CHARS[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < n ? B64_CHARS[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < n ? B64_CHARS[c & 63] : '=';
  }
  return out;
}

export interface DecodedSourceImage {
  srcWidth: number;
  srcHeight: number;
  bitmap: ImageBitmap | HTMLImageElement;
  close(): void;
}

export async function loadPluginSourceImage(bytes: Uint8Array): Promise<DecodedSourceImage | null> {
  if (bytes.byteLength === 0) return null;
  try {
    const decoded = await decodeImageToUpright(bytes);
    const longSide = Math.max(decoded.width, decoded.height);
    if (longSide > PLUGIN_MAX_LONG_SIDE && typeof createImageBitmap === 'function') {
      const scale = PLUGIN_MAX_LONG_SIDE / longSide;
      const targetW = Math.max(1, Math.round(decoded.width * scale));
      const targetH = Math.max(1, Math.round(decoded.height * scale));
      try {
        const resized = await createImageBitmap(decoded.source, {
          resizeWidth: targetW,
          resizeHeight: targetH,
          resizeQuality: 'high',
        });
        decoded.close();
        return {
          srcWidth: resized.width,
          srcHeight: resized.height,
          bitmap: resized,
          close: () => resized.close(),
        };
      } catch {
        // Fall through to full-size source if resize options are unsupported
      }
    }
    return {
      srcWidth: decoded.width,
      srcHeight: decoded.height,
      bitmap: decoded.source,
      close: () => decoded.close(),
    };
  } catch {
    return null;
  }
}

export function resizeSourceImageToGray(
  src: DecodedSourceImage,
  w: number,
  h: number
): Uint8Array | null {
  if (w < 1 || h < 1 || w > 4096 || h > 65536 || w * h > 64_000_000) return null;

  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    ctx = c.getContext('2d', { willReadFrequently: true });
  } else if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    ctx = c.getContext('2d', { willReadFrequently: true });
  }
  if (!ctx) return null;

  // Transparent pixels are composited onto opaque white (matching PluginImageTools.gray)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) {
    ctx.imageSmoothingQuality = 'high';
  }
  ctx.drawImage(src.bitmap, 0, 0, w, h);

  const imgData = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    // BT.601 luminance matching CGColorSpaceCreateDeviceGray conversion
    const y = Math.round(0.299 * imgData[p] + 0.587 * imgData[p + 1] + 0.114 * imgData[p + 2]);
    out[i] = y < 0 ? 0 : y > 255 ? 255 : y;
  }
  return out;
}

export async function decodeImageBytesToGray(
  bytes: Uint8Array,
  w: number,
  h: number
): Promise<Uint8Array | null> {
  const src = await loadPluginSourceImage(bytes);
  if (!src) return null;
  try {
    return resizeSourceImageToGray(src, w, h);
  } finally {
    src.close();
  }
}

export function renderGrayPreviewRgba(
  gray: Uint8Array,
  w: number,
  h: number,
  threshold: number,
  invert: boolean,
  showGray: boolean
): { rgba: Uint8ClampedArray; holds: number } {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const prev = new Uint8Array(w);
  let holds = 0;

  for (let i = 0; i < h; i++) {
    const row = i * w;
    for (let x = 0; x < w; x++) {
      const v = gray[row + x];
      let dark = v < threshold;
      if (invert) dark = !dark;
      if (dark && prev[x] === 0) holds += 1;
      prev[x] = dark ? 1 : 0;
      const o = (row + x) * 4;
      if (showGray) {
        rgba[o] = v;
        rgba[o + 1] = v;
        rgba[o + 2] = v;
        rgba[o + 3] = 255;
      } else if (dark) {
        rgba[o] = 0x5b;
        rgba[o + 1] = 0xe0;
        rgba[o + 2] = 0xff;
        rgba[o + 3] = 255;
      } else {
        rgba[o] = 0x12;
        rgba[o + 1] = 0x16;
        rgba[o + 2] = 0x1e;
        rgba[o + 3] = 255;
      }
    }
  }
  return { rgba, holds };
}
