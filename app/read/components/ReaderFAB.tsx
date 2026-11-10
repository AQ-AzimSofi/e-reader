'use client';

import { useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { COLORS, DARK_COLORS } from '@/lib/constants';
import { toTint } from '@/lib/utils/colorTint';

interface ReaderFABProps {
  onToggleFurigana: () => void;
  onToggleRephrase: () => void;
  onOpenSettings: () => void;
  onGoToBookmark?: () => void;
  onCopyPageText: () => void;
  onCopyPageRange: () => void;
  onToggleDarkMode: () => void;
  onToggleRubyLookup: () => void;
  onPrioritize: () => void;
  isPrioritizing?: boolean;
  hasPriority?: boolean;
  isFuriganaEnabled: boolean;
  showRephrase: boolean;
  isDarkMode: boolean;
  hasBookmark: boolean;
  bookmarkPage?: number | null;
  currentPage?: number;
  copyFeedback: boolean;
}

interface FabMenuButton {
  icon: ReactNode;
  label: string;
  action: () => void;
  active?: boolean;
  hidden?: boolean;
  keepOpen?: boolean;
  beta?: boolean;
}

const STORAGE_KEY = 'fab_position';
const FAB_SIZE = 52;
const MENU_MARGIN = 10;

interface Position {
  x: number;
  y: number;
}

function getInitialPosition(): Position {
  if (typeof window === 'undefined') {
    return { x: 20, y: 80 };
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const pos = JSON.parse(stored);
      return {
        x: Math.min(Math.max(0, pos.x), window.innerWidth - FAB_SIZE),
        y: Math.min(Math.max(0, pos.y), window.innerHeight - FAB_SIZE),
      };
    }
  } catch {}

  return {
    x: window.innerWidth - FAB_SIZE - 20,
    y: window.innerHeight - FAB_SIZE - 80,
  };
}

export default function ReaderFAB({
  onToggleFurigana,
  onToggleRephrase,
  onOpenSettings,
  onGoToBookmark,
  onCopyPageText,
  onCopyPageRange,
  onToggleDarkMode,
  onToggleRubyLookup,
  onPrioritize,
  isPrioritizing,
  hasPriority,
  isFuriganaEnabled,
  showRephrase,
  isDarkMode,
  hasBookmark,
  bookmarkPage,
  currentPage,
  copyFeedback,
}: ReaderFABProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 20, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [mounted, setMounted] = useState(false);

  const dragRef = useRef<{
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    hasMoved: boolean;
  } | null>(null);

  const justDraggedRef = useRef(false);
  const fabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setPosition(getInitialPosition());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !isDragging) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
      } catch {}
    }
  }, [position, isDragging, mounted]);

  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      initialX: position.x,
      initialY: position.y,
      hasMoved: false,
    };
    setIsDragging(true);
  }, [position]);

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!dragRef.current) return;

    const deltaX = clientX - dragRef.current.startX;
    const deltaY = clientY - dragRef.current.startY;

    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      dragRef.current.hasMoved = true;
    }

    if (dragRef.current.hasMoved) {
      const newX = Math.min(
        Math.max(0, dragRef.current.initialX + deltaX),
        window.innerWidth - FAB_SIZE
      );
      const newY = Math.min(
        Math.max(0, dragRef.current.initialY + deltaY),
        window.innerHeight - FAB_SIZE
      );

      setPosition({ x: newX, y: newY });
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    const wasDragging = dragRef.current?.hasMoved;
    dragRef.current = null;
    setIsDragging(false);

    if (wasDragging) {
      justDraggedRef.current = true;
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 100);
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    handleDragStart(e.clientX, e.clientY);
  }, [handleDragStart]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleDragMove(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      handleDragEnd();
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleDragMove, handleDragEnd]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  }, [handleDragStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    handleDragMove(touch.clientX, touch.clientY);
  }, [handleDragMove]);

  const handleTouchEnd = useCallback(() => {
    handleDragEnd();
  }, [handleDragEnd]);

  const handleFabClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current?.hasMoved || justDraggedRef.current) return;
    setIsExpanded(prev => !prev);
  }, []);

  const handleAction = useCallback((action: () => void, keepOpen?: boolean) => {
    action();
    if (!keepOpen) {
      setIsExpanded(false);
    }
  }, []);

  const getMenuPosition = useCallback(() => {
    if (typeof window === 'undefined') return { bottom: '64px', right: '0' };

    const isNearBottom = position.y > window.innerHeight / 2;
    const isNearRight = position.x > window.innerWidth / 2;

    return {
      ...(isNearBottom ? { bottom: `${FAB_SIZE + MENU_MARGIN}px` } : { top: `${FAB_SIZE + MENU_MARGIN}px` }),
      ...(isNearRight ? { right: '0' } : { left: '0' }),
    };
  }, [position]);

  const isOnBookmarkPage = hasBookmark && currentPage === bookmarkPage;

  const fabButtons: FabMenuButton[] = [
    {
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
        </svg>
      ),
      label: isOnBookmarkPage ? '栞の位置へ' : `栞のページへ (p.${bookmarkPage})`,
      action: onGoToBookmark || (() => {}),
      active: isOnBookmarkPage,
      hidden: !hasBookmark || !onGoToBookmark,
    },
    {
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
      label: copyFeedback ? 'コピーしました' : 'ページをコピー',
      action: onCopyPageText,
      active: copyFeedback,
      keepOpen: true,
    },
    {
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" />
        </svg>
      ),
      label: '範囲をコピー',
      action: onCopyPageRange,
    },
    {
      icon: isPrioritizing ? (
        <span
          className="w-[16px] h-[16px] animate-spin"
          style={{ borderWidth: 2, borderStyle: 'solid', borderColor: 'currentColor', borderTopColor: 'transparent', borderRadius: '50%' }}
        />
      ) : (
        <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
          <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
        </svg>
      ),
      label: hasPriority ? '重要度を消す' : isPrioritizing ? '分析中…' : '重要度を分析',
      action: onPrioritize,
      active: Boolean(hasPriority),
      beta: true,
    },
    {
      icon: <span className="text-xs font-semibold">R</span>,
      label: showRephrase ? 'やさしい文を隠す' : 'やさしい文を表示',
      action: onToggleRephrase,
      active: showRephrase,
    },
    {
      icon: (
        <span className="text-xs font-semibold" style={{ fontFamily: 'serif' }}>
          {'\u3042'}
        </span>
      ),
      label: 'ふりがな',
      action: onToggleFurigana,
      active: isFuriganaEnabled,
    },
    {
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      label: 'ルビ検索',
      action: onToggleRubyLookup,
    },
    {
      icon: isDarkMode ? (
        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ) : (
        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      ),
      label: isDarkMode ? 'ライトモード' : 'ダークモード',
      action: onToggleDarkMode,
      active: isDarkMode,
    },
    {
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
      ),
      label: '表示設定',
      action: onOpenSettings,
    },
  ];

  const visibleButtons = fabButtons.filter(btn => !btn.hidden);
  const menuStyle = getMenuPosition();
  const isMenuAbove = 'bottom' in menuStyle;

  if (!mounted) return null;

  const surfaceBg = isDarkMode ? DARK_COLORS.SURFACE : COLORS.SURFACE;
  const textColor = isDarkMode ? DARK_COLORS.TEXT : COLORS.INK;
  const ruleColor = isDarkMode ? DARK_COLORS.NEUTRAL : COLORS.NEUTRAL;
  const activeColor = isDarkMode ? DARK_COLORS.PRIMARY : COLORS.PRIMARY;
  const activeBg = toTint(activeColor, 12);

  return (
    <>
      {isExpanded && (
        <div
          className="fixed inset-0 z-[9998]"
          onClick={() => setIsExpanded(false)}
          style={{ backgroundColor: isDarkMode ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)' }}
        />
      )}

      <div
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 9999,
          touchAction: 'none',
        }}
      >
        <div className="relative">
          {isExpanded && (
            <div
              className="absolute"
              style={{
                ...menuStyle,
                display: 'flex',
                flexDirection: isMenuAbove ? 'column-reverse' : 'column',
              }}
            >
              <div
                style={{
                  backgroundColor: surfaceBg,
                  border: `1px solid ${textColor}`,
                  boxShadow: isDarkMode
                    ? '0 8px 32px rgba(0,0,0,0.5)'
                    : '0 8px 32px rgba(0,0,0,0.12)',
                  overflow: 'hidden',
                  minWidth: '180px',
                  animation: 'fab-menu-enter 200ms ease-out',
                }}
              >
                {visibleButtons.map((btn, index) => (
                  <button
                    key={index}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAction(btn.action, btn.keepOpen);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 font-gothic interactive-nav-btn"
                    style={{
                      backgroundColor: btn.active ? activeBg : 'transparent',
                      color: btn.active ? activeColor : textColor,
                      borderBottom: index < visibleButtons.length - 1 ? `1px solid ${ruleColor}` : 'none',
                    }}
                  >
                    <span className="flex items-center justify-center w-5 h-5 flex-shrink-0">
                      {btn.icon}
                    </span>
                    <span className="text-[13px] font-medium whitespace-nowrap">{btn.label}</span>
                    {btn.beta && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5"
                        style={{ backgroundColor: COLORS.START_CURSOR, color: COLORS.SURFACE, letterSpacing: '0.5px' }}
                      >
                        BETA
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            ref={fabRef}
            onMouseDown={handleMouseDown}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onClick={handleFabClick}
            aria-label="読書メニュー"
            aria-expanded={isExpanded}
            className="relative select-none flex items-center justify-center"
            style={{
              width: `${FAB_SIZE}px`,
              height: `${FAB_SIZE}px`,
              backgroundColor: textColor,
              color: isDarkMode ? DARK_COLORS.BASE : COLORS.SURFACE,
              border: 'none',
              boxShadow: isDragging
                ? (isDarkMode ? '0 8px 32px rgba(0,0,0,0.6)' : '0 8px 32px rgba(0,0,0,0.18)')
                : (isDarkMode ? '0 2px 16px rgba(0,0,0,0.4)' : '0 2px 16px rgba(0,0,0,0.1)'),
              cursor: isDragging ? 'grabbing' : 'grab',
              transition: isDragging ? 'none' : 'color 200ms, box-shadow 200ms, transform 200ms',
              transform: isDragging ? 'scale(1.06)' : 'scale(1)',
            }}
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              style={{
                transition: 'transform 200ms ease-out',
                transform: isExpanded ? 'rotate(45deg)' : 'rotate(0deg)',
              }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fab-menu-enter {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(4px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </>
  );
}
