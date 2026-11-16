// PluginPanel.swift + PluginImagePreview.swift ported for Stage 2:
// - AdvPanel with import button (.lua / .zip / bundled images), PluginIcon display, and long-press delete confirmation
// - PluginDialogLayer supporting .message, .input, .choice, .filePick (ReadBytesSelect), and .imagePreview (ShowImagePreview)

import React, { useEffect, useRef, useState } from 'react';
import { SwiftColors } from '../state/EditorConstants';
import { EditorState } from '../state/EditorState';
import { PluginStore, type PluginItem } from '../plugins/PluginStore';
import {
  PLUGIN_IMAGE_LANE_WIDTH,
  bytesToBase64,
  loadPluginSourceImage,
  renderGrayPreviewRgba,
  resizeSourceImageToGray,
  type DecodedSourceImage,
} from '../plugins/PluginImageTools';
import { normalizePluginImageBytes } from '../core/ImageNormalize';
import type { PluginDialog } from '../plugins/PluginTypes';

const MAX_READ_BYTES = 64 * 1024 * 1024;
const LONG_PRESS_MS = 480;

export const AdvPanel: React.FC<{
  state: EditorState;
  width: number;
  designHeight: number;
}> = ({ state, width, designHeight }) => {
  const [, setStoreTick] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<PluginItem | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return PluginStore.shared.subscribe(() => setStoreTick((t) => t + 1));
  }, []);

  const isOpen = state.editing && state.advOpen;
  const panelWidth = state.advPanelWidth;
  const textBoost = state.smallTextBoost; // PluginPanel.swift :: textBoost = state.smallTextBoost
  const headerScale = Math.max(1, textBoost / 1.5); // PluginPanel.swift :: headerScale

  const items = PluginStore.shared.items;

  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const picked = Array.from(fileList);
    e.target.value = '';
    setImporting(true);
    try {
      const summary = await PluginStore.shared.importFiles(picked);
      state.showPluginMessage('プラグインの読み込み', summary);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      style={{
        width,
        height: designHeight,
        overflow: 'hidden',
        flexShrink: 0,
        position: 'relative',
        zIndex: 2, // EditorView.swift :: AdvPanel above LaneView (.zIndex(-1))
        pointerEvents: isOpen && width > 0 ? 'auto' : 'none',
      }}
    >
      <div
        style={{
          width: panelWidth,
          height: designHeight,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgb(15, 15, 15)', // PluginPanel.swift :: Color(white: 0.06)
          borderRight: '1px solid rgba(255, 255, 255, 0.3)', // PluginPanel.swift :: overlay alignment: .trailing
          boxSizing: 'border-box',
          position: 'relative',
        }}
      >
        {/* Header (PluginPanel.swift :: AdvPanel.header) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            paddingLeft: 8,
            paddingRight: 8,
            minHeight: 36 * headerScale,
            boxSizing: 'border-box',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              fontSize: 13 * textBoost,
              fontWeight: 700,
              color: SwiftColors.laneCyan,
              whiteSpace: 'nowrap',
            }}
          >
            Adv.
          </span>
          <span
            style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: 9 * textBoost,
              color: 'rgba(255, 255, 255, 0.5)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              minWidth: 0,
              flex: 1,
            }}
          >
            Lua plugins
          </span>
          {state.pluginRunning ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <span
                aria-label="実行中"
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: '2px solid rgba(255, 255, 255, 0.25)',
                  borderTopColor: SwiftColors.laneCyan,
                  display: 'inline-block',
                  animation: 'adv-plugin-spin 0.8s linear infinite',
                }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  state.stopPlugin();
                }}
                style={{
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  fontSize: 11 * textBoost,
                  fontWeight: 700,
                  color: '#ffffff',
                  padding: '4px 8px',
                  borderRadius: 5,
                  backgroundColor: 'rgba(255, 59, 48, 0.7)', // PluginPanel.swift :: Color.red.opacity(0.7)
                  border: 'none',
                  cursor: 'pointer',
                  lineHeight: 1.1,
                }}
              >
                停止
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                state.advOpen = false;
                state.emitUI();
              }}
              style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: 14 * textBoost,
                fontWeight: 700,
                color: 'rgba(255, 255, 255, 0.8)',
                width: 28 * headerScale,
                height: 28 * headerScale,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Divider */}
        <div
          style={{
            width: '100%',
            height: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            flexShrink: 0,
          }}
        />

        {/* Vertically scrollable plugin list (PluginPanel.swift :: ScrollView(.vertical)) */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            touchAction: 'pan-y',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            boxSizing: 'border-box',
          }}
        >
          {items.map((item) => (
            <PluginRow
              key={item.id}
              item={item}
              state={state}
              textBoost={textBoost}
              onRequestDelete={(target) => setDeleteTarget(target)}
            />
          ))}
        </div>

        {/* print() / message output log box (PluginPanel.swift :: logView) */}
        {state.pluginLog.length > 0 && (
          <div
            style={{
              padding: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderTop: '1px solid rgba(255, 255, 255, 0.15)',
              display: 'flex',
              flexDirection: 'column',
              gap: 3,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span
                style={{
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  fontSize: 9 * textBoost,
                  fontWeight: 700,
                  color: 'rgba(255, 255, 255, 0.55)',
                }}
              >
                出力
              </span>
              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  state.clearPluginLog();
                }}
                style={{
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  fontSize: 9 * textBoost,
                  color: SwiftColors.laneCyan,
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                消す
              </button>
            </div>
            <div
              style={{
                maxHeight: 72,
                overflowY: 'auto',
                touchAction: 'pan-y',
              }}
            >
              <div
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 10 * textBoost,
                  color: 'rgba(255, 255, 255, 0.85)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.35,
                  userSelect: 'text',
                }}
              >
                {state.pluginLog}
              </div>
            </div>
          </div>
        )}

        {/* Divider + importButton (PluginPanel.swift :: importButton) */}
        <div
          style={{
            width: '100%',
            height: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            flexShrink: 0,
          }}
        />
        <div style={{ padding: 8, flexShrink: 0 }}>
          <input
            ref={importInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={(e) => void handleImportChange(e)}
          />
          <button
            type="button"
            disabled={state.pluginRunning || importing}
            onClick={(e) => {
              e.stopPropagation();
              importInputRef.current?.click();
            }}
            style={{
              width: '100%',
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: 12 * textBoost,
              fontWeight: 600,
              color: SwiftColors.laneCyan,
              textAlign: 'center',
              padding: '10px 8px',
              borderRadius: 7,
              backgroundColor: 'rgba(255, 255, 255, 0.07)',
              border: `1px solid ${SwiftColors.laneCyan}`,
              opacity: state.pluginRunning || importing ? 0.5 : 1,
              cursor: state.pluginRunning || importing ? 'default' : 'pointer',
              boxSizing: 'border-box',
              lineHeight: 1.25,
            }}
          >
            {importing ? '読み込み中…' : 'プラグイン(lua)を読み込む'}
          </button>
        </div>

        {/* Long-press / context-menu delete confirmation overlay */}
        {deleteTarget && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              setDeleteTarget(null);
            }}
            style={{
              position: 'absolute',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.72)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
              zIndex: 10,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 10,
                backgroundColor: 'rgb(31, 31, 31)',
                border: '1px solid rgba(255, 255, 255, 0.35)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                boxSizing: 'border-box',
              }}
            >
              <div
                style={{
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  fontSize: 13 * textBoost,
                  fontWeight: 700,
                  color: '#ffffff',
                  wordBreak: 'break-word',
                  lineHeight: 1.35,
                }}
              >
                「{deleteTarget.title}」を削除しますか？
              </div>
              <div
                style={{
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: 9 * textBoost,
                  color: 'rgba(255, 255, 255, 0.55)',
                  wordBreak: 'break-all',
                }}
              >
                {deleteTarget.relPath}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(255, 255, 255, 0.14)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    color: '#ffffff',
                    fontSize: 11 * textBoost,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = deleteTarget;
                    setDeleteTarget(null);
                    if (state.activePluginID === target.id) {
                      state.stopInteractivePlugin();
                      if (state.tool === 'plugin') state.tool = 'unselected';
                    }
                    void PluginStore.shared.remove(target);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 6,
                    backgroundColor: 'rgba(255, 59, 48, 0.85)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: 11 * textBoost,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes adv-plugin-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

const PluginRow: React.FC<{
  item: PluginItem;
  state: EditorState;
  textBoost: number;
  onRequestDelete: (item: PluginItem) => void;
}> = ({ item, state, textBoost, onRequestDelete }) => {
  const runnable = item.isRunnable && !state.pluginRunning;
  const isActive = state.activePluginID === item.id;
  const iconUrl = PluginStore.shared.getIconUrl(item);

  const pressTimerRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressedRef = useRef(false);

  const clearTimer = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
    startPosRef.current = null;
  };

  useEffect(() => clearTimer, []);

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        if (item.isBuiltin) return;
        if (e.button === 2) return;
        longPressedRef.current = false;
        startPosRef.current = { x: e.clientX, y: e.clientY };
        clearTimer();
        pressTimerRef.current = window.setTimeout(() => {
          pressTimerRef.current = null;
          longPressedRef.current = true;
          onRequestDelete(item);
        }, LONG_PRESS_MS);
      }}
      onPointerMove={(e) => {
        const sp = startPosRef.current;
        if (!sp || pressTimerRef.current === null) return;
        const dx = e.clientX - sp.x;
        const dy = e.clientY - sp.y;
        if (dx * dx + dy * dy > 64) {
          clearTimer();
        }
      }}
      onPointerUp={() => clearTimer()}
      onPointerCancel={() => clearTimer()}
      onPointerLeave={() => clearTimer()}
      onContextMenu={(e) => {
        if (item.isBuiltin) return;
        e.preventDefault();
        e.stopPropagation();
        clearTimer();
        onRequestDelete(item);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (longPressedRef.current) {
          longPressedRef.current = false;
          return;
        }
        if (!runnable) return;
        if (item.isInteractive) {
          state.toggleInteractivePlugin(item);
        } else {
          state.runPlugin(item);
        }
      }}
      style={{
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: '7px 9px',
        borderRadius: 7,
        backgroundColor: isActive ? 'rgba(0, 230, 230, 0.18)' : 'rgba(255, 255, 255, 0.07)',
        border: isActive
          ? `2px solid ${SwiftColors.laneCyan}`
          : '1px solid rgba(255, 255, 255, 0.25)',
        opacity: runnable || item.info === null ? 1.0 : 0.55,
        cursor: runnable ? 'pointer' : 'default',
        boxSizing: 'border-box',
        flexShrink: 0,
      }}
    >
      {iconUrl && (
        <img
          src={iconUrl}
          alt=""
          style={{
            width: 30,
            height: 30,
            objectFit: 'contain',
            flexShrink: 0,
            borderRadius: 4,
          }}
        />
      )}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 2,
          minWidth: 0,
          flex: 1,
        }}
      >
        <div
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: 13 * textBoost,
            fontWeight: 600,
            color: item.hasError ? 'rgba(255, 59, 48, 0.9)' : '#ffffff',
            lineHeight: 1.25,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 9 * textBoost,
            color: 'rgba(255, 255, 255, 0.5)',
            lineHeight: 1.25,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {item.subtitle}
        </div>
      </div>
      {isActive && (
        <span
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 9 * textBoost,
            fontWeight: 700,
            color: '#000000',
            padding: '2px 5px',
            borderRadius: 4,
            backgroundColor: SwiftColors.laneCyan,
            flexShrink: 0,
          }}
        >
          ON
        </span>
      )}
    </button>
  );
};

// PluginDialogLayer (PluginPanel.swift :: PluginDialogLayer + PluginDialogCard + PluginImagePreviewCard)
export const PluginDialogLayer: React.FC<{
  state: EditorState;
}> = ({ state }) => {
  const dialog = state.pluginDialog;
  if (!dialog) return null;

  if (dialog.kind === 'imagePreview') {
    return <PluginImagePreviewCard key={dialog.id} state={state} dialog={dialog} />;
  }
  return <PluginDialogCard key={dialog.id} state={state} dialog={dialog} />;
};

const PluginDialogCard: React.FC<{
  state: EditorState;
  dialog: Exclude<PluginDialog, { kind: 'imagePreview' }>;
}> = ({ state, dialog }) => {
  const [inputText, setInputText] = useState(dialog.kind === 'input' ? dialog.defaultText : '');
  const [readingFile, setReadingFile] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const filePickerRef = useRef<HTMLInputElement>(null);
  const mountedRef = useRef(true);
  const activeDialogIdRef = useRef(dialog.id);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    activeDialogIdRef.current = dialog.id;
  }, [dialog.id]);

  useEffect(() => {
    if (dialog.kind === 'input') {
      inputRef.current?.focus();
    }
  }, [dialog.kind]);

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) {
      return;
    }
    if (file.size === 0 || file.size > MAX_READ_BYTES) {
      state.showToast('ファイルサイズが大きすぎます (64MB まで)');
      state.resolvePluginDialog(null);
      return;
    }
    const targetDialogId = dialog.id;
    setReadingFile(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = await normalizePluginImageBytes(new Uint8Array(buf), {
        fileName: file.name,
        mimeType: file.type,
        fromPhotos: dialog.kind === 'filePick' && dialog.fromPhotos,
      });
      if (!mountedRef.current || activeDialogIdRef.current !== targetDialogId) return;
      const b64 = bytesToBase64(bytes);
      state.resolvePluginDialog(b64);
    } catch {
      if (!mountedRef.current || activeDialogIdRef.current !== targetDialogId) return;
      state.showToast('ファイルを読み込めませんでした');
      state.resolvePluginDialog(null);
    } finally {
      if (mountedRef.current) {
        setReadingFile(false);
      }
    }
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 24,
        paddingLeft: 16,
        paddingRight: 16,
        boxSizing: 'border-box',
        zIndex: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          padding: 16,
          borderRadius: 12,
          backgroundColor: 'rgb(31, 31, 31)', // PluginPanel.swift :: Color(white: 0.12)
          border: '1px solid rgba(255, 255, 255, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
            fontSize: 15,
            fontWeight: 700,
            color: SwiftColors.laneCyan,
            textAlign: 'center',
            wordBreak: 'break-word',
          }}
        >
          {dialog.title}
        </div>
        {(dialog.message.length > 0 || dialog.kind === 'filePick') && (
          <div
            style={{
              width: '100%',
              maxHeight: 170,
              overflowY: 'auto',
              touchAction: 'pan-y',
            }}
          >
            <div
              style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: 14,
                color: '#ffffff',
                lineHeight: 1.4,
                textAlign: dialog.kind === 'filePick' ? 'center' : 'left',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                userSelect: 'text',
              }}
            >
              {dialog.message ||
                (dialog.kind === 'filePick'
                  ? dialog.fromPhotos
                    ? '画像を選択してください'
                    : 'ファイルを選択してください'
                  : '')}
            </div>
          </div>
        )}

        {dialog.kind === 'input' && (
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                state.resolvePluginDialog(inputText);
              }
            }}
            style={{
              width: '100%',
              padding: '8px 10px',
              borderRadius: 6,
              backgroundColor: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: '#ffffff',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        )}

        {dialog.kind === 'choice' && (
          <div
            style={{
              width: '100%',
              maxHeight: 300,
              overflowY: 'auto',
              touchAction: 'pan-y',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {dialog.options.map((opt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => state.resolvePluginDialog(String(idx))}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  borderRadius: 7,
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  color: '#ffffff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'center',
                  wordBreak: 'break-word',
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {dialog.kind === 'filePick' && (
          <input
            ref={filePickerRef}
            type="file"
            accept={dialog.fromPhotos ? 'image/*,.heic,.heif' : undefined}
            style={{ display: 'none' }}
            onChange={(e) => void handleFilePick(e)}
          />
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          {(dialog.kind === 'input' || dialog.kind === 'choice' || dialog.kind === 'filePick') && (
            <button
              type="button"
              onClick={() => state.resolvePluginDialog(null)}
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                backgroundColor: 'rgba(255, 255, 255, 0.14)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: '#ffffff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              キャンセル
            </button>
          )}
          {dialog.kind === 'filePick' && (
            <button
              type="button"
              disabled={readingFile}
              onClick={() => filePickerRef.current?.click()}
              style={{
                padding: '6px 18px',
                borderRadius: 8,
                backgroundColor: SwiftColors.panelBlue,
                border: 'none',
                color: '#000000',
                fontSize: 14,
                fontWeight: 700,
                cursor: readingFile ? 'default' : 'pointer',
                opacity: readingFile ? 0.6 : 1,
              }}
            >
              {readingFile ? '読み込み中…' : dialog.fromPhotos ? '写真・画像を選ぶ' : 'ファイルを選ぶ'}
            </button>
          )}
          {(dialog.kind === 'message' || dialog.kind === 'input') && (
            <button
              type="button"
              onClick={() => state.resolvePluginDialog(dialog.kind === 'input' ? inputText : null)}
              style={{
                padding: '6px 18px',
                borderRadius: 8,
                backgroundColor: SwiftColors.panelBlue,
                border: 'none',
                color: '#000000',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              OK
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// PluginImagePreviewCard (PluginImagePreview.swift)
const PluginImagePreviewCard: React.FC<{
  state: EditorState;
  dialog: Extract<PluginDialog, { kind: 'imagePreview' }>;
}> = ({ state, dialog }) => {
  const p = dialog.imageParams;
  const initLength = Math.min(Math.max(Math.round(p.length * 4) / 4 || 4, 0.25), 64);
  const initTicks = Math.min(Math.max(Math.round(p.ticks) || 32, 1), 192);
  const initThreshold = Math.min(Math.max(Math.round(p.threshold) ?? 128, 0), 255);
  const beatAspect = Number.isFinite(p.beatAspect) && p.beatAspect > 0 ? p.beatAspect : 0.85;

  const [length, setLength] = useState(initLength);
  const [ticks, setTicks] = useState(initTicks);
  const [threshold, setThreshold] = useState(initThreshold);
  const [invert, setInvert] = useState(Boolean(p.invert));
  const [showGray, setShowGray] = useState(false);
  const [laneView, setLaneView] = useState(true);

  const [srcSize, setSrcSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [failed, setFailed] = useState(false);
  const [holds, setHolds] = useState(0);
  const [shownRows, setShownRows] = useState(0);
  const [shownLength, setShownLength] = useState(initLength);
  const [previewBox, setPreviewBox] = useState<{ w: number; h: number }>({ w: 300, h: 420 });

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewPaneRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<DecodedSourceImage | null>(null);
  const grayCacheRef = useRef<{ h: number; gray: Uint8Array } | null>(null);
  const genRef = useRef(0);

  // Measure preview pane size dynamically
  useEffect(() => {
    const el = previewPaneRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setPreviewBox({ w: rect.width, h: rect.height });
      }
    };
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Cleanup source bitmap on unmount
  useEffect(() => {
    return () => {
      sourceRef.current?.close();
      sourceRef.current = null;
    };
  }, []);

  // Recompute gray + RGBA preview whenever parameters change (latest-wins generation guard)
  useEffect(() => {
    const gen = ++genRef.current;
    const w = PLUGIN_IMAGE_LANE_WIDTH;
    const h = Math.max(1, Math.round(length * ticks));

    const run = async () => {
      if (!sourceRef.current) {
        const src = await loadPluginSourceImage(dialog.imageBytes);
        if (gen !== genRef.current) {
          src?.close();
          return;
        }
        if (!src) {
          setFailed(true);
          return;
        }
        sourceRef.current = src;
        setSrcSize({ w: src.srcWidth, h: src.srcHeight });
      }

      const src = sourceRef.current;
      let gray = grayCacheRef.current?.h === h ? grayCacheRef.current.gray : null;
      if (!gray) {
        gray = resizeSourceImageToGray(src, w, h);
        if (!gray) {
          if (gen === genRef.current) setFailed(true);
          return;
        }
        grayCacheRef.current = { h, gray };
      }

      if (gen !== genRef.current) return;
      const rendered = renderGrayPreviewRgba(gray, w, h, threshold, invert, showGray);
      if (gen !== genRef.current) return;

      setHolds(rendered.holds);
      setShownRows(h);
      setShownLength(length);

      requestAnimationFrame(() => {
        if (gen !== genRef.current) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const imgData = new ImageData(new Uint8ClampedArray(rendered.rgba), w, h);
        ctx.putImageData(imgData, 0, 0);
      });
    };

    void run();
  }, [dialog.imageBytes, length, ticks, threshold, invert, showGray]);

  const setClampedLength = (v: number) => {
    setLength(Math.min(Math.max(Math.round(v * 4) / 4, 0.25), 64));
  };
  const setClampedTicks = (v: number) => {
    setTicks(Math.min(Math.max(Math.round(v), 1), 192));
  };
  const setClampedThreshold = (v: number) => {
    setThreshold(Math.min(Math.max(Math.round(v), 0), 255));
  };

  const aspectRaw = laneView ? shownLength * beatAspect : shownRows / PLUGIN_IMAGE_LANE_WIDTH;
  const aspect = Math.max(0.02, Math.min(aspectRaw || 0.5, 60));
  const bw = Math.max(previewBox.w - 14, 40);
  const bh = Math.max(previewBox.h - 14, 40);
  const fitW = Math.min(bw, bh / aspect);
  const pw = Math.max(fitW, Math.min(bw, 150));
  const ph = pw * aspect;

  const beatLines: Array<{ beat: number; y: number }> = [];
  if (shownLength > 0 && ph > 0) {
    const perBeat = ph / shownLength;
    const count = Math.floor(shownLength + 1e-9);
    for (let b = 0; b <= count; b++) {
      beatLines.push({ beat: b, y: ph - b * perBeat });
    }
  }
  const perBeatPx = shownLength > 0 ? ph / shownLength : 0;

  const holdColor =
    holds === 0 || holds > 50000
      ? 'rgba(255, 59, 48, 0.9)'
      : holds > 5000
      ? 'rgb(255, 149, 0)'
      : '#ffffff';

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
        boxSizing: 'border-box',
        zIndex: 20,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 800,
          height: 'min(calc(100% - 24px), 620px)',
          minHeight: 240,
          padding: 14,
          borderRadius: 12,
          backgroundColor: 'rgb(31, 31, 31)',
          border: '1px solid rgba(255, 255, 255, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          boxSizing: 'border-box',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span
            style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: 15,
              fontWeight: 700,
              color: SwiftColors.laneCyan,
            }}
          >
            {dialog.title}
          </span>
          {dialog.message.length > 0 && (
            <span
              style={{
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                fontSize: 12,
                color: 'rgba(255, 255, 255, 0.6)',
              }}
            >
              {dialog.message}
            </span>
          )}
        </div>

        {/* Main 2-column content */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
          {/* Left Preview Pane */}
          <div
            ref={previewPaneRef}
            style={{
              flex: 1,
              minWidth: 0,
              height: '100%',
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              borderRadius: 6,
              border: '1px solid rgba(255, 255, 255, 0.25)',
              overflowY: 'auto',
              touchAction: 'pan-y',
              display: 'flex',
              justifyContent: 'center',
              alignItems: ph > previewBox.h - 14 ? 'flex-start' : 'center',
              padding: 6,
              boxSizing: 'border-box',
            }}
          >
            {failed ? (
              <span
                style={{
                  fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                  fontSize: 13,
                  color: 'rgba(255, 59, 48, 0.9)',
                }}
              >
                画像を読み込めませんでした
              </span>
            ) : (
              <div
                style={{
                  position: 'relative',
                  width: pw,
                  height: ph,
                  border: '1px solid rgba(255, 255, 255, 0.35)',
                  flexShrink: 0,
                  boxSizing: 'border-box',
                }}
              >
                <canvas
                  ref={canvasRef}
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    imageRendering: 'pixelated',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    overflow: 'hidden',
                  }}
                >
                  {beatLines.map((ln) => (
                    <React.Fragment key={ln.beat}>
                      <div
                        style={{
                          position: 'absolute',
                          left: 0,
                          right: 0,
                          top: ln.y,
                          height: 1,
                          backgroundColor: 'rgba(255, 255, 255, 0.4)',
                        }}
                      />
                      {perBeatPx >= 14 && (
                        <span
                          style={{
                            position: 'absolute',
                            left: 3,
                            top: ln.y < 12 ? ln.y + 1 : ln.y - 12,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                            fontSize: 9,
                            fontWeight: 700,
                            color: 'rgba(255, 255, 255, 0.85)',
                            lineHeight: 1,
                          }}
                        >
                          {ln.beat}
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Controls Pane */}
          <div
            style={{
              width: 288,
              flexShrink: 0,
              height: '100%',
              overflowY: 'auto',
              touchAction: 'pan-y',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              paddingRight: 2,
              boxSizing: 'border-box',
            }}
          >
            {/* Length */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <SectionHeader title="長さ" value={`${Number(length.toFixed(2))} 拍`} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StepBtn label="−" onClick={() => setClampedLength(length - 0.25)} />
                <input
                  type="range"
                  min={0.25}
                  max={64}
                  step={0.25}
                  value={length}
                  onChange={(e) => setClampedLength(parseFloat(e.target.value))}
                  style={{ flex: 1, accentColor: SwiftColors.laneCyan }}
                />
                <StepBtn label="+" onClick={() => setClampedLength(length + 0.25)} />
              </div>
              <ChipRow
                values={[1, 2, 4, 8, 16]}
                active={(v) => v === length}
                onSelect={(v) => setClampedLength(v)}
              />
            </div>

            {/* Ticks */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <SectionHeader title="分割数 (1拍あたりの tick)" value={`1/${ticks}`} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StepBtn label="−" onClick={() => setClampedTicks(ticks - 1)} />
                <input
                  type="range"
                  min={1}
                  max={192}
                  step={1}
                  value={ticks}
                  onChange={(e) => setClampedTicks(parseInt(e.target.value, 10))}
                  style={{ flex: 1, accentColor: SwiftColors.laneCyan }}
                />
                <StepBtn label="+" onClick={() => setClampedTicks(ticks + 1)} />
              </div>
              <ChipRow
                values={[8, 12, 16, 24, 32, 48, 64, 96, 192]}
                active={(v) => v === ticks}
                onSelect={(v) => setClampedTicks(v)}
              />
            </div>

            {/* Threshold */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <SectionHeader title="しきい値 (これより暗い所がホールド)" value={`${threshold}`} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StepBtn label="−" onClick={() => setClampedThreshold(threshold - 1)} />
                <input
                  type="range"
                  min={0}
                  max={255}
                  step={1}
                  value={threshold}
                  onChange={(e) => setClampedThreshold(parseInt(e.target.value, 10))}
                  style={{ flex: 1, accentColor: SwiftColors.laneCyan }}
                />
                <StepBtn label="+" onClick={() => setClampedThreshold(threshold + 1)} />
              </div>
            </div>

            {/* Invert & Display Mode */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: '#ffffff' }}>
                  反転 (明るい所をホールドに)
                </span>
                <input
                  type="checkbox"
                  checked={invert}
                  onChange={(e) => setInvert(e.target.checked)}
                  style={{ accentColor: SwiftColors.laneCyan, width: 18, height: 18 }}
                />
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)' }}>
                  表示
                </span>
                <SegmentedSwitch
                  options={[
                    { label: 'ホールド', active: !showGray, onClick: () => setShowGray(false) },
                    { label: '白黒', active: showGray, onClick: () => setShowGray(true) },
                  ]}
                />
                <SegmentedSwitch
                  options={[
                    { label: 'レーンの比率', active: laneView, onClick: () => setLaneView(true) },
                    { label: '256×N px', active: !laneView, onClick: () => setLaneView(false) },
                  ]}
                />
              </div>
            </div>

            {/* Info stats */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {shownRows > 0 && !failed ? (
                <>
                  <span
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 11,
                      color: 'rgba(255, 255, 255, 0.6)',
                    }}
                  >
                    元画像 {srcSize.w}×{srcSize.h} px
                  </span>
                  <span
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      fontSize: 11,
                      color: 'rgba(255, 255, 255, 0.6)',
                    }}
                  >
                    → 256×{shownRows} px ({Number(shownLength.toFixed(2))} 拍 × {ticks})
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: holdColor }}>
                    ホールド {holds} 本
                  </span>
                  {holds === 0 ? (
                    <span style={{ fontSize: 11, color: 'rgba(255, 59, 48, 0.9)' }}>
                      ホールドがありません。しきい値や反転を変えてください
                    </span>
                  ) : holds > 5000 ? (
                    <span style={{ fontSize: 11, color: 'rgb(255, 149, 0)' }}>
                      本数が多いと、作るのに時間がかかります (目安)
                    </span>
                  ) : null}
                </>
              ) : !failed ? (
                <span style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.6)' }}>計算中…</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Footer Buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => state.resolvePluginDialog(null)}
            style={{
              padding: '6px 16px',
              borderRadius: 8,
              backgroundColor: 'rgba(255, 255, 255, 0.14)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            キャンセル
          </button>
          <button
            type="button"
            disabled={holds <= 0 || failed}
            onClick={() => state.resolvePluginDialog(`${length} ${ticks} ${threshold} ${invert ? 1 : 0}`)}
            style={{
              padding: '6px 18px',
              borderRadius: 8,
              backgroundColor: SwiftColors.panelBlue,
              border: 'none',
              color: '#000000',
              fontSize: 14,
              fontWeight: 700,
              cursor: holds > 0 && !failed ? 'pointer' : 'default',
              opacity: holds > 0 && !failed ? 1 : 0.45,
            }}
          >
            ホールドを作成
          </button>
        </div>
      </div>
    </div>
  );
};

const SectionHeader: React.FC<{ title: string; value: string }> = ({ title, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
    <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255, 255, 255, 0.6)' }}>{title}</span>
    <span
      style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 13,
        fontWeight: 700,
        color: '#ffffff',
      }}
    >
      {value}
    </span>
  </div>
);

const StepBtn: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      width: 30,
      height: 30,
      borderRadius: 6,
      backgroundColor: 'rgba(255, 255, 255, 0.12)',
      border: 'none',
      color: '#ffffff',
      fontSize: 18,
      fontWeight: 700,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0,
    }}
  >
    {label}
  </button>
);

const ChipRow: React.FC<{
  values: number[];
  active: (v: number) => boolean;
  onSelect: (v: number) => void;
}> = ({ values, active, onSelect }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))',
      gap: 6,
    }}
  >
    {values.map((v) => {
      const on = active(v);
      return (
        <button
          key={v}
          type="button"
          onClick={() => onSelect(v)}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            fontWeight: 600,
            padding: '5px 4px',
            borderRadius: 6,
            border: 'none',
            backgroundColor: on ? SwiftColors.laneCyan : 'rgba(255, 255, 255, 0.12)',
            color: on ? '#000000' : '#ffffff',
            cursor: 'pointer',
          }}
        >
          {v}
        </button>
      );
    })}
  </div>
);

const SegmentedSwitch: React.FC<{
  options: Array<{ label: string; active: boolean; onClick: () => void }>;
}> = ({ options }) => (
  <div
    style={{
      display: 'flex',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
      borderRadius: 6,
      padding: 2,
      gap: 2,
    }}
  >
    {options.map((opt) => (
      <button
        key={opt.label}
        type="button"
        onClick={opt.onClick}
        style={{
          flex: 1,
          padding: '5px 8px',
          borderRadius: 5,
          border: 'none',
          backgroundColor: opt.active ? 'rgba(255, 255, 255, 0.24)' : 'transparent',
          color: opt.active ? '#ffffff' : 'rgba(255, 255, 255, 0.65)',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {opt.label}
      </button>
    ))}
  </div>
);
