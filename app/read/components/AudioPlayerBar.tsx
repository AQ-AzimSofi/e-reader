'use client';

import { useEffect, useRef, useState } from 'react';
import { COLORS, DARK_COLORS, READER_THEME, TTS_CONFIG } from '@/lib/constants';
import type { AudioBookContentMode } from '@/lib/types';
import type { AudioBookStatus } from '@/app/hooks/useAudioBook';

const CONTENT_MODES: { value: AudioBookContentMode; label: string }[] = [
  { value: 'main', label: '原文' },
  { value: 'sub', label: 'やさしく' },
  { value: 'both', label: '両方' },
];

interface AudioPlayerBarProps {
  status: AudioBookStatus;
  index: number;
  total: number;
  contentMode: AudioBookContentMode;
  speed: number;
  isDarkMode: boolean;
  keyboardMode: boolean;
  hasNarration: boolean;
  playbackError: string | null;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onReplay: () => void;
  onContentModeChange: (mode: AudioBookContentMode) => void;
  onSpeedChange: (speed: number) => void;
  onToggleKeyboardMode: () => void;
  onClose: () => void;
}

function PlayGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

function PrevGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="5" y="6" width="2.5" height="12" rx="1" />
      <path d="M20 6v12L9.5 12z" />
    </svg>
  );
}

function NextGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="16.5" y="6" width="2.5" height="12" rx="1" />
      <path d="M4 6v12l10.5-6z" />
    </svg>
  );
}

function ReplayGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
    </svg>
  );
}

function KeyboardGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" strokeLinecap="round" />
    </svg>
  );
}

export default function AudioPlayerBar({
  status,
  index,
  total,
  contentMode,
  speed,
  isDarkMode,
  keyboardMode,
  hasNarration,
  playbackError,
  onTogglePlay,
  onPrev,
  onNext,
  onReplay,
  onContentModeChange,
  onSpeedChange,
  onToggleKeyboardMode,
  onClose,
}: AudioPlayerBarProps) {
  const surface = isDarkMode ? DARK_COLORS.SURFACE : READER_THEME.SURFACE;
  const textColor = isDarkMode ? DARK_COLORS.TEXT : COLORS.INK;
  const subtle = isDarkMode ? DARK_COLORS.TEXT_MUTED : COLORS.SECONDARY;
  const accent = isDarkMode ? DARK_COLORS.PRIMARY : READER_THEME.PROGRESS_FILL;
  const trackColor = isDarkMode ? DARK_COLORS.NEUTRAL : READER_THEME.PROGRESS_TRACK;
  const ruleColor = isDarkMode ? DARK_COLORS.NEUTRAL : COLORS.NEUTRAL;
  const onInkColor = isDarkMode ? DARK_COLORS.BASE : COLORS.SURFACE;

  const position = total > 0 ? Math.min(total, Math.max(0, index + 1)) : 0;
  const progressPercent = total > 0 ? (position / total) * 100 : 0;
  const isPlaying = status === 'playing';
  const isLoading = status === 'loading';

  const [speedOpen, setSpeedOpen] = useState(false);
  const speedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!speedOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (speedRef.current?.contains(event.target as Node)) return;
      setSpeedOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [speedOpen]);

  const ghostButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    color: textColor,
    borderRadius: 2,
    width: 40,
    height: 40,
    flexShrink: 0,
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        backgroundColor: surface,
        borderTop: `1px solid ${textColor}`,
      }}
    >
      <div style={{ position: 'relative', height: 2, backgroundColor: trackColor }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${progressPercent}%`,
            backgroundColor: accent,
            transition: 'width 200ms ease',
          }}
        />
      </div>

      <div
        className="max-w-3xl mx-auto px-4"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 12,
          paddingTop: 10,
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button style={ghostButtonStyle} onClick={onPrev} aria-label="前の文">
            <PrevGlyph />
          </button>
          <button
            onClick={onTogglePlay}
            aria-label={isPlaying ? '一時停止' : '再生'}
            style={{
              ...ghostButtonStyle,
              width: 48,
              height: 48,
              backgroundColor: textColor,
              color: onInkColor,
            }}
          >
            {isLoading ? (
              <span
                className="animate-spin"
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  borderWidth: 2,
                  borderStyle: 'solid',
                  borderColor: subtle,
                  borderTopColor: onInkColor,
                }}
              />
            ) : isPlaying ? (
              <PauseGlyph />
            ) : (
              <PlayGlyph />
            )}
          </button>
          <button style={ghostButtonStyle} onClick={onNext} aria-label="次の文">
            <NextGlyph />
          </button>
          <button style={ghostButtonStyle} onClick={onReplay} aria-label="この文をもう一度" title="この文をもう一度">
            <ReplayGlyph />
          </button>
        </div>

        <div
          style={{
            display: 'inline-flex',
            border: `1px solid ${ruleColor}`,
          }}
        >
          {CONTENT_MODES.map((mode) => {
            const active = mode.value === contentMode;
            return (
              <button
                key={mode.value}
                onClick={() => onContentModeChange(mode.value)}
                style={{
                  padding: '6px 12px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: active ? 700 : 400,
                  backgroundColor: active ? textColor : 'transparent',
                  color: active ? onInkColor : subtle,
                }}
              >
                {mode.label}
              </button>
            );
          })}
        </div>

        {playbackError ? (
          <span
            role="status"
            style={{
              fontSize: 12,
              fontWeight: 600,
              padding: '4px 9px',
              color: COLORS.SURFACE,
              backgroundColor: COLORS.DANGER,
            }}
          >
            {playbackError}
          </span>
        ) : hasNarration && contentMode !== 'sub' && (
          <span
            title="オーディオブックの朗読を再生しています。やさしい文は音声合成のままです。"
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '3px 9px',
              color: accent,
              border: `1px solid ${accent}`,
            }}
          >
            朗読
          </span>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <span style={{ fontSize: 13, color: subtle, fontVariantNumeric: 'tabular-nums', minWidth: 64, textAlign: 'right' }}>
            {position} / {total}
          </span>
          <div ref={speedRef} style={{ position: 'relative', display: 'flex' }}>
            <button
              onClick={() => setSpeedOpen((open) => !open)}
              aria-label="再生速度"
              aria-expanded={speedOpen}
              style={{
                border: 'none',
                background: speedOpen ? trackColor : 'none',
                cursor: 'pointer',
                color: textColor,
                fontSize: 13,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
                padding: '6px 8px',
                minWidth: 46,
              }}
            >
              {speed.toFixed(2)}x
            </button>
            {speedOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  right: 0,
                  marginBottom: 10,
                  padding: '12px 14px',
                  backgroundColor: surface,
                  border: `1px solid ${textColor}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <input
                  type="range"
                  min={TTS_CONFIG.MIN_SPEED}
                  max={TTS_CONFIG.MAX_SPEED}
                  step={TTS_CONFIG.SPEED_STEP}
                  value={speed}
                  onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
                  aria-label="再生速度"
                  style={{ width: 140, accentColor: accent, cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: textColor, fontVariantNumeric: 'tabular-nums' }}>
                  {speed.toFixed(2)}x
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onToggleKeyboardMode}
            aria-label="キーボード操作モード"
            aria-pressed={keyboardMode}
            style={{
              ...ghostButtonStyle,
              width: 36,
              height: 36,
              color: keyboardMode ? onInkColor : subtle,
              backgroundColor: keyboardMode ? textColor : 'transparent',
            }}
          >
            <KeyboardGlyph />
          </button>
          <button
            onClick={onClose}
            aria-label="プレーヤーを閉じる"
            style={{ ...ghostButtonStyle, width: 36, height: 36, color: subtle }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
