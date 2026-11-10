'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { COLORS, DARK_COLORS } from '@/lib/constants';
import { toTint } from '@/lib/utils/colorTint';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  height?: 'auto' | 'half' | 'full';
  isDarkMode?: boolean;
}

export default function BottomSheet({
  isOpen,
  onClose,
  children,
  title,
  height = 'auto',
  isDarkMode = false,
}: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<number>(0);
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      setTimeout(() => setAnimateIn(true), 0);
    } else {
      setAnimateIn(false);
      const timer = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartRef.current = e.touches[0].clientY;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const delta = e.touches[0].clientY - dragStartRef.current;
    if (delta > 0) setDragY(delta);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    if (dragY > 100) {
      onClose();
    }
    setDragY(0);
  }, [dragY, onClose]);

  if (!visible) return null;

  const heightClass = height === 'full'
    ? 'max-h-[92vh]'
    : height === 'half'
    ? 'max-h-[50vh]'
    : 'max-h-[85vh]';

  const surfaceColor = isDarkMode ? DARK_COLORS.SURFACE : COLORS.SURFACE;
  const textColor = isDarkMode ? DARK_COLORS.TEXT : COLORS.INK;
  const mutedColor = isDarkMode ? DARK_COLORS.TEXT_MUTED : COLORS.SECONDARY;
  const ruleColor = isDarkMode ? DARK_COLORS.NEUTRAL : COLORS.NEUTRAL;

  return (
    <>
      <div
        className="fixed inset-0 z-[100] transition-colors duration-300"
        style={{
          backgroundColor: animateIn ? toTint(COLORS.INK, 30) : 'transparent',
        }}
        onClick={onClose}
      />

      <div
        ref={sheetRef}
        className={`fixed bottom-0 left-0 right-0 z-[101] ${heightClass} overflow-y-auto transition-transform duration-300${isDarkMode ? ' dark-sheet' : ''}`}
        style={{
          backgroundColor: surfaceColor,
          color: textColor,
          borderTop: `1px solid ${textColor}`,
          transform: animateIn
            ? `translateY(${dragY}px)`
            : 'translateY(100%)',
          transitionTimingFunction: isDragging ? 'linear' : 'cubic-bezier(0.32, 0.72, 0, 1)',
          transitionDuration: isDragging ? '0ms' : '300ms',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 pt-2 pb-0" style={{ backgroundColor: surfaceColor }}>
          <div className="flex justify-center mb-2">
            <div className="w-9 h-0.5" style={{ backgroundColor: ruleColor }} />
          </div>

          {title && (
            <div className="flex items-center justify-between px-5 pb-3" style={{ borderBottom: `1px solid ${ruleColor}` }}>
              <h2 className="font-mincho font-bold text-lg tracking-[0.04em]" style={{ color: textColor }}>{title}</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center interactive-close"
                style={{ backgroundColor: 'transparent', color: mutedColor }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>

        <div className="px-5 py-4 pb-8">
          {children}
        </div>
      </div>
    </>
  );
}
