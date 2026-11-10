'use client';

import { useState } from 'react';
import { COLORS, API_ROUTES, PAGE_ROUTES } from '@/lib/constants';
import { useGuestMode } from '@/app/hooks/useGuestMode';
import GuestModeBanner from '@/app/components/ui/GuestModeBanner';
import LibraryGrid from './components/LibraryGrid';
import DbSyncModal from './components/DbSyncModal';
import Link from 'next/link';

const NAV_ITEM_CLASS = 'py-3 cursor-pointer interactive-link';

export default function LibraryPage() {
  const [showSync, setShowSync] = useState(false);
  const { isGuest } = useGuestMode();

  const signOut = async () => {
    await fetch(API_ROUTES.AUTH_LOGOUT, { method: 'POST' });
    window.location.href = PAGE_ROUTES.LOGIN;
  };

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: COLORS.BASE, color: COLORS.INK }}
    >
      {isGuest && (
        <GuestModeBanner message="A few books are available as a free preview. Sign in for the full library." />
      )}

      <div className="max-w-[1120px] mx-auto px-5 sm:px-8 pb-14">
        <header
          className="flex flex-wrap items-center justify-between gap-x-10 gap-y-2 py-5 border-b"
          style={{ borderColor: COLORS.INK }}
        >
          <div className="flex items-baseline gap-3">
            <h1 className="font-mincho font-bold text-[28px] tracking-[0.04em]">よみサポ</h1>
            <span className="text-xs tracking-[0.18em]" style={{ color: COLORS.SECONDARY }}>
              YOMI-SAPO
            </span>
          </div>

          <nav
            aria-label="メイン"
            className={`flex-wrap items-center gap-x-7 text-[15px] ${isGuest ? 'hidden' : 'flex'}`}
          >
            <span
              aria-current="page"
              className="py-3 font-bold border-b-2"
              style={{ borderColor: COLORS.PRIMARY }}
            >
              本棚
            </span>
            <Link href={PAGE_ROUTES.VOCABULARY} className={NAV_ITEM_CLASS}>
              単語帳
            </Link>
            <Link href={PAGE_ROUTES.VISUAL_NOVEL} className={NAV_ITEM_CLASS}>
              ビジュアルノベル
            </Link>
            <Link href={PAGE_ROUTES.TEXT_INPUT_AI} className={NAV_ITEM_CLASS}>
              テキスト追加
            </Link>
            <button onClick={() => setShowSync(true)} className={NAV_ITEM_CLASS}>
              同期
            </button>
            <button onClick={signOut} className={NAV_ITEM_CLASS} style={{ color: COLORS.SECONDARY }}>
              ログアウト
            </button>
          </nav>
        </header>

        <main>
          <LibraryGrid />
        </main>
      </div>

      {showSync && <DbSyncModal onClose={() => setShowSync(false)} />}
    </div>
  );
}
