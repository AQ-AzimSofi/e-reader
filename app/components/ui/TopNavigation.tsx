/**
 * トップナビゲーションバーコンポーネント
 * サブディレクトリ対応：ディレクトリとファイルの2段階選択UI
 * モバイル対応：ハンバーガーメニュー実装
 */

'use client';

import { useEffect, useState } from 'react';
import { useTextFileList } from '@/app/hooks/useTextFileList';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { COLORS, STORAGE_KEYS, API_ROUTES } from '@/lib/constants';
import { toTint } from '@/lib/utils/colorTint';

const BAR_BUTTON_CLASS = 'px-4 py-2 border font-medium cursor-pointer transition-colors';
const BAR_NAV_LINK_CLASS = 'px-1 py-2 border-b-2 cursor-pointer interactive-link';
const BAR_SELECT_CLASS = 'px-3 py-1.5 border text-xs focus:outline-none focus:ring-2 transition-colors';
const MINI_BUTTON_CLASS = 'p-2 border cursor-pointer transition-colors';
const DRAWER_BUTTON_CLASS = 'w-full px-4 py-3 border font-medium text-sm cursor-pointer transition-colors';
const DRAWER_NAV_LINK_CLASS = 'py-2.5 border-b-2 text-sm cursor-pointer interactive-link';
const DRAWER_SELECT_CLASS = 'w-full px-4 py-3 border text-sm focus:outline-none focus:ring-2';

const SELECT_STYLE = {
  backgroundColor: COLORS.SURFACE,
  borderColor: COLORS.NEUTRAL,
  '--tw-ring-color': COLORS.PRIMARY,
} as React.CSSProperties;

function toggleStyle(isOn: boolean): React.CSSProperties {
  return {
    backgroundColor: isOn ? COLORS.INK : 'transparent',
    borderColor: isOn ? COLORS.INK : COLORS.NEUTRAL,
    color: isOn ? COLORS.SURFACE : COLORS.SECONDARY,
  };
}

function navLinkStyle(isCurrentPage: boolean): React.CSSProperties {
  return {
    borderColor: isCurrentPage ? COLORS.PRIMARY : 'transparent',
    fontWeight: isCurrentPage ? 700 : 400,
  };
}

export default function TopNavigation() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { directories, filesByDirectory, isLoading } = useTextFileList();

  const currentDirectory = searchParams.get('directory') || (directories.length > 0 ? directories[0] : '');
  const currentFile = searchParams.get('fileName') || '';
  const dropdownAlwaysOpen = searchParams.get('dropdownAlwaysOpen') === 'true';

  // 現在のディレクトリのファイルリストを取得
  const filesInCurrentDirectory = currentDirectory ? (filesByDirectory[currentDirectory] || []) : [];

  // ファイル選択UIを表示するページかどうか
  const showFileSelector = pathname === '/' || pathname === '/book-reader';

  const [showFurigana, setShowFurigana] = useState<boolean>(false);
  const [vocabularyMode, setVocabularyMode] = useState<boolean>(false);
  const [aiExplanationEnabled, setAiExplanationEnabled] = useState<boolean>(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // localStorageから振り仮名表示設定と単語帳モード設定を読み込み
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEYS.FURIGANA_ENABLED);
      if (stored !== null) {
        setShowFurigana(stored === 'true');
      }
      const vocabStored = localStorage.getItem(STORAGE_KEYS.VOCABULARY_MODE);
      if (vocabStored !== null) {
        setVocabularyMode(vocabStored === 'true');
      }
      const aiExplanationStored = localStorage.getItem(STORAGE_KEYS.AI_EXPLANATION_ENABLED);
      if (aiExplanationStored !== null) {
        setAiExplanationEnabled(aiExplanationStored === 'true');
      }
      const collapsedStored = localStorage.getItem('topnav_collapsed');
      if (collapsedStored !== null) {
        setIsCollapsed(collapsedStored === 'true');
      }
    }
  }, []);

  // モバイルメニューが開いているときはスクロールを防止
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  // 振り仮名表示をトグル（localStorageに保存 + カスタムイベント発火）
  const toggleFurigana = () => {
    const newValue = !showFurigana;
    setShowFurigana(newValue);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.FURIGANA_ENABLED, newValue.toString());
      // カスタムイベントを発火して他のコンポーネントに通知
      window.dispatchEvent(new CustomEvent('furiganaChanged', { detail: { enabled: newValue } }));
    }
  };

  // 単語帳モードをトグル（localStorageに保存 + カスタムイベント発火）
  const toggleVocabularyMode = () => {
    const newValue = !vocabularyMode;
    setVocabularyMode(newValue);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.VOCABULARY_MODE, newValue.toString());
      // カスタムイベントを発火して他のコンポーネントに通知
      window.dispatchEvent(new CustomEvent('vocabularyModeChanged', { detail: { enabled: newValue } }));
    }
  };

  // AI解説機能をトグル（localStorageに保存 + カスタムイベント発火）
  const toggleAiExplanation = () => {
    const newValue = !aiExplanationEnabled;
    setAiExplanationEnabled(newValue);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.AI_EXPLANATION_ENABLED, newValue.toString());
      // カスタムイベントを発火して他のコンポーネントに通知
      window.dispatchEvent(new CustomEvent('aiExplanationChanged', { detail: { enabled: newValue } }));
    }
  };

  // トップナビゲーションの折りたたみをトグル
  const toggleTopNavCollapse = () => {
    const newValue = !isCollapsed;
    setIsCollapsed(newValue);
    if (typeof window !== 'undefined') {
      localStorage.setItem('topnav_collapsed', newValue.toString());
    }
  };

  // Set default directory and file in URL when missing (client-side only to avoid hydration mismatch)
  useEffect(() => {
    if (!searchParams.get('directory') && directories.length > 0) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('directory', directories[0]);

      // 最初のディレクトリの最初のファイルを設定
      const firstDirFiles = filesByDirectory[directories[0]] || [];
      if (firstDirFiles.length > 0 && !searchParams.get('fileName')) {
        params.set('fileName', firstDirFiles[0]);
      }

      router.push(`${pathname}?${params.toString()}`);
    } else if (!searchParams.get('fileName') && filesInCurrentDirectory.length > 0) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('fileName', filesInCurrentDirectory[0]);
      router.push(`${pathname}?${params.toString()}`);
    }
  }, [directories, filesByDirectory, filesInCurrentDirectory, searchParams, router, pathname]);

  const handleDirectoryChange = (directory: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('directory', directory);

    // ディレクトリ変更時、最初のファイルを自動選択
    const filesInDir = filesByDirectory[directory] || [];
    if (filesInDir.length > 0) {
      params.set('fileName', filesInDir[0]);
    }

    router.push(`${pathname}?${params.toString()}`);
  };

  const handleFileChange = (fileName: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('fileName', fileName);
    router.push(`${pathname}?${params.toString()}`);
  };

  const toggleDropdownState = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('dropdownAlwaysOpen', (!dropdownAlwaysOpen).toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <>
      {/* トップナビゲーションバー */}
      <div
        className="fixed top-0 left-0 w-full px-4 md:px-6 z-50 text-xs border-b transition-all duration-300"
        style={{
          backgroundColor: COLORS.BASE,
          borderColor: COLORS.INK,
          color: COLORS.INK,
          paddingTop: isCollapsed ? '0.25rem' : '0.75rem',
          paddingBottom: isCollapsed ? '0.25rem' : '0.75rem',
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between md:justify-center gap-3">
          {!isCollapsed && (
            <>
          {/* モバイル：ハンバーガーメニューアイコン */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 interactive-nav-btn"
            aria-label="メニューを開く"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {mobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>

          {/* デスクトップ：すべてのナビゲーション要素 */}
          <div className="hidden md:flex items-center justify-center gap-3 flex-wrap">
            {/* ディレクトリとファイルの2段階選択（/と/book-readerのみ表示） */}
            {showFileSelector && (
              <>
                {/* ディレクトリ選択ドロップダウン */}
                <div className="flex items-center gap-2.5 min-h-12">
                  <label htmlFor="directory-selector" className="font-medium" style={{ color: COLORS.SECONDARY }}>
                    ディレクトリ:
                  </label>
                  {isLoading ? (
                    <span style={{ color: COLORS.SECONDARY }}>読み込み中...</span>
                  ) : (
                    <select
                      id="directory-selector"
                      value={currentDirectory}
                      onChange={(e) => handleDirectoryChange(e.target.value)}
                      className={BAR_SELECT_CLASS}
                      style={SELECT_STYLE}
                    >
                      {directories.map((dir) => (
                        <option key={dir} value={dir}>
                          {dir}/
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* ファイル選択ドロップダウン */}
                <div className="flex items-center gap-2.5 min-h-12">
                  <label htmlFor="file-selector" className="font-medium" style={{ color: COLORS.SECONDARY }}>
                    ファイル:
                  </label>
                  {isLoading ? (
                    <span style={{ color: COLORS.SECONDARY }}>読み込み中...</span>
                  ) : (
                    <select
                      id="file-selector"
                      value={currentFile}
                      onChange={(e) => handleFileChange(e.target.value)}
                      className={BAR_SELECT_CLASS}
                      style={SELECT_STYLE}
                    >
                      {filesInCurrentDirectory.map((file) => (
                        <option key={file} value={file}>
                          {file}.txt
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </>
            )}

            {/* 表示トグルボタン */}
            <button
              onClick={toggleDropdownState}
              className={BAR_BUTTON_CLASS}
              style={{ borderColor: COLORS.INK }}
            >
              {dropdownAlwaysOpen ? '折りたたみ表示' : '展開表示'}
            </button>

            {/* 振り仮名トグルボタン */}
            <button
              onClick={toggleFurigana}
              className={BAR_BUTTON_CLASS}
              style={toggleStyle(showFurigana)}
            >
              {showFurigana ? '振り仮名 ON' : '振り仮名 OFF'}
            </button>

            {/* 単語帳モードトグルボタン */}
            <button
              onClick={toggleVocabularyMode}
              className={BAR_BUTTON_CLASS}
              style={toggleStyle(vocabularyMode)}
            >
              {vocabularyMode ? '単語帳 ON' : '単語帳 OFF'}
            </button>

            {/* AI解説トグルボタン */}
            <button
              onClick={toggleAiExplanation}
              className={BAR_BUTTON_CLASS}
              style={toggleStyle(aiExplanationEnabled)}
            >
              {aiExplanationEnabled ? 'AI解説 ON' : 'AI解説 OFF'}
            </button>

            {/* ページナビゲーション */}
            <div className="flex items-center gap-3">
              <a
                href="/text-input"
                className={BAR_NAV_LINK_CLASS}
                style={navLinkStyle(pathname === '/text-input')}
              >
                入力
              </a>
              <a
                href="/text-input-ai"
                className={BAR_NAV_LINK_CLASS}
                style={navLinkStyle(pathname === '/text-input-ai')}
              >
                入力-AI
              </a>
              <a
                href="/ocr"
                className={BAR_NAV_LINK_CLASS}
                style={navLinkStyle(pathname === '/ocr')}
              >
                OCR
              </a>
              <a
                href="/visual-novel"
                className={BAR_NAV_LINK_CLASS}
                style={navLinkStyle(pathname === '/visual-novel')}
              >
                ビジュアルノベル
              </a>
              <a
                href="/book-reader"
                className={BAR_NAV_LINK_CLASS}
                style={navLinkStyle(pathname === '/book-reader')}
              >
                読書
              </a>
              <a
                href="/vocabulary"
                className={BAR_NAV_LINK_CLASS}
                style={navLinkStyle(pathname === '/vocabulary')}
              >
                単語帳
              </a>
              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('toggleRubyLookup'));
                }}
                className={BAR_NAV_LINK_CLASS}
                style={navLinkStyle(false)}
                title="Ruby Lookup (Ctrl+K or /)"
              >
                Ruby
              </button>
              <button
                onClick={async () => {
                  await fetch(API_ROUTES.AUTH_LOGOUT, { method: 'POST' });
                  window.location.href = '/login';
                }}
                className={BAR_NAV_LINK_CLASS}
                style={{ ...navLinkStyle(false), color: COLORS.SECONDARY }}
              >
                ログアウト
              </button>
            </div>
          </div>

          {/* モバイル：現在のファイル名表示 */}
          {showFileSelector && (
            <div className="md:hidden text-xs font-medium truncate max-w-[180px]">
              {currentFile || 'ファイル未選択'}
            </div>
          )}
            </>
          )}

          {/* 折りたたみトグルボタン */}
          <button
            onClick={toggleTopNavCollapse}
            className="p-1 interactive-nav-btn ml-auto"
            aria-label={isCollapsed ? 'ナビゲーションを展開' : 'ナビゲーションを折りたたむ'}
            style={{ color: COLORS.INK }}
          >
            <svg
              className="w-4 h-4 transition-transform duration-300"
              style={{ transform: isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 15l7-7 7 7"
              />
            </svg>
          </button>

          {/* 折りたたみ時の浮遊ミニツールバー */}
          {isCollapsed && (
            <div className="flex items-center gap-2 ml-4">
              {/* 単語帳モードトグル */}
              <button
                onClick={toggleVocabularyMode}
                className={MINI_BUTTON_CLASS}
                style={toggleStyle(vocabularyMode)}
                title={vocabularyMode ? '単語帳モード ON' : '単語帳モード OFF'}
                aria-label={vocabularyMode ? '単語帳モード ON' : '単語帳モード OFF'}
              >
                <span className="text-lg font-bold">
                  {vocabularyMode ? '単' : '-'}
                </span>
              </button>

              {/* 振り仮名トグル */}
              <button
                onClick={toggleFurigana}
                className={MINI_BUTTON_CLASS}
                style={toggleStyle(showFurigana)}
                title={showFurigana ? '振り仮名 ON' : '振り仮名 OFF'}
                aria-label={showFurigana ? '振り仮名 ON' : '振り仮名 OFF'}
              >
                <span className="text-sm font-bold">
                  {showFurigana ? 'あ' : 'A'}
                </span>
              </button>

              {/* AI解説トグル */}
              <button
                onClick={toggleAiExplanation}
                className={MINI_BUTTON_CLASS}
                style={toggleStyle(aiExplanationEnabled)}
                title={aiExplanationEnabled ? 'AI解説 ON' : 'AI解説 OFF'}
                aria-label={aiExplanationEnabled ? 'AI解説 ON' : 'AI解説 OFF'}
              >
                <span className="text-lg font-bold">
                  AI
                </span>
              </button>

              {/* 単語帳ページへのリンク */}
              <a
                href="/vocabulary"
                className="p-2 border-b-2 cursor-pointer interactive-link"
                style={{ borderColor: pathname === '/vocabulary' ? COLORS.PRIMARY : 'transparent' }}
                title="単語帳ページへ"
                aria-label="単語帳ページへ"
              >
                <span className="text-lg font-bold">単</span>
              </a>
            </div>
          )}
        </div>
      </div>

      {/* モバイル：スライドインメニュー */}
      <div
        className={`md:hidden fixed inset-0 z-40 transition-opacity duration-300 ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* 背景オーバーレイ */}
        <div
          className="absolute inset-0"
          style={{ backgroundColor: toTint(COLORS.INK, 40) }}
          onClick={closeMobileMenu}
        />

        {/* メニュードロワー */}
        <div
          className={`absolute top-0 left-0 h-full w-80 max-w-[85vw] border-r transition-transform duration-300 ease-in-out ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
          style={{
            backgroundColor: COLORS.SURFACE,
            borderColor: COLORS.NEUTRAL,
            color: COLORS.INK,
          }}
        >
          {/* メニューヘッダー */}
          <div
            className="flex items-center justify-between p-4 border-b"
            style={{
              borderColor: COLORS.INK,
            }}
          >
            <h2 className="font-mincho font-bold text-lg">メニュー</h2>
            <button
              onClick={closeMobileMenu}
              className="p-2 interactive-nav-btn"
              aria-label="メニューを閉じる"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* メニューコンテンツ */}
          <div className="p-4 overflow-y-auto h-[calc(100%-64px)]">
            <div className="space-y-4">
              {/* ファイル選択セクション */}
              {showFileSelector && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold mb-2" style={{ color: COLORS.SECONDARY }}>ファイル選択</h3>

                  {/* ディレクトリ選択 */}
                  <div className="space-y-1.5">
                    <label htmlFor="mobile-directory-selector" className="text-xs font-medium" style={{ color: COLORS.SECONDARY }}>
                      ディレクトリ
                    </label>
                    {isLoading ? (
                      <span className="text-xs" style={{ color: COLORS.SECONDARY }}>読み込み中...</span>
                    ) : (
                      <select
                        id="mobile-directory-selector"
                        value={currentDirectory}
                        onChange={(e) => {
                          handleDirectoryChange(e.target.value);
                          closeMobileMenu();
                        }}
                        className={DRAWER_SELECT_CLASS}
                        style={SELECT_STYLE}
                      >
                        {directories.map((dir) => (
                          <option key={dir} value={dir}>
                            {dir}/
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* ファイル選択 */}
                  <div className="space-y-1.5">
                    <label htmlFor="mobile-file-selector" className="text-xs font-medium" style={{ color: COLORS.SECONDARY }}>
                      ファイル
                    </label>
                    {isLoading ? (
                      <span className="text-xs" style={{ color: COLORS.SECONDARY }}>読み込み中...</span>
                    ) : (
                      <select
                        id="mobile-file-selector"
                        value={currentFile}
                        onChange={(e) => {
                          handleFileChange(e.target.value);
                          closeMobileMenu();
                        }}
                        className={DRAWER_SELECT_CLASS}
                        style={SELECT_STYLE}
                      >
                        {filesInCurrentDirectory.map((file) => (
                          <option key={file} value={file}>
                            {file}.txt
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}

              {/* 表示設定セクション */}
              <div className="space-y-3 pt-4 border-t" style={{ borderColor: COLORS.NEUTRAL }}>
                <h3 className="text-sm font-bold mb-2" style={{ color: COLORS.SECONDARY }}>表示設定</h3>

                {/* 表示トグル */}
                <button
                  onClick={() => {
                    toggleDropdownState();
                    closeMobileMenu();
                  }}
                  className={DRAWER_BUTTON_CLASS}
                  style={{ borderColor: COLORS.INK }}
                >
                  {dropdownAlwaysOpen ? '折りたたみ表示' : '展開表示'}
                </button>

                {/* 振り仮名トグル */}
                <button
                  onClick={() => {
                    toggleFurigana();
                    closeMobileMenu();
                  }}
                  className={DRAWER_BUTTON_CLASS}
                  style={toggleStyle(showFurigana)}
                >
                  {showFurigana ? '振り仮名 ON' : '振り仮名 OFF'}
                </button>

                {/* 単語帳モードトグル */}
                <button
                  onClick={() => {
                    toggleVocabularyMode();
                    closeMobileMenu();
                  }}
                  className={DRAWER_BUTTON_CLASS}
                  style={toggleStyle(vocabularyMode)}
                >
                  {vocabularyMode ? '単語帳 ON' : '単語帳 OFF'}
                </button>

                {/* AI解説トグル */}
                <button
                  onClick={() => {
                    toggleAiExplanation();
                    closeMobileMenu();
                  }}
                  className={DRAWER_BUTTON_CLASS}
                  style={toggleStyle(aiExplanationEnabled)}
                >
                  {aiExplanationEnabled ? 'AI解説 ON' : 'AI解説 OFF'}
                </button>
              </div>

              {/* ページナビゲーションセクション */}
              <div className="flex flex-col items-start gap-1 pt-4 border-t" style={{ borderColor: COLORS.NEUTRAL }}>
                <h3 className="text-sm font-bold mb-2" style={{ color: COLORS.SECONDARY }}>ページ</h3>

                <a
                  href="/text-input"
                  className={DRAWER_NAV_LINK_CLASS}
                  style={navLinkStyle(pathname === '/text-input')}
                  onClick={closeMobileMenu}
                >
                  入力
                </a>
                <a
                  href="/text-input-ai"
                  className={DRAWER_NAV_LINK_CLASS}
                  style={navLinkStyle(pathname === '/text-input-ai')}
                  onClick={closeMobileMenu}
                >
                  入力-AI
                </a>
                <a
                  href="/ocr"
                  className={DRAWER_NAV_LINK_CLASS}
                  style={navLinkStyle(pathname === '/ocr')}
                  onClick={closeMobileMenu}
                >
                  OCR
                </a>
                <a
                  href="/visual-novel"
                  className={DRAWER_NAV_LINK_CLASS}
                  style={navLinkStyle(pathname === '/visual-novel')}
                  onClick={closeMobileMenu}
                >
                  ビジュアルノベル
                </a>
                <a
                  href="/book-reader"
                  className={DRAWER_NAV_LINK_CLASS}
                  style={navLinkStyle(pathname === '/book-reader')}
                  onClick={closeMobileMenu}
                >
                  読書
                </a>
                <a
                  href="/vocabulary"
                  className={DRAWER_NAV_LINK_CLASS}
                  style={navLinkStyle(pathname === '/vocabulary')}
                  onClick={closeMobileMenu}
                >
                  単語帳
                </a>
                <button
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('toggleRubyLookup'));
                    closeMobileMenu();
                  }}
                  className={DRAWER_NAV_LINK_CLASS}
                  style={navLinkStyle(false)}
                >
                  Ruby Lookup
                </button>
                <button
                  onClick={async () => {
                    await fetch(API_ROUTES.AUTH_LOGOUT, { method: 'POST' });
                    window.location.href = '/login';
                  }}
                  className={DRAWER_NAV_LINK_CLASS}
                  style={{ ...navLinkStyle(false), color: COLORS.SECONDARY }}
                >
                  ログアウト
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
