'use client';

import { useState } from 'react';
import Link from 'next/link';
import { API_ROUTES } from '@/lib/constants';

interface BookCardProps {
  fileName: string;
  directory: string;
  progress: number;
  totalCharacters?: number;
  directoryTag: string;
  bookmarkPage?: number | null;
  isPreview?: boolean;
}

type CoverState = 'loading' | 'loaded' | 'missing';

const FALLBACK_TITLE_CLASS =
  'absolute inset-0 flex items-center justify-center px-4 text-center font-semibold text-base leading-snug';

export default function BookCard({
  fileName,
  directory,
  progress,
  totalCharacters,
  directoryTag,
  bookmarkPage,
  isPreview,
}: BookCardProps) {
  const [coverState, setCoverState] = useState<CoverState>('loading');
  const displayName = fileName
    .replace(/-rephrase-furigana$/, '')
    .replace(/-rephrase$/, '')
    .replace(/-furigana$/, '')
    .replace(/-/g, ' ')
    .replace(/^\w/, c => c.toUpperCase());
  const bookParams = `directory=${encodeURIComponent(directory)}&fileName=${encodeURIComponent(fileName)}`;
  const pageParam = bookmarkPage && bookmarkPage > 1 ? `&page=${bookmarkPage}` : '';
  const readUrl = `/read?${bookParams}${pageParam}`;
  const coverUrl = `${API_ROUTES.BOOK_COVER}?${bookParams}`;
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <Link href={readUrl} className="block group">
      <div
        className="relative rounded-2xl overflow-hidden interactive-card"
        style={{
          backgroundColor: '#FFFFFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
        }}
      >
        <div className="relative aspect-[5/7]" style={{ backgroundColor: '#F2F2F7' }}>
          {/* The heading stays for screen readers when the cover shows, so books remain navigable by heading. */}
          <h3
            className={coverState === 'missing' ? FALLBACK_TITLE_CLASS : 'sr-only'}
            style={{ color: '#1D1D1F', backgroundColor: '#FFFFFF' }}
          >
            {displayName}
          </h3>

          {coverState !== 'missing' && (
            // next/image would route through the image optimizer function, which this
            // stack does not grant public invoke on (see sst.config.ts).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setCoverState('loaded')}
              onError={() => setCoverState('missing')}
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                opacity: coverState === 'loaded' ? 1 : 0,
                transition: 'opacity 0.3s ease',
              }}
            />
          )}

          <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-2">
            <span
              className="inline-block px-2 py-0.5 rounded-md text-xs font-medium"
              style={{
                backgroundColor: 'rgba(242, 242, 247, 0.92)',
                color: '#636366',
              }}
            >
              {directoryTag}
            </span>
            {isPreview && (
              <span
                className="inline-block px-2 py-0.5 rounded-md text-xs font-semibold"
                style={{ backgroundColor: '#FFE1A8', color: '#7A5A1E' }}
              >
                Preview
              </span>
            )}
          </div>
        </div>

        <div className="px-3 pt-2 pb-3">
          <div className="flex justify-between items-center mb-1.5" style={{ fontSize: '11px' }}>
            <span style={{ color: '#8E8E93' }}>
              {Math.round(clampedProgress)}%
            </span>
            {totalCharacters && (
              <span style={{ color: '#8E8E93' }}>
                {totalCharacters.toLocaleString()} chars
              </span>
            )}
          </div>
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ backgroundColor: '#E5E5EA' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${clampedProgress}%`,
                backgroundColor: '#007AFF',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
