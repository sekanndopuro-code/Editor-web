// RootView.swift :: RootView / MCZChartPicker
import React, { useEffect, useRef, useState } from 'react';
import { Archive, Folder, Sparkles } from 'lucide-react';
import { SongPCM, unlockAudioContext } from '../audio/AudioEngine';
import { ChartData } from '../core/ChartModel';
import { createDemoChartJSON } from '../core/DemoChart';
import {
  BACKGROUND_MAX_LONG_SIDE,
  detectImageMime,
  prepareBackgroundImage,
} from '../core/ImageNormalize';
import { MCZChartEntry, MCZUnpacked, pickMediaForChart, unpackMCZ } from '../core/MCZArchive';
import { EditorSessionStorage } from '../state/EditorSessionStorage';
import { EditorState } from '../state/EditorState';
import { EditorView } from './EditorView';

type FileKind = 'mc' | 'audio' | 'image' | 'mcz'; // RootView.swift :: FileKind
type ImportMode = 'files' | 'mcz'; // RootView.swift :: ImportMode

// RootView.swift :: RootView.audioExts (plus webm for browser compatibility)
const AUDIO_EXTS = new Set([
  'ogg',
  'mp3',
  'wav',
  'm4a',
  'aac',
  'flac',
  'aif',
  'aiff',
  'caf',
  'webm',
]);

// RootView.swift :: RootView.imageExts (plus avif for browser compatibility)
const IMAGE_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'heic',
  'heif',
  'gif',
  'bmp',
  'tif',
  'tiff',
  'avif',
]);

// RootView.swift :: RootView.kind(of:)
function kindOfFile(fileName: string, mimeType = ''): FileKind | null {
  const dot = fileName.lastIndexOf('.');
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : '';
  if (ext === 'mc') return 'mc';
  if (ext === 'mcz') return 'mcz';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('image/')) return 'image';
  return null;
}

export interface HeldAudioFile {
  data: Uint8Array;
  name: string;
}

// RootView.swift :: MCZChartPicker
const MCZChartPicker: React.FC<{
  folderName: string;
  charts: MCZChartEntry[];
  onPick: (chart: MCZChartEntry) => void;
  onCancel: () => void;
}> = ({ folderName, charts, onPick, onCancel }) => (
  <div
    onClick={onCancel}
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 50,
      backgroundColor: 'rgba(0, 0, 0, 0.72)', // RootView.swift :: MCZChartPicker (.preferredColorScheme(.dark))
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}
  >
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        width: '100%',
        maxWidth: 520,
        maxHeight: '80vh',
        backgroundColor: '#1c1c1e', // RootView.swift :: MCZChartPicker iOS dark sheet surface
        borderRadius: 14,
        border: '1px solid rgba(255, 255, 255, 0.16)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: '#ffffff',
      }}
    >
      {/* RootView.swift :: MCZChartPicker NavigationStack inline toolbar */}
      <div
        style={{
          position: 'relative',
          height: 48,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid rgba(255, 255, 255, 0.14)',
          paddingLeft: 16,
          paddingRight: 16,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onCancel}
          style={{
            position: 'absolute',
            left: 16,
            background: 'transparent',
            border: 'none',
            color: '#0a84ff',
            fontSize: 16,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          キャンセル
        </button>
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            maxWidth: '62%',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          開く譜面を選ぶ ({folderName})
        </div>
      </div>

      {/* RootView.swift :: MCZChartPicker List(charts) */}
      <div
        style={{
          overflowY: 'auto',
          touchAction: 'pan-y',
          padding: 16,
        }}
      >
        <div
          style={{
            backgroundColor: '#2c2c2e',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          {charts.map((chart, idx) => (
            <button
              key={chart.name}
              type="button"
              onClick={() => onPick(chart)}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                borderTop: idx > 0 ? '1px solid rgba(255, 255, 255, 0.12)' : 'none',
                padding: '12px 16px',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: 2, // RootView.swift :: MCZChartPicker spacing: 2
                color: '#ffffff',
              }}
            >
              <span style={{ fontSize: 17, fontWeight: 600 }}>{chart.name}</span>
              {chart.label && (
                <span style={{ fontSize: 13, color: 'rgba(255, 255, 255, 0.6)' }}>
                  {chart.label}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  </div>
);

export const RootView: React.FC = () => {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [pendingMCZ, setPendingMCZ] = useState<MCZUnpacked | null>(null);
  const [mcData, setMcData] = useState<string | null>(null);
  const [mcName, setMcName] = useState('');
  // Selected audio is held in state only (Phase 2 decoding/playback deferred per request)
  const [heldAudio, setHeldAudio] = useState<HeldAudioFile | null>(null);
  const [bgData, setBgData] = useState<Uint8Array | null>(null);
  const [bgName, setBgName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const importModeRef = useRef<ImportMode>('files');
  const activeBgUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await EditorSessionStorage.loadSession();
      if (cancelled) return;
      if (!saved) {
        setRestoring(false);
        return;
      }
      try {
        const chart = ChartData.parse(saved.chart.mcText);
        const audioFile: HeldAudioFile | null = saved.audio
          ? {
              data: saved.audio.data,
              name: saved.audio.fileName || saved.chart.oggFileName || 'audio',
            }
          : null;
        const rawBgBytes = saved.bg ? saved.bg.data : null;
        let resolvedBgBytes = rawBgBytes;
        let resolvedBgName = saved.bg?.fileName || saved.chart.bgFileName || '';
        let bgNote = '';
        if (rawBgBytes) {
          try {
            const prepared = await prepareBackgroundImage(rawBgBytes, {
              fileName: resolvedBgName,
              maxLongSide: BACKGROUND_MAX_LONG_SIDE,
            });
            resolvedBgBytes = prepared.bytes;
            if (prepared.fileName) resolvedBgName = prepared.fileName;
            if (
              prepared.converted &&
              /\.(heic|heif)$/i.test(chart.metaString(['background'])) &&
              resolvedBgName
            ) {
              chart.setMetaString(['background'], resolvedBgName);
            }
          } catch {
            bgNote = '背景画像を読み込めませんでした';
            resolvedBgBytes = null;
          }
        }

        let song: SongPCM | null = null;
        let audioNote = '';
        if (audioFile) {
          try {
            song = await SongPCM.decode(audioFile.data, audioFile.name);
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            audioNote = `音源を読み込めませんでした(無音で開きます): ${errMsg}`;
          }
        }
        if (cancelled) return;

        const st = new EditorState(chart, saved.chart.mcName || 'chart.mc', song);
        if (activeBgUrlRef.current) {
          URL.revokeObjectURL(activeBgUrlRef.current);
          activeBgUrlRef.current = null;
        }
        if (resolvedBgBytes) {
          const copy = new Uint8Array(resolvedBgBytes.byteLength);
          copy.set(resolvedBgBytes);
          const mime = detectImageMime(copy, resolvedBgName);
          const url = URL.createObjectURL(mime ? new Blob([copy], { type: mime }) : new Blob([copy]));
          activeBgUrlRef.current = url;
          st.bgUrl = url;
          st.bgData = copy;
        }
        st.bgFileName = resolvedBgName;
        if (audioFile) {
          const audioCopy = new Uint8Array(audioFile.data.byteLength);
          audioCopy.set(audioFile.data);
          st.oggData = audioCopy;
          st.oggFileName = audioFile.name;
        } else {
          st.oggData = null;
          st.oggFileName = '';
        }
        st.onClose = () => {
          setMcData(st.chart.serialized());
          setMcName(st.mcName);
          setHeldAudio(st.oggData ? { data: st.oggData, name: st.oggFileName } : null);
          setBgData(st.bgData);
          setBgName(st.bgFileName);
          if (activeBgUrlRef.current) {
            URL.revokeObjectURL(activeBgUrlRef.current);
            activeBgUrlRef.current = null;
          }
          st.dispose();
          setEditor(null);
        };
        const restoreNotice = [audioNote, bgNote].filter(Boolean).join('\n');
        if (restoreNotice) st.showToast(restoreNotice);
        setEditor(st);
        setRestoring(false);
      } catch {
        await EditorSessionStorage.clearSession();
        if (!cancelled) {
          setMessage('前回の編集状態を復元できませんでした');
          setRestoring(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (activeBgUrlRef.current) {
        URL.revokeObjectURL(activeBgUrlRef.current);
        activeBgUrlRef.current = null;
      }
    };
  }, []);

  const openPicker = (mode: ImportMode) => {
    importModeRef.current = mode;
    const input = fileInputRef.current;
    if (!input) return;
    input.value = '';
    input.click();
  };

  // RootView.swift :: RootView.loadFromMCZ(_:chartName:extraNote:)
  const loadFromMCZ = async (packed: MCZUnpacked, chartName: string, extraNote = '') => {
    const matchedChart = packed.charts.find((c) => c.name === chartName);
    let chartText = matchedChart?.text ?? null;
    if (chartText === null) {
      const raw = packed.files.get(chartName);
      if (raw) chartText = new TextDecoder('utf-8').decode(raw);
    }
    if (chartText === null) {
      setMessage(`${chartName} を読み込めませんでした`);
      return;
    }

    const media = pickMediaForChart(chartText, packed.fileNames);

    setMcData(chartText);
    setMcName(chartName);
    setHeldAudio(null);
    setBgData(null);
    setBgName('');

    const notes: string[] = [];
    if (extraNote) notes.push(extraNote);

    if (media.audioName) {
      const d = packed.files.get(media.audioName);
      if (d) {
        setHeldAudio({ data: d, name: media.audioName });
      } else {
        notes.push(`${media.audioName} を読み込めませんでした`);
      }
    } else {
      notes.push('mcz の中に音源が見つかりませんでした (無音で開きます)');
    }

    if (media.imageName) {
      const d = packed.files.get(media.imageName);
      if (d) {
        setBusy(true);
        try {
          const prepared = await prepareBackgroundImage(d, {
            fileName: media.imageName,
            maxLongSide: BACKGROUND_MAX_LONG_SIDE,
          });
          setBgData(prepared.bytes);
          setBgName(prepared.fileName);
        } catch {
          notes.push(`${media.imageName} を読み込めませんでした`);
        } finally {
          setBusy(false);
        }
      } else {
        notes.push(`${media.imageName} を読み込めませんでした`);
      }
    }

    notes.push(`展開先: ${packed.folderName}/`);
    setMessage(notes.join('\n'));
  };

  // RootView.swift :: RootView.importMCZ(from:)
  const importMCZ = async (files: File[]) => {
    const mczs = files.filter((f) => kindOfFile(f.name, f.type) === 'mcz');
    const first = mczs[0];
    if (!first) {
      setMessage('mcz ファイルを選んでください');
      return;
    }
    const note =
      mczs.length > 1
        ? `mcz が ${mczs.length} 個選ばれたので、最初の「${first.name}」だけ使います`
        : '';
    const name = first.name;
    setBusy(true);
    setMessage('');
    try {
      const buf = await first.arrayBuffer();
      const packed = await unpackMCZ(buf, name);
      setBusy(false);
      if (packed.charts.length === 0) {
        setMessage(`「${name}」の中に .mc が見つかりませんでした`);
      } else if (packed.charts.length === 1) {
        await loadFromMCZ(packed, packed.charts[0].name, note);
      } else {
        setMessage(note);
        setPendingMCZ(packed);
      }
    } catch (error) {
      setBusy(false);
      const errMsg = error instanceof Error ? error.message : String(error);
      setMessage(`「${name}」を展開できませんでした: ${errMsg}`);
    }
  };

  // RootView.swift :: RootView.importFiles(_:)
  const importFiles = async (files: File[]) => {
    const mcs: File[] = [];
    const audios: File[] = [];
    const images: File[] = [];
    const mczs: File[] = [];
    const skipped: string[] = [];
    const notes: string[] = [];

    for (const file of files) {
      switch (kindOfFile(file.name, file.type)) {
        case 'mc':
          mcs.push(file);
          break;
        case 'audio':
          audios.push(file);
          break;
        case 'image':
          images.push(file);
          break;
        case 'mcz':
          mczs.push(file);
          break;
        case null:
          skipped.push(file.name);
          break;
      }
    }

    // RootView.swift :: importFiles -> mcz only opens unpack flow
    if (mczs.length > 0 && mcs.length === 0 && audios.length === 0 && images.length === 0) {
      await importMCZ(mczs);
      return;
    }
    if (mczs.length > 0) {
      notes.push(
        'mcz は mc などと同時には読めないので無視しました。「mczを展開して読み込む…」から、mcz だけ選んでください'
      );
    }
    if (skipped.length > 0) {
      notes.push(`種類を判別できなかったので無視しました: ${skipped.join(', ')}`);
    }
    for (const [label, list] of [
      ['mc', mcs],
      ['音源', audios],
      ['画像', images],
    ] as const) {
      if (list.length > 1) {
        notes.push(
          `${label}が ${list.length} 個選ばれたので、最初の「${list[0].name}」だけ使います`
        );
      }
    }

    if (mcs[0]) {
      try {
        const text = await mcs[0].text();
        setMcData(text);
        setMcName(mcs[0].name);
        // Switching mc clears previous audio & background before applying newly co-selected files
        setHeldAudio(null);
        setBgData(null);
        setBgName('');
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        notes.push(`${mcs[0].name} の読込に失敗しました: ${errMsg}`);
      }
    }

    if (audios[0]) {
      try {
        const buf = await audios[0].arrayBuffer();
        setHeldAudio({ data: new Uint8Array(buf), name: audios[0].name });
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        notes.push(`${audios[0].name} の読込に失敗しました: ${errMsg}`);
      }
    }

    if (images[0]) {
      setBusy(true);
      try {
        const buf = await images[0].arrayBuffer();
        const prepared = await prepareBackgroundImage(new Uint8Array(buf), {
          fileName: images[0].name,
          mimeType: images[0].type,
          maxLongSide: BACKGROUND_MAX_LONG_SIDE,
        });
        setBgData(prepared.bytes);
        setBgName(prepared.fileName);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        notes.push(`${images[0].name} の読込に失敗しました: ${errMsg}`);
      } finally {
        setBusy(false);
      }
    }

    setMessage(notes.join('\n'));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (fileList.length === 0) return;
    if (importModeRef.current === 'mcz') {
      void importMCZ(fileList);
    } else {
      void importFiles(fileList);
    }
  };

  // RootView.swift :: RootView.openEditor()
  const launchEditor = async (
    chartText: string,
    chartFileName: string,
    imageBytes: Uint8Array | null,
    imageName = '',
    audioFile: HeldAudioFile | null = null
  ) => {
    unlockAudioContext();
    setBusy(true);
    setMessage('');
    try {
      const chart = ChartData.parse(chartText);
      let song: SongPCM | null = null;
      let audioNote = '';
      if (audioFile) {
        try {
          song = await SongPCM.decode(audioFile.data, audioFile.name);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          audioNote = `音源を読み込めませんでした(無音で開きます): ${errMsg}`;
        }
      }
      let resolvedBgBytes = imageBytes;
      let resolvedBgName = imageName;
      let bgNote = '';
      if (imageBytes) {
        try {
          const prepared = await prepareBackgroundImage(imageBytes, {
            fileName: imageName,
            maxLongSide: BACKGROUND_MAX_LONG_SIDE,
          });
          resolvedBgBytes = prepared.bytes;
          if (prepared.fileName) resolvedBgName = prepared.fileName;
          if (
            prepared.converted &&
            (/\.(heic|heif)$/i.test(imageName) ||
              /\.(heic|heif)$/i.test(chart.metaString(['background']))) &&
            resolvedBgName
          ) {
            chart.setMetaString(['background'], resolvedBgName);
          }
        } catch {
          bgNote = '背景画像を読み込めませんでした';
          resolvedBgBytes = null;
        }
      }

      const st = new EditorState(chart, chartFileName, song);
      if (activeBgUrlRef.current) {
        URL.revokeObjectURL(activeBgUrlRef.current);
        activeBgUrlRef.current = null;
      }
      if (resolvedBgBytes) {
        const copy = new Uint8Array(resolvedBgBytes.byteLength);
        copy.set(resolvedBgBytes);
        const mime = detectImageMime(copy, resolvedBgName);
        const url = URL.createObjectURL(mime ? new Blob([copy], { type: mime }) : new Blob([copy]));
        activeBgUrlRef.current = url;
        st.bgUrl = url;
        st.bgData = copy;
      }
      st.bgFileName = resolvedBgName;
      if (audioFile) {
        const audioCopy = new Uint8Array(audioFile.data.byteLength);
        audioCopy.set(audioFile.data);
        st.oggData = audioCopy;
        st.oggFileName = audioFile.name;
      } else {
        st.oggData = null;
        st.oggFileName = '';
      }
      st.onClose = () => {
        // RootView.swift :: RootView.openEditor onClose
        setMcData(st.chart.serialized());
        setMcName(st.mcName);
        setHeldAudio(st.oggData ? { data: st.oggData, name: st.oggFileName } : null);
        setBgData(st.bgData);
        setBgName(st.bgFileName);
        if (activeBgUrlRef.current) {
          URL.revokeObjectURL(activeBgUrlRef.current);
          activeBgUrlRef.current = null;
        }
        st.dispose();
        setEditor(null);
      };
      const launchNotice = [audioNote, bgNote].filter(Boolean).join('\n');
      if (launchNotice) st.showToast(launchNotice);
      setEditor(st);
      setBusy(false);
      void EditorSessionStorage.saveFullSession({
        mcText: st.chart.serialized(),
        mcName: st.mcName,
        audioData: st.oggData,
        audioFileName: st.oggFileName,
        bgData: st.bgData,
        bgFileName: st.bgFileName,
      }).then((res) => {
        if (!res.ok) {
          st.reportSessionSaveError(res.message);
        }
      });
    } catch {
      setBusy(false);
      setMessage('mc を解析できませんでした。JSON形式の .mc を選んでください。');
    }
  };

  const openEditor = () => {
    if (mcData === null) return;
    void launchEditor(mcData, mcName || 'chart.mc', bgData, bgName, heldAudio);
  };

  // RootView.swift :: RootView.openDemo()
  const openDemo = () => {
    try {
      const demoJson = createDemoChartJSON();
      setMcData(demoJson);
      setMcName('demo.mc');
      setHeldAudio(null);
      setBgData(null);
      setBgName('');
      void launchEditor(demoJson, 'demo.mc', null);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      setMessage(`デモ譜面を作れませんでした: ${errMsg}`);
    }
  };

  // RootView.swift :: RootView.fileRow(title:name:required:)
  const renderFileRow = (title: string, name: string, required: boolean) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14, // RootView.swift :: fileRow HStack(spacing: 14)
        maxWidth: '100%',
      }}
    >
      <div
        style={{
          width: 150, // RootView.swift :: fileRow frame(width: 150)
          maxWidth: '34vw',
          textAlign: 'left',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: 16,
          color: '#ffffff',
        }}
      >
        {title}
      </div>
      <div
        style={{
          width: 280, // RootView.swift :: fileRow frame(width: 280)
          maxWidth: '52vw',
          textAlign: 'left',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: 16,
          color: name ? '#30d158' : 'rgba(255, 255, 255, 0.6)', // RootView.swift :: fileRow .green / .secondary
        }}
      >
        {name || (required ? '未選択 (必須)' : '未選択')}
      </div>
    </div>
  );

  if (editor) {
    return <EditorView state={editor} />;
  }

  if (restoring) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          backgroundColor: '#000000',
          color: 'rgba(255, 255, 255, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 16,
        }}
      >
        復元中…
      </div>
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto', // RootView.swift :: importView ScrollView(.vertical)
        overflowX: 'hidden',
        backgroundColor: '#000000', // RootView.swift :: importView Color.black
        color: '#ffffff',
        touchAction: 'pan-y',
      }}
    >
      {/* Hidden native multi-file input; no `accept` attribute so iOS/iPadOS Files lets users select .mc / .mcz */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <div
        style={{
          minHeight: '100%',
          padding: 30, // RootView.swift :: importView .padding(30)
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* RootView.swift :: importContent VStack(spacing: 18) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18, // RootView.swift :: importContent spacing: 18
            maxWidth: '100%',
          }}
        >
          <div
            style={{
              fontSize: 30, // RootView.swift :: importContent .font(.system(size: 30, weight: .bold, design: .monospaced))
              fontWeight: 700,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              textAlign: 'center',
            }}
          >
            Malody Slide Editor
          </div>

          <div
            style={{
              fontSize: 16,
              color: 'rgba(255, 255, 255, 0.6)', // RootView.swift :: importContent .foregroundColor(.secondary)
              textAlign: 'center',
            }}
          >
            mc・音源・背景画像を、まとめて選んでOK (拡張子で自動判別)
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => openPicker('files')}
            style={{
              width: 280, // RootView.swift :: importContent frame(width: 280, height: 50)
              height: 50, // RootView.swift :: importContent frame(width: 280, height: 50)
              borderRadius: 10,
              backgroundColor: 'rgba(255, 255, 255, 0.14)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              color: '#0a84ff',
              fontSize: 20, // RootView.swift :: .font(.title3.bold())
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Folder size={20} strokeWidth={2.2} />
            <span>ファイルを選択…</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => openPicker('mcz')}
            style={{
              width: 280, // RootView.swift :: importContent frame(width: 280, height: 50)
              height: 50, // RootView.swift :: importContent frame(width: 280, height: 50)
              borderRadius: 10,
              backgroundColor: 'rgba(255, 255, 255, 0.14)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              color: '#0a84ff',
              fontSize: 17, // RootView.swift :: .font(.title3.bold()).lineLimit(1).minimumScaleFactor(0.8)
              fontWeight: 700,
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Archive size={19} strokeWidth={2.2} />
            <span>mczを展開して読み込む…</span>
          </button>

          {/* RootView.swift :: importContent VStack(spacing: 10) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10, // RootView.swift :: importContent fileRow VStack spacing: 10
              maxWidth: '100%',
            }}
          >
            {renderFileRow('譜面 (.mc)', mcName, true)}
            {renderFileRow('音源 (.ogg 等)', heldAudio?.name ?? '', false)}
            {renderFileRow('背景画像 (任意)', bgName, false)}
          </div>

          <button
            type="button"
            disabled={mcData === null || busy}
            onClick={openEditor}
            style={{
              width: 280, // RootView.swift :: importContent frame(width: 280, height: 50)
              height: 50, // RootView.swift :: importContent frame(width: 280, height: 50)
              borderRadius: 10,
              backgroundColor: '#0a84ff', // RootView.swift :: .buttonStyle(.borderedProminent)
              border: 'none',
              color: '#ffffff',
              fontSize: 20, // RootView.swift :: .font(.title3.bold())
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: mcData === null || busy ? 'default' : 'pointer',
              opacity: mcData === null || busy ? 0.35 : 1,
            }}
          >
            {busy ? '読み込み中…' : 'エディタを開く'}
          </button>

          {message && (
            <div
              style={{
                fontSize: 13, // RootView.swift :: importContent .font(.footnote)
                color: '#ff9f0a', // RootView.swift :: importContent .foregroundColor(.orange)
                maxWidth: 520, // RootView.swift :: importContent frame(maxWidth: 520)
                textAlign: 'center',
                whiteSpace: 'pre-line',
                lineHeight: 1.4,
              }}
            >
              {message}
            </div>
          )}

          {/* RootView.swift :: devTools VStack(spacing: 10).padding(.top, 6) */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10, // RootView.swift :: devTools spacing: 10
              paddingTop: 6, // RootView.swift :: devTools .padding(.top, 6)
              width: '100%',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 360, // RootView.swift :: devTools Divider().frame(maxWidth: 360)
                height: 1,
                backgroundColor: 'rgba(255, 255, 255, 0.16)',
              }}
            />
            <div
              style={{
                fontSize: 12, // RootView.swift :: devTools .font(.caption)
                color: 'rgba(255, 255, 255, 0.6)', // RootView.swift :: devTools .foregroundColor(.secondary)
              }}
            >
              確認用
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={openDemo}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                backgroundColor: 'rgba(255, 255, 255, 0.14)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                color: '#0a84ff',
                fontSize: 16,
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                cursor: busy ? 'default' : 'pointer',
                opacity: busy ? 0.5 : 1,
              }}
            >
              <Sparkles size={16} strokeWidth={2.2} />
              <span>デモ譜面で開く</span>
            </button>
          </div>
        </div>
      </div>

      {pendingMCZ && (
        <MCZChartPicker
          folderName={pendingMCZ.folderName}
          charts={pendingMCZ.charts}
          onPick={(chart) => {
            const packed = pendingMCZ;
            setPendingMCZ(null);
            void loadFromMCZ(packed, chart.name);
          }}
          onCancel={() => {
            const folderName = pendingMCZ.folderName;
            setPendingMCZ(null);
            setMessage(`展開しました (${folderName}/)。譜面は選ばれていません`);
          }}
        />
      )}
    </div>
  );
};
