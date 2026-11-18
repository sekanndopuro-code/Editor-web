// 設定画面の「保存データ」欄。このエディタがブラウザの中に何を保存しているかを一覧にして、
// 消える条件を説明し、1つずつ削除できるようにする (全部まとめて消すボタンは置かない)。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PluginStore, type PluginPackageSummary } from '../plugins/PluginStore';
import { EditorSessionStorage, type SessionStorageSummary } from '../state/EditorSessionStorage';
import { SwiftColors, panelLabelFontCss } from '../state/EditorConstants';
import type { EditorState } from '../state/EditorState';

const LAST_CHART_KEY = 'malody_slide_editor.lastChart'; // EditorState.scheduleSave のバックアップ

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatTime(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function readLastChartBytes(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_CHART_KEY);
    return raw === null ? null : new Blob([raw]).size;
  } catch {
    return null;
  }
}

function countSettingKeys(): number {
  try {
    let n = 0;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith('editor.')) n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}

export const StorageManager: React.FC<{
  state: EditorState;
  fontBoost: number;
}> = ({ state, fontBoost }) => {
  const [packages, setPackages] = useState<PluginPackageSummary[]>([]);
  const [session, setSession] = useState<SessionStorageSummary | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [lastChartBytes, setLastChartBytes] = useState<number | null>(null);
  const [settingKeys, setSettingKeys] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const armTimerRef = useRef<number | null>(null);
  const aliveRef = useRef(true);

  const smallSize = 11 * state.smallTextBoost;

  const refreshPlugins = useCallback(() => {
    setPackages(PluginStore.shared.getPackageSummaries());
  }, []);

  const refreshAll = useCallback(async () => {
    refreshPlugins();
    setLastChartBytes(readLastChartBytes());
    setSettingKeys(countSettingKeys());
    const s = await EditorSessionStorage.getSummary();
    if (aliveRef.current) {
      setSession(s);
      setSessionLoaded(true);
    }
    try {
      if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        if (aliveRef.current && typeof e.usage === 'number' && typeof e.quota === 'number') {
          setUsage({ used: e.usage, quota: e.quota });
        }
      }
    } catch {
      // estimate が使えない環境では表示しない
    }
  }, [refreshPlugins]);

  useEffect(() => {
    aliveRef.current = true;
    void PluginStore.shared.ready().then(() => {
      if (aliveRef.current) refreshPlugins();
    });
    void refreshAll();
    const unsub = PluginStore.shared.subscribe(() => {
      if (aliveRef.current) refreshPlugins();
    });
    return () => {
      aliveRef.current = false;
      unsub();
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
    };
  }, [refreshAll, refreshPlugins]);

  // 1回目のタップで「もう一度押すと削除」に変わり、4秒たつと元に戻る (押し間違い防止)
  const confirmThen = (key: string, action: () => Promise<void> | void) => {
    if (armed !== key) {
      setArmed(key);
      if (armTimerRef.current !== null) window.clearTimeout(armTimerRef.current);
      armTimerRef.current = window.setTimeout(() => {
        armTimerRef.current = null;
        setArmed(null);
      }, 4000);
      return;
    }
    if (armTimerRef.current !== null) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
    setArmed(null);
    void Promise.resolve(action()).then(() => {
      void refreshAll();
    });
  };

  const note = (text: string) => (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: smallSize,
        color: 'rgba(255, 255, 255, 0.55)',
        lineHeight: 1.35,
        textAlign: 'left',
        width: '100%',
        wordBreak: 'break-word',
        whiteSpace: 'pre-line',
      }}
    >
      {text}
    </div>
  );

  const heading = (text: string) => (
    <div
      style={{
        font: panelLabelFontCss(21, fontBoost),
        color: '#ffffff',
        textAlign: 'left',
        lineHeight: 1.2,
        width: '100%',
      }}
    >
      {text}
    </div>
  );

  const row = (
    key: string,
    title: string,
    detail: string,
    onDelete: (() => Promise<void> | void) | null
  ) => {
    const isArmed = armed === key;
    return (
      <div
        key={key}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '8px 10px',
          boxSizing: 'border-box',
          border: '1px solid rgba(255, 255, 255, 0.25)',
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span
            style={{
              font: panelLabelFontCss(18, fontBoost),
              color: '#ffffff',
              lineHeight: 1.25,
              textAlign: 'left',
              wordBreak: 'break-word',
            }}
          >
            {title}
          </span>
          <span
            style={{
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: smallSize,
              color: 'rgba(255, 255, 255, 0.55)',
              lineHeight: 1.35,
              textAlign: 'left',
              wordBreak: 'break-word',
              whiteSpace: 'pre-line',
            }}
          >
            {detail}
          </span>
        </div>
        {onDelete && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              confirmThen(key, onDelete);
            }}
            style={{
              flexShrink: 0,
              minWidth: 64,
              minHeight: 36,
              padding: '4px 10px',
              border: `2px solid ${isArmed ? 'rgba(255, 59, 48, 0.95)' : '#ffffff'}`,
              background: isArmed ? 'rgba(255, 59, 48, 0.85)' : 'transparent',
              color: '#ffffff',
              font: panelLabelFontCss(16, fontBoost),
              lineHeight: 1.1,
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          >
            {isArmed ? 'もう一度' : '削除'}
          </button>
        )}
      </div>
    );
  };

  const removePluginPackage = async (pkg: PluginPackageSummary) => {
    const activeId = state.activePluginID;
    if (activeId && activeId.startsWith(`user/${pkg.folder}/`)) {
      state.stopInteractivePlugin();
      if (state.tool === 'plugin') state.tool = 'unselected';
    }
    await PluginStore.shared.removePackage(pkg.folder);
  };

  const pluginDetail = (pkg: PluginPackageSummary) => {
    const parts: string[] = [];
    if (pkg.luaCount === 0) {
      parts.push('lua がなく、画像などだけ残っています');
    } else {
      parts.push(`lua ${pkg.luaCount}個`);
    }
    if (pkg.assetCount > 0) parts.push(`画像など ${pkg.assetCount}個`);
    parts.push(formatBytes(pkg.bytes));
    const names = pkg.titles.length > 0 ? `\n${pkg.titles.join('、')}` : '';
    return `${parts.join(' · ')}${names}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', alignItems: 'flex-start' }}>
      {heading('保存データ')}
      {note(
        '読み込んだ譜面・曲・背景・プラグインは、サーバーには送られず、このブラウザの中 (Safari のサイト用の保存領域) にだけ保存されます。ファイルアプリには保存されません。'
      )}
      {usage && note(`このサイト全体の使用量: ${formatBytes(usage.used)} / 上限の目安 ${formatBytes(usage.quota)}`)}

      <div style={{ font: panelLabelFontCss(18, fontBoost), color: SwiftColors.panelBlue, width: '100%', textAlign: 'left' }}>
        プラグイン
      </div>
      {packages.length === 0 && note('保存されているプラグインはありません。')}
      {packages.map((pkg) =>
        row(`plugin:${pkg.folder}`, pkg.folder, pluginDetail(pkg), () => removePluginPackage(pkg))
      )}
      {note(
        '「削除」は、そのフォルダの lua と画像などをまとめて消します。Adv. の一覧からプラグインを1つ消したときも、同じフォルダにほかの lua が残っていなければ画像ごと消えます (残っていれば画像はそのままです)。'
      )}

      <div style={{ font: panelLabelFontCss(18, fontBoost), color: SwiftColors.panelBlue, width: '100%', textAlign: 'left' }}>
        編集中のデータ
      </div>
      {!sessionLoaded && note('読み込み中…')}
      {sessionLoaded && !session && note('編集状態を読み取れませんでした。')}
      {session && (
        <>
          {row(
            'session:chart',
            session.chart ? `譜面 (${session.chart.name})` : '譜面',
            session.chart
              ? `${formatBytes(session.chart.bytes)} · 最終保存 ${formatTime(session.chart.updatedAt)}`
              : '保存されていません',
            null
          )}
          {row(
            'session:audio',
            session.audio ? `曲 (${session.audio.fileName || '無題'})` : '曲',
            session.audio ? formatBytes(session.audio.bytes) : '保存されていません',
            session.audio ? () => EditorSessionStorage.saveAudio(null, '').then(() => undefined) : null
          )}
          {row(
            'session:bg',
            session.bg ? `背景画像 (${session.bg.fileName || '無題'})` : '背景画像',
            session.bg ? formatBytes(session.bg.bytes) : '保存されていません',
            session.bg ? () => EditorSessionStorage.saveBackground(null, '').then(() => undefined) : null
          )}
        </>
      )}
      {lastChartBytes !== null &&
        row(
          'local:lastChart',
          '譜面のバックアップ (localStorage)',
          `${formatBytes(lastChartBytes)} · 今のところ復元には使われていません`,
          null
        )}
      {note(
        '譜面は、編集するたびに自動で上書き保存されるので、ここからは消せません (消してもすぐ書き直されます)。曲と背景は、消しても今の編集には影響しませんが、ページを開き直したときに復元されなくなります。'
      )}

      <div style={{ font: panelLabelFontCss(18, fontBoost), color: SwiftColors.panelBlue, width: '100%', textAlign: 'left' }}>
        設定
      </div>
      {row('local:settings', 'この SETTING の項目', `${settingKeys}個 · ごく小さい値だけです`, null)}

      <div style={{ font: panelLabelFontCss(18, fontBoost), color: SwiftColors.panelBlue, width: '100%', textAlign: 'left' }}>
        いつ消えるか
      </div>
      {note(
        '・プラグイン: 「削除」を押したときだけ消えます。\n・編集中の譜面・曲・背景: メニューの Quit を押したときに消えます。ページの再読み込みや、タブ・アプリを閉じただけでは消えません。\n・この SETTING の項目: 自動では消えません。\n・ブラウザ側の事情: ホーム画面に追加していない Safari のページは、しばらく (目安は約7日) 開かないと、Safari がこれらをまとめて消すことがあります。プライベートブラウズでは閉じると消えます。残したい譜面は、書き出して Files アプリなどに保存しておいてください。'
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void refreshAll();
        }}
        style={{
          alignSelf: 'flex-start',
          minHeight: 36,
          padding: '4px 14px',
          border: '2px solid #ffffff',
          background: 'transparent',
          color: '#ffffff',
          font: panelLabelFontCss(16, fontBoost),
          cursor: 'pointer',
        }}
      >
        表示を更新
      </button>
    </div>
  );
};
