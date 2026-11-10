'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { COLORS } from '@/lib/constants';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/library');
  }, [router]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: COLORS.BASE }}
    >
      <div
        className="w-8 h-8 border-2 rounded-full animate-spin"
        style={{
          borderColor: COLORS.NEUTRAL,
          borderTopColor: COLORS.INK,
        }}
      />
    </div>
  );
}
