'use client';

import * as React from "react";
import { useReadingProgress } from "@/app/hooks/useReadingProgress";
import { COLORS } from "@/lib/constants";

interface SidebarProps {
  setDropdownAlwaysOpen: (state: boolean) => void;
  dropdownAlwaysOpen: boolean;
  fileName?: string | null;
  refreshTrigger?: number;
  onNavigateToBookmark?: () => void;
  /** ページ内のすべてのヘッダーテキスト（コピー用） */
  allHeaders?: string[];
}

export default function Sidebar({
  setDropdownAlwaysOpen,
  dropdownAlwaysOpen,
  fileName,
  refreshTrigger,
  onNavigateToBookmark,
  allHeaders = [],
}: SidebarProps) {
  const { progress, refetch } = useReadingProgress({
    fileName: fileName || '',
    enabled: !!fileName,
  });

  const [mobileProgressExpanded, setMobileProgressExpanded] = React.useState(false);
  const [copyFeedback, setCopyFeedback] = React.useState(false);
  const [isXlScreen, setIsXlScreen] = React.useState(false);

  // Track window width for xl breakpoint (CSS media queries not loading properly)
  React.useEffect(() => {
    const checkWidth = () => setIsXlScreen(window.innerWidth >= 1280);
    checkWidth();
    window.addEventListener('resize', checkWidth);
    return () => window.removeEventListener('resize', checkWidth);
  }, []);

  // ヘッダーテキストをクリップボードにコピー
  const handleCopyHeaders = async () => {
    if (allHeaders.length === 0) return;

    try {
      const textToCopy = allHeaders.join('\n');
      await navigator.clipboard.writeText(textToCopy);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (error) {
      console.error('コピーに失敗しました:', error);
    }
  };

  // ブックマーク更新時にプログレスバーを自動更新
  React.useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger > 0) {
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTrigger]);

  const scrollToBookmark = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    e.preventDefault();
    const el = document.getElementById("bookmark");

    if (el) {
      // Bookmark is on current page, just scroll
      const offset = -window.innerHeight / 5 + el.offsetHeight / 5;
      const top = el.getBoundingClientRect().top + window.scrollY + offset;
      window.scrollTo({ top, behavior: "smooth" });
    } else if (onNavigateToBookmark) {
      // Bookmark is on different page, trigger navigation
      onNavigateToBookmark();
    }
  };

  const showProgress = progress && progress.totalItems > 0;

  return (
    <>
      {/* デスクトップ：左サイドバー (xl以上のみ表示) */}
      {isXlScreen && (
        <div className="fixed top-20 left-4 z-40 text-xs gap-3 flex flex-col">
        {/* 表示/隠す ボタン */}
        <button
          onClick={() => setDropdownAlwaysOpen(!dropdownAlwaysOpen)}
          className="min-h-11 px-5 text-sm font-bold cursor-pointer interactive-link border"
          style={{
            backgroundColor: dropdownAlwaysOpen ? COLORS.SURFACE : COLORS.NEUTRAL_SOFT,
            borderColor: COLORS.NEUTRAL,
            color: dropdownAlwaysOpen ? COLORS.INK : COLORS.SECONDARY_DARK,
          }}
        >
          {dropdownAlwaysOpen ? "表示" : "隠す"}
        </button>

        {/* プログレスインジケーター */}
        {showProgress && (
          <div
            className="border p-3 w-64"
            style={{
              backgroundColor: COLORS.SURFACE,
              borderColor: COLORS.NEUTRAL,
            }}
          >
            <div className="space-y-2">
              {/* プログレスバー */}
              <div
                className="relative h-6 overflow-hidden"
                style={{ backgroundColor: COLORS.NEUTRAL }}
              >
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-300 ease-out flex items-center justify-center"
                  style={{
                    width: `${progress.percentage}%`,
                    backgroundColor: COLORS.INK,
                  }}
                >
                  {progress.percentage > 15 && (
                    <span className="font-bold text-xs" style={{ color: COLORS.SURFACE }}>
                      {progress.percentage}%
                    </span>
                  )}
                </div>
                {progress.percentage <= 15 && (
                  <span
                    className="absolute inset-0 flex items-center justify-center font-bold text-xs"
                    style={{ color: COLORS.INK }}
                  >
                    {progress.percentage}%
                  </span>
                )}
              </div>

              {/* 統計情報 */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div
                  className="px-2 py-1.5 border"
                  style={{ borderColor: COLORS.NEUTRAL }}
                >
                  <div
                    className="font-medium text-xs"
                    style={{ color: COLORS.SECONDARY }}
                  >
                    文字数
                  </div>
                  <div
                    className="font-bold text-xs"
                    style={{ color: COLORS.INK }}
                  >
                    {progress.currentCharCount.toLocaleString()} / {progress.totalCharCount.toLocaleString()}
                  </div>
                </div>
                <div
                  className="px-2 py-1.5 border"
                  style={{ borderColor: COLORS.NEUTRAL }}
                >
                  <div
                    className="font-medium text-xs"
                    style={{ color: COLORS.SECONDARY }}
                  >
                    文章数
                  </div>
                  <div
                    className="font-bold text-xs"
                    style={{ color: COLORS.INK }}
                  >
                    {progress.currentItemIndex} / {progress.totalItems}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ブックマークへ ボタン */}
        <a
          href="#"
          onClick={scrollToBookmark}
          className="min-h-11 px-5 inline-flex items-center justify-center text-sm font-bold interactive-link"
          style={{
            backgroundColor: COLORS.PRIMARY,
            color: COLORS.SURFACE,
          }}
        >
          ブックマークへ
        </a>

        {/* ヘッダーコピー ボタン */}
        {allHeaders.length > 0 && (
          <button
            onClick={handleCopyHeaders}
            className="min-h-11 px-5 border text-sm font-bold cursor-pointer interactive-link text-center"
            style={{
              backgroundColor: copyFeedback ? COLORS.NEUTRAL_SOFT : COLORS.SURFACE,
              borderColor: COLORS.INK,
              color: COLORS.INK,
            }}
          >
            {copyFeedback ? 'コピー済み!' : 'ヘッダーをコピー'}
          </button>
        )}
        </div>
      )}

      {/* ボトムバー (xl未満の全画面で表示、オーディオプレーヤーの上) */}
      {!isXlScreen && (
      <div
        style={{
          position: 'fixed',
          bottom: '3.5rem',
          left: 0,
          right: 0,
          zIndex: 40,
          backgroundColor: COLORS.SURFACE,
          borderTop: `1px solid ${COLORS.INK}`,
          borderBottom: `1px solid ${COLORS.NEUTRAL}`,
        }}
      >
        {/* 展開されたプログレス詳細 */}
        {mobileProgressExpanded && showProgress && (
          <div
            className="border-b px-4 py-3"
            style={{
              backgroundColor: COLORS.SURFACE,
              borderColor: COLORS.NEUTRAL,
            }}
          >
            {/* 統計情報 */}
            <div className="grid grid-cols-2 gap-2">
              <div
                className="px-3 py-2 border"
                style={{ borderColor: COLORS.NEUTRAL }}
              >
                <div
                  className="font-medium text-xs"
                  style={{ color: COLORS.SECONDARY }}
                >
                  文字数
                </div>
                <div
                  className="font-bold text-sm"
                  style={{ color: COLORS.INK }}
                >
                  {progress.currentCharCount.toLocaleString()} / {progress.totalCharCount.toLocaleString()}
                </div>
              </div>
              <div
                className="px-3 py-2 border"
                style={{ borderColor: COLORS.NEUTRAL }}
              >
                <div
                  className="font-medium text-xs"
                  style={{ color: COLORS.SECONDARY }}
                >
                  文章数
                </div>
                <div
                  className="font-bold text-sm"
                  style={{ color: COLORS.INK }}
                >
                  {progress.currentItemIndex} / {progress.totalItems}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* メインコントロールバー */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            {/* 左側：表示トグル + プログレスバー */}
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* 表示/隠す ボタン */}
              <button
                onClick={() => setDropdownAlwaysOpen(!dropdownAlwaysOpen)}
                className="min-h-11 px-3 font-bold cursor-pointer interactive-link border text-xs whitespace-nowrap"
                style={{
                  backgroundColor: dropdownAlwaysOpen ? COLORS.SURFACE : COLORS.NEUTRAL_SOFT,
                  borderColor: COLORS.NEUTRAL,
                  color: dropdownAlwaysOpen ? COLORS.INK : COLORS.SECONDARY_DARK,
                }}
              >
                {dropdownAlwaysOpen ? "表示" : "隠す"}
              </button>

              {/* コンパクトプログレスバー */}
              {showProgress && (
                <button
                  onClick={() => setMobileProgressExpanded(!mobileProgressExpanded)}
                  className="flex-1 min-w-0"
                  aria-label="プログレス詳細を表示"
                >
                  <div
                    className="relative h-8 overflow-hidden"
                    style={{ backgroundColor: COLORS.NEUTRAL }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 transition-all duration-300 ease-out flex items-center justify-center"
                      style={{
                        width: `${progress.percentage}%`,
                        backgroundColor: COLORS.INK,
                      }}
                    >
                      {progress.percentage > 20 && (
                        <span className="font-bold text-xs" style={{ color: COLORS.SURFACE }}>
                          {progress.percentage}%
                        </span>
                      )}
                    </div>
                    {progress.percentage <= 20 && (
                      <span
                        className="absolute inset-0 flex items-center justify-center font-bold text-xs"
                        style={{ color: COLORS.INK }}
                      >
                        {progress.percentage}%
                      </span>
                    )}
                    {/* 展開インジケーター */}
                    <div
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      style={{ color: COLORS.SECONDARY }}
                    >
                      <svg
                        className={`w-4 h-4 transition-transform ${
                          mobileProgressExpanded ? 'rotate-180' : ''
                        }`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                </button>
              )}
            </div>

            {/* 右側：コピー + ブックマークボタン */}
            <div className="flex items-center gap-2">
              {allHeaders.length > 0 && (
                <button
                  onClick={handleCopyHeaders}
                  className="min-h-11 px-3 border font-bold cursor-pointer interactive-link text-xs whitespace-nowrap"
                  style={{
                    backgroundColor: copyFeedback ? COLORS.NEUTRAL_SOFT : COLORS.SURFACE,
                    borderColor: COLORS.INK,
                    color: COLORS.INK,
                  }}
                >
                  {copyFeedback ? '済' : 'コピー'}
                </button>
              )}
              <button
                onClick={scrollToBookmark}
                className="min-h-11 px-4 font-bold cursor-pointer interactive-link text-xs whitespace-nowrap"
                style={{
                  backgroundColor: COLORS.PRIMARY,
                  color: COLORS.SURFACE,
                }}
              >
                ブックマーク
              </button>
            </div>
          </div>
        </div>
      </div>
      )}
    </>
  );
}
