'use client';

import { useState } from 'react';
import { API_ROUTES, COLORS } from '@/lib/constants';

type CoverState = 'loading' | 'loaded' | 'missing';
type CoverSize = 'card' | 'feature';

const SPINE_TITLE_CLASS: Record<CoverSize, string> = {
  card: 'p-3 text-[17px] tracking-[0.14em]',
  feature: 'p-5 text-[28px] tracking-[0.2em]',
};

interface BookCoverProps {
  fileName: string;
  directory: string;
  title: string;
  size: CoverSize;
}

export default function BookCover({ fileName, directory, title, size }: BookCoverProps) {
  const [coverState, setCoverState] = useState<CoverState>('loading');
  const coverUrl = `${API_ROUTES.BOOK_COVER}?directory=${encodeURIComponent(directory)}&fileName=${encodeURIComponent(fileName)}`;
  const isMissing = coverState === 'missing';

  return (
    <div
      className="relative aspect-[5/7] overflow-hidden"
      style={{ backgroundColor: isMissing ? COLORS.INK : COLORS.NEUTRAL_SOFT }}
    >
      {isMissing && (
        // The visible title lives next to the cover, so this spine lettering is decoration.
        <span
          aria-hidden="true"
          className={`absolute inset-0 font-mincho font-bold leading-normal ${SPINE_TITLE_CLASS[size]}`}
          style={{ writingMode: 'vertical-rl', color: COLORS.SURFACE }}
        >
          {title}
        </span>
      )}

      {!isMissing && (
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
    </div>
  );
}
