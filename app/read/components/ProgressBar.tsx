'use client';

import { COLORS, DARK_COLORS } from '@/lib/constants';

interface ProgressBarProps {
  progress: number;
  isDarkMode?: boolean;
  visible?: boolean;
}

export default function ProgressBar({
  progress,
  isDarkMode = false,
  visible = true,
}: ProgressBarProps) {
  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50">

      <div className="h-0.5 w-full">
        <div
          className="h-full transition-all duration-300"
          style={{
            width: `${Math.min(100, Math.max(0, progress))}%`,
            backgroundColor: isDarkMode ? DARK_COLORS.PRIMARY : COLORS.PRIMARY,
            transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>
    </div>
  );
}
