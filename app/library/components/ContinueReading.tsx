'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { API_ROUTES, COLORS } from '@/lib/constants';
import { formatBookTitle } from '@/lib/utils/bookTitle';
import { stripFurigana } from '@/lib/utils/furiganaParser';
import BookCover from './BookCover';

const PAGE_ONLY_BOOKMARK = /^page:\d+$/;
const IMAGE_MARKER = /\[IMAGE:[^\]]+\]/g;

interface ContinueReadingProps {
  fileName: string;
  directory: string;
  progress: number;
  bookmarkPage: number;
  totalPages: number;
}

function toLastReadLine(bookmarkText: string): string {
  if (PAGE_ONLY_BOOKMARK.test(bookmarkText)) return '';
  return stripFurigana(bookmarkText.replace(IMAGE_MARKER, '')).trim();
}

export default function ContinueReading({
  fileName,
  directory,
  progress,
  bookmarkPage,
  totalPages,
}: ContinueReadingProps) {
  const [lastReadLine, setLastReadLine] = useState('');
  const bookPath = `${directory}/${fileName}`;

  useEffect(() => {
    const controller = new AbortController();

    const fetchLastReadLine = async () => {
      try {
        const response = await fetch(
          `${API_ROUTES.READ_BOOKMARK}?fileName=${encodeURIComponent(bookPath)}`,
          { signal: controller.signal }
        );
        if (!response.ok) return;
        const bookmark: { text?: string } = await response.json();
        setLastReadLine(toLastReadLine(bookmark.text ?? ''));
      } catch (error) {
        // The quote is decoration; the block still works without it.
        if (!controller.signal.aborted) console.error('Failed to load last read line:', error);
      }
    };

    fetchLastReadLine();
    return () => controller.abort();
  }, [bookPath]);

  const title = formatBookTitle(fileName);
  const progressPercent = Math.round(Math.min(100, Math.max(0, progress)));
  const readHref = `/read?directory=${encodeURIComponent(directory)}&fileName=${encodeURIComponent(fileName)}&page=${bookmarkPage}`;

  return (
    <section
      aria-label="続きから読む"
      className="flex flex-col sm:flex-row sm:items-center gap-8 sm:gap-14 py-10 sm:py-12 border-b"
      style={{ borderColor: COLORS.NEUTRAL }}
    >
      <div
        className="w-[150px] sm:w-[180px] flex-shrink-0"
        style={{ boxShadow: `6px 6px 0 ${COLORS.NEUTRAL}` }}
      >
        <BookCover fileName={fileName} directory={directory} title={title} size="feature" />
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-3.5">
        <span className="text-xs font-bold tracking-[0.18em]" style={{ color: COLORS.PRIMARY }}>
          続きから読む
        </span>
        <h2
          className="font-mincho font-bold text-3xl sm:text-[44px] leading-tight tracking-[0.04em] line-clamp-2"
          style={{ color: COLORS.INK }}
        >
          {title}
        </h2>
        {lastReadLine && (
          <p
            className="font-mincho text-lg sm:text-[21px] leading-loose line-clamp-2 max-w-[560px]"
            style={{ color: COLORS.SECONDARY_DARK }}
          >
            「{lastReadLine}」
          </p>
        )}
        <div className="flex items-center gap-3.5 max-w-[420px] text-[13px]" style={{ color: COLORS.SECONDARY }}>
          <span className="whitespace-nowrap">{bookmarkPage} / {totalPages} ページ</span>
          <div className="flex-1 h-0.5" style={{ backgroundColor: COLORS.NEUTRAL }}>
            <div className="h-full" style={{ width: `${progressPercent}%`, backgroundColor: COLORS.PRIMARY }} />
          </div>
          <span>{progressPercent}%</span>
        </div>
        <div className="mt-2">
          <Link
            href={readHref}
            className="inline-flex items-center min-h-12 px-7 text-[15px] font-bold interactive-btn"
            style={{ backgroundColor: COLORS.PRIMARY, color: COLORS.SURFACE }}
          >
            続きを読む
          </Link>
        </div>
      </div>
    </section>
  );
}
