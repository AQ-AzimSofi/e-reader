'use client';

import { useTTS } from '@/app/hooks/useTTS';
import SpeakerIcon from '@/app/components/icons/SpeakerIcon';
import { COLORS } from '@/lib/constants';
import { toTint } from '@/lib/utils/colorTint';
import { useRef, useCallback } from 'react';

interface TTSButtonProps {
  text: string;
  className?: string;
  size?: 'sm' | 'md';
  /** 長押し時に呼ばれるコールバック（連続再生開始用） */
  onLongPress?: () => void;
}

const LONG_PRESS_DURATION = 700; // ミリ秒

/**
 * 個別テキスト再生ボタン
 * - クリック: 単一アイテム再生/一時停止
 * - 長押し(700ms): 連続再生モード開始（onLongPress）
 * - ダブルクリック: 停止
 */
export default function TTSButton({ text, className = '', size = 'sm', onLongPress }: TTSButtonProps) {
  const { isPlaying, isPaused, isLoading, play, pause, resume, stop } = useTTS();

  const longPressTimerRef = useRef<number | null>(null);
  const isLongPressRef = useRef(false);

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handlePointerDown = useCallback(() => {
    if (isLoading || !onLongPress) return;

    isLongPressRef.current = false;

    longPressTimerRef.current = window.setTimeout(() => {
      isLongPressRef.current = true;
      onLongPress();
    }, LONG_PRESS_DURATION);
  }, [isLoading, onLongPress]);

  const handlePointerUp = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handlePointerLeave = useCallback(() => {
    clearLongPressTimer();
  }, [clearLongPressTimer]);

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // 長押しが発動した場合はクリックを無視
    if (isLongPressRef.current) {
      isLongPressRef.current = false;
      return;
    }

    if (isLoading) return;

    if (isPlaying && !isPaused) {
      pause();
    } else if (isPaused) {
      resume();
    } else {
      await play(text);
    }
  }, [isLoading, isPlaying, isPaused, play, pause, resume, text]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    clearLongPressTimer();
    stop();
  }, [stop, clearLongPressTimer]);

  const sizeClasses = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';

  return (
    <button
      type="button"
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
      disabled={isLoading}
      className={`
        ${sizeClasses}
        flex items-center justify-center
        transition-colors duration-200
        ${isLoading ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
        ${className}
      `}
      style={{
        backgroundColor: isPlaying ? toTint(COLORS.PRIMARY, 12) : 'transparent',
        borderBottom: `2px solid ${isPlaying ? COLORS.PRIMARY : 'transparent'}`,
      }}
      title={
        isLoading
          ? '読み込み中...'
          : isPlaying
            ? isPaused
              ? '再開 (ダブルクリックで停止)'
              : '一時停止 (ダブルクリックで停止)'
            : onLongPress
              ? '読み上げる (長押しで連続再生)'
              : '読み上げる'
      }
    >
      <SpeakerIcon isPlaying={isPlaying && !isPaused} isLoading={isLoading} />
    </button>
  );
}
