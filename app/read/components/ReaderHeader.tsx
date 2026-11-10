'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS, DARK_COLORS } from '@/lib/constants';
import { formatBookTitle } from '@/lib/utils/bookTitle';

interface ReaderHeaderProps {
  currentPage: number;
  totalPages: number;
  bookmarkPage: number | null;
  isDarkMode: boolean;
  directoryParam: string | null;
  fileNameParam: string | null;
  onPageChange: (page: number) => void;
}

const LIGHT_HEADER_THEME = {
  surface: 'rgba(255,255,255,0.92)',
  border: COLORS.NEUTRAL,
  text: COLORS.INK,
  textMuted: COLORS.SECONDARY,
  inputBg: COLORS.NEUTRAL_SOFT,
  accent: COLORS.PRIMARY,
};

const DARK_HEADER_THEME = {
  surface: 'rgba(21,23,28,0.92)',
  border: DARK_COLORS.NEUTRAL,
  text: DARK_COLORS.TEXT,
  textMuted: DARK_COLORS.TEXT_MUTED,
  inputBg: DARK_COLORS.SURFACE,
  accent: DARK_COLORS.PRIMARY,
};

export default function ReaderHeader({
  currentPage,
  totalPages,
  bookmarkPage,
  isDarkMode,
  fileNameParam,
  onPageChange,
}: ReaderHeaderProps) {
  const router = useRouter();
  const [pageInput, setPageInput] = useState(currentPage.toString());
  const [isPageInputFocused, setIsPageInputFocused] = useState(false);

  const handleGoToPage = useCallback(() => {
    const page = parseInt(pageInput, 10);
    if (page >= 1 && page <= totalPages) {
      onPageChange(page);
    } else {
      setPageInput(currentPage.toString());
    }
  }, [pageInput, totalPages, currentPage, onPageChange]);

  const handlePageInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleGoToPage();
      (e.target as HTMLInputElement).blur();
    }
  };

  const theme = isDarkMode ? DARK_HEADER_THEME : LIGHT_HEADER_THEME;
  const bookTitle = fileNameParam ? formatBookTitle(fileNameParam) : '';

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl border-b transition-colors duration-300 font-gothic"
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        height: '48px',
      }}
    >
      <div className="max-w-3xl mx-auto px-4 h-full">
        <div className="flex items-center justify-between gap-3 h-full">
          <button
            onClick={() => router.push('/library')}
            className="flex items-center gap-1.5 interactive-nav-btn flex-shrink-0 px-2 py-1"
            style={{ color: theme.text }}
            aria-label="本棚に戻る"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="hidden sm:inline text-sm">本棚</span>
          </button>

          <div className="flex items-center gap-4 min-w-0">
            <span
              className="hidden md:block font-mincho font-bold text-[17px] tracking-[0.06em] truncate"
              style={{ color: theme.text }}
            >
              {bookTitle}
            </span>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="p-1.5 disabled:opacity-30 interactive-nav-btn"
                style={{ color: theme.textMuted }}
                aria-label="前のページ"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="ページ番号"
                  value={isPageInputFocused ? pageInput : currentPage.toString()}
                  onChange={(e) => setPageInput(e.target.value)}
                  onFocus={() => {
                    setIsPageInputFocused(true);
                    setPageInput(currentPage.toString());
                  }}
                  onBlur={() => {
                    setIsPageInputFocused(false);
                    handleGoToPage();
                  }}
                  onKeyDown={handlePageInputKeyDown}
                  className="w-10 text-center text-sm font-medium py-1 border-none focus:outline-none bg-transparent"
                  style={{
                    color: theme.text,
                    ...(isPageInputFocused ? { backgroundColor: theme.inputBg, boxShadow: `0 0 0 2px ${theme.accent}` } : {}),
                  }}
                />
                <span className="text-sm whitespace-nowrap" style={{ color: theme.textMuted }}>
                  / {totalPages}
                </span>
              </div>

              <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="p-1.5 disabled:opacity-30 interactive-nav-btn"
                style={{ color: theme.textMuted }}
                aria-label="次のページ"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-shrink-0 text-right" style={{ minWidth: '48px' }}>
            {bookmarkPage && bookmarkPage !== currentPage && (
              <button
                onClick={() => onPageChange(bookmarkPage)}
                className="text-sm font-bold interactive-link"
                style={{ color: theme.accent }}
                title={`栞のページへ (p.${bookmarkPage})`}
              >
                栞 p.{bookmarkPage}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
