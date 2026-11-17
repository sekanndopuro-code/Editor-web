// MCZImporter.swift + ZipReader.swift + ZipWriter.swift (via 1.txt Phase 1)
import JSZip from 'jszip';
import { ChartData } from './ChartModel';

export interface MCZChartEntry {
  name: string;
  label: string;
  text: string;
}

export interface MCZUnpacked {
  folderName: string;
  files: Map<string, Uint8Array>;
  fileNames: string[];
  charts: MCZChartEntry[];
}

const AUDIO_EXTS = new Set(['ogg', 'mp3', 'wav', 'm4a', 'aac', 'flac', 'aif', 'aiff', 'caf', 'webm']);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'heic', 'heif', 'gif', 'bmp', 'tif', 'tiff', 'avif']);

export type ImportFileKind = 'mc' | 'audio' | 'image' | 'mcz';

export function detectFileKind(fileName: string, mimeType = ''): ImportFileKind | null {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'mc') return 'mc';
  if (ext === 'mcz') return 'mcz';
  if (AUDIO_EXTS.has(ext) || mimeType.startsWith('audio/')) return 'audio';
  if (IMAGE_EXTS.has(ext) || mimeType.startsWith('image/')) return 'image';
  return null;
}

function chartLabel(text: string): string {
  try {
    const obj = JSON.parse(text.startsWith('\uFEFF') ? text.slice(1) : text) as Record<string, unknown>;
    const meta = obj.meta as Record<string, unknown> | undefined;
    if (!meta) return '';
    const parts: string[] = [];
    if (typeof meta.version === 'string' && meta.version) parts.push(meta.version);
    if (typeof meta.creator === 'string' && meta.creator) parts.push(`by ${meta.creator}`);
    return parts.join('  ');
  } catch {
    return '';
  }
}

export async function unpackMCZ(data: ArrayBuffer | Uint8Array, mczName: string): Promise<MCZUnpacked> {
  const zip = await JSZip.loadAsync(data);
  const files = new Map<string, Uint8Array>();
  const charts: MCZChartEntry[] = [];

  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const parts = entryPath.split(/[/\\]/).filter(Boolean);
    const leaf = parts[parts.length - 1];
    if (!leaf || leaf === '.' || leaf === '..') continue;
    if (parts.includes('__MACOSX') || leaf.startsWith('._') || leaf === '.DS_Store') continue;
    if (files.has(leaf)) continue;

    const bytes = await entry.async('uint8array');
    files.set(leaf, bytes);

    if (leaf.toLowerCase().endsWith('.mc')) {
      const text = new TextDecoder('utf-8').decode(bytes);
      charts.push({ name: leaf, label: chartLabel(text), text });
    }
  }

  const fileNames = Array.from(files.keys()).sort((a, b) => a.localeCompare(b));
  charts.sort((a, b) => a.name.localeCompare(b.name));

  const folderName = mczName.replace(/\.[^.]+$/, '') || 'chart';
  return { folderName, files, fileNames, charts };
}

export function pickMediaForChart(
  chartText: string,
  fileNames: string[]
): { audioName: string | null; imageName: string | null } {
  let wantAudio = '';
  let wantImage = '';
  try {
    const c = ChartData.parse(chartText);
    wantAudio = c.soundFile;
    wantImage = c.metaString(['background']);
  } catch {
    // ignore
  }

  const find = (want: string, kind: 'audio' | 'image'): string | null => {
    const leaf = want.split(/[/\\]/).pop()?.toLowerCase() ?? '';
    if (leaf) {
      const exact = fileNames.find((n) => n.toLowerCase() === leaf);
      if (exact) return exact;
    }
    return fileNames.find((n) => detectFileKind(n) === kind) ?? null;
  };

  return {
    audioName: find(wantAudio, 'audio'),
    imageName: find(wantImage, 'image'),
  };
}

export async function exportMCZBlob(params: {
  chart: ChartData;
  mcName: string;
  audioData?: Uint8Array | null;
  audioFileName?: string;
  bgData?: Uint8Array | null;
  bgFileName?: string;
}): Promise<{ blob: Blob; fileName: string }> {
  const zip = new JSZip();
  const base = params.mcName.replace(/\.[^.]+$/, '') || 'chart';
  const folder = zip.folder(base)!;

  folder.file(params.mcName, params.chart.serialized());

  if (params.audioData) {
    const n = params.chart.soundFile || params.audioFileName || 'song.ogg';
    folder.file(n, params.audioData);
  }
  if (params.bgData) {
    const bn = params.chart.metaString(['background']) || params.bgFileName || 'bg.jpg';
    folder.file(bn, params.bgData);
  }

  let title = params.chart.metaString(['song', 'title']) || base;
  title = title.replace(/[/\\:*?"<>|]/g, '_');

  // JSZip の 'blob' 出力は MIME が application/zip になり、Safari などが
  // ダウンロード時に ".mcz.zip" と拡張子を足してしまう。
  // 汎用バイナリ扱い (application/octet-stream) にして ".mcz" のまま保存させる。
  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'STORE' });
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  return { blob, fileName: `${title}.mcz` };
}
