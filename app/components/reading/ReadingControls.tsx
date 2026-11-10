'use client';

import * as React from 'react';
import { COLORS, READER_CONFIG } from '@/lib/constants';

interface ReadingControlsProps {
  fontSize: number;
  lineHeight: number;
  onFontSizeChange: (size: number) => void;
  onLineHeightChange: (height: number) => void;
}

export default function ReadingControls({
  fontSize,
  lineHeight,
  onFontSizeChange,
  onLineHeightChange,
}: ReadingControlsProps) {
  return (
    <div
      className="border p-4 space-y-4"
      style={{
        backgroundColor: COLORS.SURFACE,
        borderColor: COLORS.NEUTRAL,
      }}
    >
      <h3 className="text-sm font-mincho font-bold" style={{ color: COLORS.INK }}>
        読書設定
      </h3>

      {/* フォントサイズ */}
      <div>
        <label className="block text-xs font-medium mb-2" style={{ color: COLORS.SECONDARY_DARK }}>
          フォントサイズ: {fontSize}px
        </label>
        <input
          type="range"
          min={READER_CONFIG.MIN_FONT_SIZE}
          max={READER_CONFIG.MAX_FONT_SIZE}
          value={fontSize}
          onChange={(e) => onFontSizeChange(parseInt(e.target.value, 10))}
          className="w-full h-2 appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${COLORS.PRIMARY} 0%, ${COLORS.PRIMARY} ${
              ((fontSize - READER_CONFIG.MIN_FONT_SIZE) /
                (READER_CONFIG.MAX_FONT_SIZE - READER_CONFIG.MIN_FONT_SIZE)) *
              100
            }%, ${COLORS.NEUTRAL} ${
              ((fontSize - READER_CONFIG.MIN_FONT_SIZE) /
                (READER_CONFIG.MAX_FONT_SIZE - READER_CONFIG.MIN_FONT_SIZE)) *
              100
            }%, ${COLORS.NEUTRAL} 100%)`,
          }}
        />
        <div className="flex justify-between text-xs mt-1" style={{ color: COLORS.SECONDARY }}>
          <span>{READER_CONFIG.MIN_FONT_SIZE}px</span>
          <span>{READER_CONFIG.MAX_FONT_SIZE}px</span>
        </div>
      </div>

      {/* 行間 */}
      <div>
        <label className="block text-xs font-medium mb-2" style={{ color: COLORS.SECONDARY_DARK }}>
          行間: {lineHeight.toFixed(1)}
        </label>
        <input
          type="range"
          min={READER_CONFIG.MIN_LINE_HEIGHT * 10}
          max={READER_CONFIG.MAX_LINE_HEIGHT * 10}
          value={lineHeight * 10}
          onChange={(e) => onLineHeightChange(parseInt(e.target.value, 10) / 10)}
          step="1"
          className="w-full h-2 appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${COLORS.PRIMARY} 0%, ${COLORS.PRIMARY} ${
              ((lineHeight - READER_CONFIG.MIN_LINE_HEIGHT) /
                (READER_CONFIG.MAX_LINE_HEIGHT - READER_CONFIG.MIN_LINE_HEIGHT)) *
              100
            }%, ${COLORS.NEUTRAL} ${
              ((lineHeight - READER_CONFIG.MIN_LINE_HEIGHT) /
                (READER_CONFIG.MAX_LINE_HEIGHT - READER_CONFIG.MIN_LINE_HEIGHT)) *
              100
            }%, ${COLORS.NEUTRAL} 100%)`,
          }}
        />
        <div className="flex justify-between text-xs mt-1" style={{ color: COLORS.SECONDARY }}>
          <span>{READER_CONFIG.MIN_LINE_HEIGHT}</span>
          <span>{READER_CONFIG.MAX_LINE_HEIGHT}</span>
        </div>
      </div>
    </div>
  );
}
