'use client';

import Link from 'next/link';
import { COLORS } from '@/lib/constants';
import { formatBookTitle } from '@/lib/utils/bookTitle';
import BookCover from './BookCover';

interface BookCardProps {
  fileName: string;
  directory: string;
  progress: number;
  totalCharacters?: number;
  directoryTag: string;
  bookmarkPage?: number | null;
  isPreview?: boolean;
}

export default function BookCard({
  fileName,
  directory,
  progress,
  totalCharacters,
  directoryTag,
  bookmarkPage,
  isPreview,
}: BookCardProps) {
  const title = formatBookTitle(fileName);
  const bookParams = `directory=${encodeURIComponent(directory)}&fileName=${encodeURIComponent(fileName)}`;
  const pageParam = bookmarkPage && bookmarkPage > 1 ? `&page=${bookmarkPage}` : '';
  const progressPercent = Math.round(Math.min(100, Math.max(0, progress)));
  const characterCount = totalCharacters ?? 0;
  const shelfNote = characterCount > 0
    ? `${directoryTag} ・ ${characterCount.toLocaleString()}字`
    : directoryTag;

  return (
    <Link href={`/read?${bookParams}${pageParam}`} className="group block">
      <div className="relative">
        <BookCover fileName={fileName} directory={directory} title={title} size="card" />
        {isPreview && (
          <span
            className="absolute top-2 left-2 px-2 py-0.5 text-xs font-bold"
            style={{ backgroundColor: COLORS.INK, color: COLORS.SURFACE }}
          >
            Preview
          </span>
        )}
      </div>

      <h3
        className="mt-2.5 font-mincho font-medium text-[15px] leading-normal line-clamp-2 group-hover:underline"
        style={{ color: COLORS.INK }}
      >
        {title}
      </h3>

      <div className="mt-2 flex items-center gap-2.5 text-xs" style={{ color: COLORS.SECONDARY }}>
        <div className="flex-1 h-0.5" style={{ backgroundColor: COLORS.NEUTRAL }}>
          <div
            className="h-full"
            style={{
              width: `${progressPercent}%`,
              backgroundColor: COLORS.INK,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
        <span>{progressPercent === 100 ? '読了' : `${progressPercent}%`}</span>
      </div>

      <p className="mt-1 text-xs truncate" style={{ color: COLORS.SECONDARY }}>
        {shelfNote}
      </p>
    </Link>
  );
}
