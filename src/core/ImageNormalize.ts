// Image normalization helpers for background images and image-using plugins:
// - Decode HEIC / HEIF photos via `heic-to` (with orientation applied) and convert to JPEG
// - Fix EXIF orientation and convert/downscale background images so the long side is <= 2048px

const HEIC_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

const HEIC_SPECIFIC_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
]);

export const BACKGROUND_MAX_LONG_SIDE = 2048;
export const PLUGIN_MAX_LONG_SIDE = 4096;

function readAscii4(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3]
  );
}

export function isJpegBytes(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasKnownNonHeicMagic(bytes: Uint8Array): boolean {
  if (isJpegBytes(bytes)) return true;
  // PNG
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return true;
  }
  // GIF
  if (
    bytes.byteLength >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return true;
  }
  // WebP
  if (
    bytes.byteLength >= 12 &&
    readAscii4(bytes, 0) === 'RIFF' &&
    readAscii4(bytes, 8) === 'WEBP'
  ) {
    return true;
  }
  // BMP
  if (bytes.byteLength >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return true;
  }
  return false;
}

export function isHeicOrHeif(bytes: Uint8Array, fileName = '', mimeType = ''): boolean {
  if (bytes.byteLength >= 12 && readAscii4(bytes, 4) === 'ftyp') {
    const major = readAscii4(bytes, 8).toLowerCase();
    if (major === 'avif' || major === 'avis') return false;
    if (HEIC_BRANDS.has(major)) return true;

    const boxSize =
      ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    const limit = Math.min(bytes.byteLength, boxSize >= 16 ? boxSize : 64, 256);
    for (let off = 16; off + 4 <= limit; off += 4) {
      const brand = readAscii4(bytes, off).toLowerCase();
      if (HEIC_SPECIFIC_BRANDS.has(brand)) return true;
    }
    return false;
  }

  if (hasKnownNonHeicMagic(bytes)) return false;

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'heic' || ext === 'heif') return true;

  const mime = mimeType.toLowerCase();
  return mime === 'image/heic' || mime === 'image/heif' || mime === 'image/heic-sequence' || mime === 'image/heif-sequence';
}

export function detectImageMime(bytes: Uint8Array, fileName = ''): string {
  if (isJpegBytes(bytes)) return 'image/jpeg';
  if (
    bytes.byteLength >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    bytes.byteLength >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return 'image/gif';
  }
  if (
    bytes.byteLength >= 12 &&
    readAscii4(bytes, 0) === 'RIFF' &&
    readAscii4(bytes, 8) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (bytes.byteLength >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'image/bmp';
  }
  if (bytes.byteLength >= 12 && readAscii4(bytes, 4) === 'ftyp') {
    const major = readAscii4(bytes, 8).toLowerCase();
    if (major === 'avif' || major === 'avis') return 'image/avif';
  }

  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    case 'avif':
      return 'image/avif';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    default:
      return '';
  }
}

export function parseJpegExifOrientation(bytes: Uint8Array): number {
  if (!isJpegBytes(bytes)) return 1;
  let pos = 2;
  const len = bytes.byteLength;

  const readU16 = (off: number, le: boolean): number =>
    le ? bytes[off] | (bytes[off + 1] << 8) : (bytes[off] << 8) | bytes[off + 1];

  const readU32 = (off: number, le: boolean): number =>
    le
      ? (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0
      : ((bytes[off] << 24) | (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]) >>> 0;

  while (pos + 2 <= len) {
    while (pos < len && bytes[pos] === 0xff) pos += 1;
    if (pos >= len) break;
    const marker = bytes[pos++];
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    if (pos + 2 > len) break;

    const segLen = (bytes[pos] << 8) | bytes[pos + 1];
    if (segLen < 2 || pos + segLen > len) break;

    if (
      marker === 0xe1 &&
      segLen >= 14 &&
      bytes[pos + 2] === 0x45 && // E
      bytes[pos + 3] === 0x78 && // x
      bytes[pos + 4] === 0x69 && // i
      bytes[pos + 5] === 0x66 && // f
      bytes[pos + 6] === 0x00 &&
      bytes[pos + 7] === 0x00
    ) {
      const tiff = pos + 8;
      const segEnd = pos + segLen;
      if (tiff + 8 > segEnd) return 1;

      const b0 = bytes[tiff];
      const b1 = bytes[tiff + 1];
      let le: boolean;
      if (b0 === 0x49 && b1 === 0x49) le = true;
      else if (b0 === 0x4d && b1 === 0x4d) le = false;
      else return 1;

      if (readU16(tiff + 2, le) !== 0x002a) return 1;
      const ifdOffset = readU32(tiff + 4, le);
      const ifd = tiff + ifdOffset;
      if (ifd + 2 > segEnd) return 1;

      const count = readU16(ifd, le);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > segEnd) break;
        const tag = readU16(entry, le);
        if (tag === 0x0112) {
          const val = readU16(entry + 8, le);
          return val >= 1 && val <= 8 ? val : 1;
        }
      }
      return 1;
    }

    pos += segLen;
  }

  return 1;
}

export function replaceExtWithJpg(name: string, fallback = 'bg.jpg'): string {
  const trimmed = name.trim();
  if (!trimmed) return fallback;
  const dot = trimmed.lastIndexOf('.');
  const ext = dot >= 0 ? trimmed.slice(dot + 1).toLowerCase() : '';
  if (ext === 'jpg' || ext === 'jpeg') return trimmed;
  const stem = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  return `${stem || 'bg'}.jpg`;
}

export interface DecodedUprightImage {
  width: number;
  height: number;
  source: ImageBitmap | HTMLImageElement;
  wasHeic: boolean;
  close(): void;
}

function toCopiedUint8Array(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
}

async function decodeBlobWithBrowser(blob: Blob): Promise<{
  width: number;
  height: number;
  source: ImageBitmap | HTMLImageElement;
  close(): void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        close: () => bitmap.close(),
      };
    } catch {
      try {
        const bitmap = await createImageBitmap(blob);
        return {
          width: bitmap.width,
          height: bitmap.height,
          source: bitmap,
          close: () => bitmap.close(),
        };
      } catch {
        // Fall through to HTMLImageElement
      }
    }
  }

  if (typeof Image !== 'undefined' && typeof URL !== 'undefined') {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('画像を読み込めませんでした'));
        el.src = url;
      });
      return {
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        source: img,
        close: () => URL.revokeObjectURL(url),
      };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }

  throw new Error('画像デコーダを利用できません');
}

export async function decodeImageToUpright(
  bytes: Uint8Array,
  fileName = '',
  mimeType = ''
): Promise<DecodedUprightImage> {
  if (bytes.byteLength === 0) {
    throw new Error('画像データが空です');
  }
  const copy = toCopiedUint8Array(bytes);

  if (isHeicOrHeif(copy, fileName, mimeType)) {
    const { heicTo } = await import('heic-to');
    const heicBlob = new Blob([copy], { type: mimeType || 'image/heic' });
    if (typeof createImageBitmap === 'function') {
      const bitmap = await heicTo({ blob: heicBlob, type: 'bitmap' });
      return {
        width: bitmap.width,
        height: bitmap.height,
        source: bitmap,
        wasHeic: true,
        close: () => bitmap.close(),
      };
    }
    const jpegBlob = await heicTo({
      blob: heicBlob,
      type: 'image/jpeg',
      quality: 0.92,
    });
    const decoded = await decodeBlobWithBrowser(jpegBlob);
    return { ...decoded, wasHeic: true };
  }

  const detectedMime = mimeType || detectImageMime(copy, fileName);
  const blob = detectedMime ? new Blob([copy], { type: detectedMime }) : new Blob([copy]);
  const decoded = await decodeBlobWithBrowser(blob);
  return { ...decoded, wasHeic: false };
}

async function encodeSourceToBytes(
  source: ImageBitmap | HTMLImageElement,
  targetW: number,
  targetH: number,
  outputMime: string,
  quality: number,
  fillBackground: string | null
): Promise<Uint8Array> {
  const w = Math.max(1, Math.round(targetW));
  const h = Math.max(1, Math.round(targetH));

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      if (fillBackground) {
        ctx.fillStyle = fillBackground;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) {
        ctx.imageSmoothingQuality = 'high';
      }
      ctx.drawImage(source, 0, 0, w, h);
      const blob = await canvas.convertToBlob({ type: outputMime, quality });
      return new Uint8Array(await blob.arrayBuffer());
    }
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas コンテキストを取得できませんでした');
    if (fillBackground) {
      ctx.fillStyle = fillBackground;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in ctx) {
      ctx.imageSmoothingQuality = 'high';
    }
    ctx.drawImage(source, 0, 0, w, h);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => {
          if (b) resolve(b);
          else reject(new Error('画像の変換に失敗しました'));
        },
        outputMime,
        quality
      );
    });
    canvas.width = 1;
    canvas.height = 1;
    return new Uint8Array(await blob.arrayBuffer());
  }

  throw new Error('Canvas を利用できません');
}

export interface PreparedBackgroundImage {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  width: number;
  height: number;
  converted: boolean;
}

export async function prepareBackgroundImage(
  bytes: Uint8Array,
  options?: {
    fileName?: string;
    mimeType?: string;
    forceJpeg?: boolean;
    maxLongSide?: number;
  }
): Promise<PreparedBackgroundImage> {
  const fileName = options?.fileName ?? '';
  const mimeType = options?.mimeType ?? '';
  const forceJpeg = options?.forceJpeg ?? false;
  const maxLongSide = options?.maxLongSide ?? BACKGROUND_MAX_LONG_SIDE;

  const isHeic = isHeicOrHeif(bytes, fileName, mimeType);
  const isJpeg = !isHeic && isJpegBytes(bytes);
  const orientation = isJpeg ? parseJpegExifOrientation(bytes) : 1;

  const decoded = await decodeImageToUpright(bytes, fileName, mimeType);
  try {
    const srcW = Math.max(1, decoded.width);
    const srcH = Math.max(1, decoded.height);
    const longSide = Math.max(srcW, srcH);

    let targetW = srcW;
    let targetH = srcH;
    if (longSide > maxLongSide) {
      const scale = maxLongSide / longSide;
      targetW = Math.max(1, Math.round(srcW * scale));
      targetH = Math.max(1, Math.round(srcH * scale));
    }

    if (!isHeic && longSide <= maxLongSide && !(isJpeg && orientation !== 1)) {
      if (isJpeg) {
        return {
          bytes,
          fileName,
          mimeType: 'image/jpeg',
          width: srcW,
          height: srcH,
          converted: false,
        };
      }
      if (!forceJpeg) {
        return {
          bytes,
          fileName,
          mimeType: detectImageMime(bytes, fileName) || mimeType || 'image/png',
          width: srcW,
          height: srcH,
          converted: false,
        };
      }
    }

    const detected = detectImageMime(bytes, fileName);
    let outputMime = 'image/jpeg';
    if (!isHeic && !forceJpeg && !isJpeg) {
      if (detected === 'image/png') outputMime = 'image/png';
      else if (detected === 'image/webp') outputMime = 'image/webp';
    }

    const outBytes = await encodeSourceToBytes(
      decoded.source,
      targetW,
      targetH,
      outputMime,
      0.9,
      outputMime === 'image/jpeg' ? '#000000' : null
    );

    const outName =
      outputMime === 'image/jpeg' && (isHeic || forceJpeg)
        ? replaceExtWithJpg(fileName, 'bg.jpg')
        : fileName;

    return {
      bytes: outBytes,
      fileName: outName,
      mimeType: outputMime,
      width: targetW,
      height: targetH,
      converted: true,
    };
  } finally {
    decoded.close();
  }
}

export async function normalizePluginImageBytes(
  bytes: Uint8Array,
  options?: {
    fileName?: string;
    mimeType?: string;
    fromPhotos?: boolean;
  }
): Promise<Uint8Array> {
  const fileName = options?.fileName ?? '';
  const mimeType = options?.mimeType ?? '';
  const fromPhotos = options?.fromPhotos ?? false;

  const isHeic = isHeicOrHeif(bytes, fileName, mimeType);
  const isJpeg = !isHeic && isJpegBytes(bytes);
  const orientation = isJpeg ? parseJpegExifOrientation(bytes) : 1;

  if (!isHeic && !(fromPhotos && isJpeg && orientation !== 1)) {
    return bytes;
  }

  const decoded = await decodeImageToUpright(bytes, fileName, mimeType);
  try {
    const srcW = Math.max(1, decoded.width);
    const srcH = Math.max(1, decoded.height);
    const longSide = Math.max(srcW, srcH);

    let targetW = srcW;
    let targetH = srcH;
    if (longSide > PLUGIN_MAX_LONG_SIDE) {
      const scale = PLUGIN_MAX_LONG_SIDE / longSide;
      targetW = Math.max(1, Math.round(srcW * scale));
      targetH = Math.max(1, Math.round(srcH * scale));
    }

    return await encodeSourceToBytes(
      decoded.source,
      targetW,
      targetH,
      'image/jpeg',
      0.9,
      '#ffffff'
    );
  } finally {
    decoded.close();
  }
}
