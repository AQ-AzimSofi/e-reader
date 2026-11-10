'use client';

import { useState, useEffect } from 'react';
import { COLORS, DARK_COLORS } from '@/lib/constants';
import { toTint } from '@/lib/utils/colorTint';

interface CopyRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCopy: (fromPage: number, toPage: number) => void;
  currentPage: number;
  totalPages: number;
  isDarkMode: boolean;
  copyFeedback: boolean;
}

export default function CopyRangeModal({
  isOpen,
  onClose,
  onCopy,
  currentPage,
  totalPages,
  isDarkMode,
  copyFeedback,
}: CopyRangeModalProps) {
  const [fromPage, setFromPage] = useState(currentPage);
  const [toPage, setToPage] = useState(currentPage);

  useEffect(() => {
    if (isOpen) {
      setFromPage(currentPage);
      setToPage(Math.min(currentPage + 4, totalPages));
    }
  }, [isOpen, currentPage, totalPages]);

  const isValid = fromPage >= 1 && toPage >= fromPage && toPage <= totalPages;

  if (!isOpen) return null;

  const surfaceBg = isDarkMode ? DARK_COLORS.SURFACE : COLORS.SURFACE;
  const textColor = isDarkMode ? DARK_COLORS.TEXT : COLORS.INK;
  const mutedColor = isDarkMode ? DARK_COLORS.TEXT_MUTED : COLORS.SECONDARY;
  const inputBg = isDarkMode ? DARK_COLORS.BASE : COLORS.SURFACE;
  const borderColor = isDarkMode ? DARK_COLORS.NEUTRAL : COLORS.NEUTRAL;
  const accentColor = isDarkMode ? DARK_COLORS.PRIMARY : COLORS.PRIMARY;
  const onAccentColor = isDarkMode ? DARK_COLORS.BASE : COLORS.SURFACE;

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center"
      onClick={onClose}
      style={{ backgroundColor: toTint(COLORS.INK, isDarkMode ? 60 : 30) }}
    >
      <div
        className="p-5 w-[280px]"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: surfaceBg,
          border: `1px solid ${textColor}`,
        }}
      >
        <h3
          className="font-mincho font-bold text-[17px] tracking-[0.04em] mb-4"
          style={{ color: textColor }}
        >
          Copy Page Range
        </h3>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1">
            <label
              className="text-[11px] font-medium mb-1 block"
              style={{ color: mutedColor }}
            >
              From
            </label>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={fromPage}
              onChange={(e) => setFromPage(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 text-[14px] text-center focus:outline-2"
              style={{
                backgroundColor: inputBg,
                color: textColor,
                border: `1px solid ${borderColor}`,
                outlineColor: accentColor,
              }}
            />
          </div>
          <span
            className="text-[13px] mt-4"
            style={{ color: mutedColor }}
          >
            -
          </span>
          <div className="flex-1">
            <label
              className="text-[11px] font-medium mb-1 block"
              style={{ color: mutedColor }}
            >
              To
            </label>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={toPage}
              onChange={(e) => setToPage(Math.min(totalPages, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 text-[14px] text-center focus:outline-2"
              style={{
                backgroundColor: inputBg,
                color: textColor,
                border: `1px solid ${borderColor}`,
                outlineColor: accentColor,
              }}
            />
          </div>
        </div>

        <p
          className="text-[11px] mb-4"
          style={{ color: mutedColor }}
        >
          {isValid ? `${toPage - fromPage + 1} page(s)` : 'Invalid range'}
        </p>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 min-h-11 px-3 text-sm font-bold interactive-page-btn"
            style={{
              backgroundColor: 'transparent',
              border: `1px solid ${borderColor}`,
              color: textColor,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => isValid && onCopy(fromPage, toPage)}
            disabled={!isValid}
            className="flex-1 min-h-11 px-3 text-sm font-bold disabled:opacity-30 interactive-btn"
            style={{
              backgroundColor: copyFeedback ? COLORS.SUCCESS : accentColor,
              color: copyFeedback ? COLORS.SURFACE : onAccentColor,
            }}
          >
            {copyFeedback ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>
    </div>
  );
}
