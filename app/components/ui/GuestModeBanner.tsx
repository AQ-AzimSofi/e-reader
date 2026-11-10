'use client';

import Link from 'next/link';
import { COLORS, DARK_COLORS } from '@/lib/constants';
import { toTint } from '@/lib/utils/colorTint';

interface GuestModeBannerProps {
  message?: string;
  isDarkMode?: boolean;
}

export default function GuestModeBanner({ message, isDarkMode = false }: GuestModeBannerProps) {
  const theme = isDarkMode
    ? {
        bg: toTint(DARK_COLORS.PRIMARY, 12),
        border: DARK_COLORS.PRIMARY,
        text: DARK_COLORS.TEXT,
        chipBg: DARK_COLORS.PRIMARY,
        chipText: DARK_COLORS.BASE,
        link: DARK_COLORS.PRIMARY,
      }
    : {
        bg: toTint(COLORS.PRIMARY, 8),
        border: COLORS.PRIMARY,
        text: COLORS.SECONDARY_DARK,
        chipBg: COLORS.PRIMARY,
        chipText: COLORS.SURFACE,
        link: COLORS.PRIMARY,
      };

  return (
    <div style={{ backgroundColor: theme.bg, borderBottom: `1px solid ${theme.border}` }}>
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm" style={{ color: theme.text }}>
          <span
            className="px-2 py-0.5 text-xs font-bold whitespace-nowrap"
            style={{ backgroundColor: theme.chipBg, color: theme.chipText }}
          >
            Guest mode
          </span>
          <span>
            {message || 'You are reading a free preview. Sign in for the full library.'}
          </span>
        </div>
        <Link
          href="/login"
          className="text-sm font-bold whitespace-nowrap underline underline-offset-4 interactive-link"
          style={{ color: theme.link }}
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
