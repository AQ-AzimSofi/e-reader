'use client';

import { useEffect, useState, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  READER_THEME,
  COLORS,
  DARK_COLORS,
  READER_CONFIG,
  STORAGE_KEYS,
  PAGINATION_CONFIG,
  API_ROUTES,
  type PriorityScore,
} from '@/lib/constants';
import ProgressBar from './components/ProgressBar';
import ReaderFAB from './components/ReaderFAB';
import CopyRangeModal from './components/CopyRangeModal';
import ReaderSettings from './components/ReaderSettings';
import ReadingContent from './components/ReadingContent';
import ReaderHeader from './components/ReaderHeader';
import BottomSheet from '@/app/components/ui/BottomSheet';
import { useBookMetadata } from '@/app/hooks/useBookMetadata';
import { useGuestMode } from '@/app/hooks/useGuestMode';
import GuestModeBanner from '@/app/components/ui/GuestModeBanner';
import { stripFurigana } from '@/lib/utils/furiganaParser';
import { buildPlayableUnits } from '@/lib/utils/buildPlayableUnits';
import { guestKeyHeaders, promptGuestKeyOnFailure } from '@/lib/guestKeys';
import { useAudioBook } from '@/app/hooks/useAudioBook';
import { useNarration } from '@/app/hooks/useNarration';
import type { AudioBookContentMode } from '@/lib/types';

const ExplanationSidebar = dynamic(
  () => import('@/app/components/reading/ExplanationSidebar'),
  { ssr: false }
);

const RubyLookupSidebar = dynamic(
  () => import('@/app/components/reading/RubyLookupSidebar'),
  { ssr: false }
);

const FloatingStickyNotes = dynamic(
  () => import('./components/FloatingStickyNotes'),
  { ssr: false }
);

const AudioPlayerBar = dynamic(
  () => import('./components/AudioPlayerBar'),
  { ssr: false }
);

const GuestApiKeyModal = dynamic(
  () => import('@/app/components/reading/GuestApiKeyModal'),
  { ssr: false }
);

const PRIORITIZE_ERROR_MESSAGE = 'このページを分析できませんでした。もう一度お試しください。';

function SearchParamsReader({
  children,
}: {
  children: (params: { directory: string | null; fileName: string | null; page: number; hasExplicitPage: boolean }) => React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const directory = searchParams.get('directory');
  const fileName = searchParams.get('fileName');
  const hasExplicitPage = searchParams.has('page');
  const page = parseInt(searchParams.get('page') || '1', 10);

  return <>{children({ directory, fileName, page, hasExplicitPage })}</>;
}

function ReaderContent({
  directoryParam,
  fileNameParam,
  pageParam,
  hasExplicitPage,
}: {
  directoryParam: string | null;
  fileNameParam: string | null;
  pageParam: number;
  hasExplicitPage: boolean;
}) {
  const router = useRouter();

  const [content, setContent] = useState<string>('');
  const [bookmarkText, setBookmarkText] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showFurigana, setShowFurigana] = useState(false);
  const [fontSize, setFontSize] = useState<number>(READER_CONFIG.DEFAULT_FONT_SIZE);
  const [lineHeight, setLineHeight] = useState<number>(READER_CONFIG.DEFAULT_LINE_HEIGHT);
  const [displayMode, setDisplayMode] = useState<'collapsed' | 'expanded'>('collapsed');
  const [showRephrase, setShowRephrase] = useState(false);
  const [aiExplanationEnabled, setAiExplanationEnabled] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  const [audiobookEnabled, setAudiobookEnabled] = useState(false);
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [contentMode, setContentMode] = useState<AudioBookContentMode>('main');

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [rubyLookupOpen, setRubyLookupOpen] = useState(false);
  const [selectedSentence, setSelectedSentence] = useState('');
  const [sentenceContext, setSentenceContext] = useState('');

  const [copyFeedback, setCopyFeedback] = useState(false);
  const [copyRangeOpen, setCopyRangeOpen] = useState(false);
  const [copyRangeFeedback, setCopyRangeFeedback] = useState(false);

  const [priorityScores, setPriorityScores] = useState<Record<number, PriorityScore>>({});
  const [isPrioritizing, setIsPrioritizing] = useState(false);
  const [prioritizeError, setPrioritizeError] = useState<string | null>(null);

  const { imageMap } = useBookMetadata(fileNameParam, directoryParam);
  const { isGuest } = useGuestMode();

  const fullFilePath = useMemo(() => {
    if (directoryParam && fileNameParam) {
      return `${directoryParam}/${fileNameParam}`;
    }
    return fileNameParam || '';
  }, [directoryParam, fileNameParam]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedFurigana = localStorage.getItem(STORAGE_KEYS.FURIGANA_ENABLED);
    if (storedFurigana) setShowFurigana(storedFurigana === 'true');

    const storedFontSize = localStorage.getItem(STORAGE_KEYS.READER_FONT_SIZE);
    if (storedFontSize) setFontSize(parseInt(storedFontSize, 10));

    const storedLineHeight = localStorage.getItem(STORAGE_KEYS.READER_LINE_HEIGHT);
    if (storedLineHeight) setLineHeight(parseFloat(storedLineHeight));

    const storedAiExplanation = localStorage.getItem(STORAGE_KEYS.AI_EXPLANATION_ENABLED);
    if (storedAiExplanation) setAiExplanationEnabled(storedAiExplanation === 'true');

    const storedShowRephrase = localStorage.getItem(STORAGE_KEYS.SHOW_REPHRASE);
    if (storedShowRephrase) {
      const isExpanded = storedShowRephrase === 'true';
      setShowRephrase(isExpanded);
      setDisplayMode(isExpanded ? 'expanded' : 'collapsed');
    }

    const storedDarkMode = localStorage.getItem(STORAGE_KEYS.READER_DARK_MODE);
    if (storedDarkMode) setIsDarkMode(storedDarkMode === 'true');

    const storedAudiobook = localStorage.getItem(STORAGE_KEYS.AUDIOBOOK_ENABLED);
    if (storedAudiobook) setAudiobookEnabled(storedAudiobook === 'true');

    const storedContentMode = localStorage.getItem(STORAGE_KEYS.AUDIOBOOK_CONTENT_MODE);
    if (storedContentMode === 'main' || storedContentMode === 'sub' || storedContentMode === 'both') {
      setContentMode(storedContentMode);
    }
  }, []);

  useEffect(() => {
    document.body.style.backgroundColor = isDarkMode ? DARK_COLORS.BASE : READER_THEME.SURFACE;
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, [isDarkMode]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setRubyLookupOpen(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!fullFilePath) {
      router.push('/library');
      return;
    }

    const controller = new AbortController();

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      // Keeping the previous book's text would leave every derived value - unit
      // count, page count, narration lookup - describing the book we just left.
      setContent('');
      setBookmarkText('');

      try {
        const [contentRes, bookmarkRes] = await Promise.all([
          fetch(`${API_ROUTES.READ_TEXT}?fileName=${encodeURIComponent(fullFilePath)}`, { signal: controller.signal }),
          fetch(`${API_ROUTES.READ_BOOKMARK}?fileName=${encodeURIComponent(fullFilePath)}`, { signal: controller.signal }),
        ]);

        if (!contentRes.ok) throw new Error('Failed to load content');

        const contentData = await contentRes.json();
        if (controller.signal.aborted) return;
        setContent(contentData.text || '');

        if (bookmarkRes.ok) {
          const bookmarkData = await bookmarkRes.json();
          if (controller.signal.aborted) return;
          setBookmarkText(bookmarkData.text || '');
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    fetchData();
    // A late response from the book we just left would otherwise overwrite the
    // new book's text, and narration would then be keyed on the wrong unit count.
    return () => controller.abort();
  }, [fullFilePath, router]);

  const playableUnits = useMemo(() => buildPlayableUnits(content), [content]);
  const totalItems = playableUnits.length;

  const totalPages = Math.ceil(totalItems / PAGINATION_CONFIG.ITEMS_PER_PAGE);
  const currentPage = Math.min(Math.max(1, pageParam), totalPages || 1);
  const progress = totalPages > 0 ? (currentPage / totalPages) * 100 : 0;

  const currentPageHeaders = useMemo(() => {
    const start = (currentPage - 1) * PAGINATION_CONFIG.ITEMS_PER_PAGE;
    const end = start + PAGINATION_CONFIG.ITEMS_PER_PAGE;
    return playableUnits.slice(start, end).map(unit => stripFurigana(unit.main));
  }, [playableUnits, currentPage]);

  // Priority scores are per-page; drop them (and any error) on page/book change.
  useEffect(() => {
    setPriorityScores({});
    setPrioritizeError(null);
  }, [currentPage, fullFilePath]);

  useEffect(() => {
    if (!prioritizeError) return;
    const timer = setTimeout(() => setPrioritizeError(null), 4000);
    return () => clearTimeout(timer);
  }, [prioritizeError]);

  const handlePrioritize = useCallback(async () => {
    if (isPrioritizing || currentPageHeaders.length === 0) return;
    if (Object.keys(priorityScores).length > 0) {
      setPriorityScores({});
      return;
    }

    setPrioritizeError(null);
    setIsPrioritizing(true);
    try {
      const res = await fetch(API_ROUTES.PRIORITIZE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...guestKeyHeaders('gemini') },
        body: JSON.stringify({ sentences: currentPageHeaders }),
      });
      if (!res.ok) {
        // Missing/invalid guest key opens the key modal; anything else is a real
        // failure the reader should see rather than a silent empty result.
        if (res.status === 401) {
          await promptGuestKeyOnFailure('gemini', res);
        } else {
          setPrioritizeError(PRIORITIZE_ERROR_MESSAGE);
        }
        return;
      }
      const data = await res.json();
      const scores = (Array.isArray(data.scores) ? data.scores : []) as PriorityScore[];
      const start = (currentPage - 1) * PAGINATION_CONFIG.ITEMS_PER_PAGE;
      setPriorityScores(
        Object.fromEntries(scores.map((score, index) => [start + index, score] as const))
      );
    } catch {
      setPrioritizeError(PRIORITIZE_ERROR_MESSAGE);
    } finally {
      setIsPrioritizing(false);
    }
  }, [currentPageHeaders, currentPage, priorityScores, isPrioritizing]);

  const bookmarkItemIndex = useMemo(() => {
    if (!bookmarkText || /^page:\d+$/.test(bookmarkText)) return null;

    const normalizedBookmark = stripFurigana(bookmarkText).replace(/[\r\n]/g, '').trim();
    if (!normalizedBookmark) return null;

    const itemIndex = playableUnits.findIndex(
      unit => stripFurigana(unit.main).replace(/[\r\n]/g, '').trim() === normalizedBookmark
    );

    return itemIndex === -1 ? null : itemIndex;
  }, [bookmarkText, playableUnits]);

  const bookmarkPage = useMemo(() => {
    if (!bookmarkText) return null;

    const match = bookmarkText.match(/^page:(\d+)$/);
    if (match) return parseInt(match[1], 10);

    if (bookmarkItemIndex == null) return null;
    return Math.floor(bookmarkItemIndex / PAGINATION_CONFIG.ITEMS_PER_PAGE) + 1;
  }, [bookmarkText, bookmarkItemIndex]);

  const getStartIndex = useCallback(() => {
    const pageTop = (currentPage - 1) * PAGINATION_CONFIG.ITEMS_PER_PAGE;
    if (bookmarkItemIndex == null) return pageTop;
    const bookmarkPageForIndex = Math.floor(bookmarkItemIndex / PAGINATION_CONFIG.ITEMS_PER_PAGE) + 1;
    return bookmarkPageForIndex === currentPage ? bookmarkItemIndex : pageTop;
  }, [currentPage, bookmarkItemIndex]);

  const { manifest: narration, error: narrationLoadError } = useNarration(
    fileNameParam,
    directoryParam,
    totalItems
  );

  const {
    status: audioStatus,
    index: audioIndex,
    cursor: audioStartCursor,
    total: audioTotal,
    speed: audioSpeed,
    hasNarration,
    playbackError,
    togglePlayPause,
    next: audioNext,
    previous: audioPrev,
    replay: audioReplay,
    playSub: audioPlaySub,
    setStartCursor,
    setSpeed: setAudioSpeed,
    stop: stopAudioBook,
  } = useAudioBook({
    units: playableUnits,
    contentMode,
    narration,
    getStartIndex,
  });

  const buildReadHref = useCallback(
    (page: number) => {
      const params = new URLSearchParams();
      if (directoryParam) params.set('directory', directoryParam);
      if (fileNameParam) params.set('fileName', fileNameParam);
      params.set('page', page.toString());
      return `/read?${params.toString()}`;
    },
    [directoryParam, fileNameParam]
  );

  const [didAutoNavigate, setDidAutoNavigate] = useState(false);

  useEffect(() => {
    if (isLoading || didAutoNavigate) return;
    if (!hasExplicitPage && bookmarkPage && bookmarkPage > 1 && currentPage !== bookmarkPage) {
      setDidAutoNavigate(true);
      router.replace(buildReadHref(bookmarkPage));
    }
  }, [isLoading, hasExplicitPage, bookmarkPage, currentPage, buildReadHref, router, didAutoNavigate]);

  useEffect(() => {
    if (isLoading) return;
    if (audiobookEnabled && audioStatus !== 'idle') return;

    const scrollToBookmark = () => {
      const bookmarkElement = document.getElementById('bookmark');
      if (bookmarkElement) {
        bookmarkElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    };

    const timer = setTimeout(scrollToBookmark, 100);
    return () => clearTimeout(timer);
  }, [currentPage, isLoading, bookmarkText, audiobookEnabled, audioStatus]);

  useEffect(() => {
    if (!audiobookEnabled || audioIndex < 0) return;
    const targetPage = Math.floor(audioIndex / PAGINATION_CONFIG.ITEMS_PER_PAGE) + 1;
    if (targetPage === currentPage) return;
    router.replace(buildReadHref(targetPage));
  }, [audioIndex, audiobookEnabled, currentPage, buildReadHref, router]);

  useEffect(() => {
    if (!audiobookEnabled || audioIndex < 0) return;
    const targetPage = Math.floor(audioIndex / PAGINATION_CONFIG.ITEMS_PER_PAGE) + 1;
    if (targetPage !== currentPage) return;
    const timer = setTimeout(() => {
      const activeItem = document.querySelector(`[data-global-index="${audioIndex}"]`);
      if (activeItem) activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => clearTimeout(timer);
  }, [audioIndex, audiobookEnabled, currentPage]);

  const refetchBookmark = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_ROUTES.READ_BOOKMARK}?fileName=${encodeURIComponent(fullFilePath)}`
      );
      if (res.ok) {
        const data = await res.json();
        setBookmarkText(data.text || '');
      }
    } catch (err) {
      console.error('Failed to refetch bookmark:', err);
    }
  }, [fullFilePath]);

  const bookmarkPlayingSentence = useCallback(async () => {
    if (audioStatus === 'idle' || audioIndex < 0) return;
    const unit = playableUnits[audioIndex];
    if (!unit) return;
    const page = Math.floor(audioIndex / PAGINATION_CONFIG.ITEMS_PER_PAGE) + 1;
    try {
      const res = await fetch(API_ROUTES.WRITE_BOOKMARK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: fullFilePath, content: unit.main, page }),
      });
      if (res.ok) refetchBookmark();
    } catch (err) {
      console.error('Failed to bookmark playing sentence:', err);
    }
  }, [audioStatus, audioIndex, playableUnits, fullFilePath, refetchBookmark]);

  useEffect(() => {
    if (!audiobookEnabled || !keyboardMode) return;

    const keyActions: Record<string, () => void> = {
      ArrowUp: togglePlayPause,
      ArrowRight: audioNext,
      ArrowLeft: audioPrev,
      ArrowDown: audioReplay,
      // The same JIS key types "\" on Windows and "_" on macOS.
      '\\': audioPlaySub,
      _: audioPlaySub,
      b: bookmarkPlayingSentence,
      B: bookmarkPlayingSentence,
    };

    const handleAudioKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (settingsOpen || explanationOpen || rubyLookupOpen) return;
      if (e.key === 'Escape') {
        setKeyboardMode(false);
        return;
      }
      const action = keyActions[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };

    window.addEventListener('keydown', handleAudioKey);
    return () => window.removeEventListener('keydown', handleAudioKey);
  }, [audiobookEnabled, keyboardMode, settingsOpen, explanationOpen, rubyLookupOpen, togglePlayPause, audioNext, audioPrev, audioReplay, audioPlaySub, bookmarkPlayingSentence]);

  const handlePageChange = useCallback(
    (newPage: number) => {
      if (newPage < 1 || newPage > totalPages) return;
      stopAudioBook();
      router.push(buildReadHref(newPage));
    },
    [totalPages, buildReadHref, router, stopAudioBook]
  );

  const handleToggleFurigana = () => {
    const newValue = !showFurigana;
    setShowFurigana(newValue);
    localStorage.setItem(STORAGE_KEYS.FURIGANA_ENABLED, newValue.toString());
    window.dispatchEvent(
      new CustomEvent('furiganaChanged', { detail: { enabled: newValue } })
    );
  };

  const handleFontSizeChange = (size: number) => {
    setFontSize(size);
    localStorage.setItem(STORAGE_KEYS.READER_FONT_SIZE, size.toString());
  };

  const handleLineHeightChange = (height: number) => {
    setLineHeight(height);
    localStorage.setItem(STORAGE_KEYS.READER_LINE_HEIGHT, height.toString());
  };

  const handleDisplayModeChange = (mode: 'collapsed' | 'expanded') => {
    setDisplayMode(mode);
    setShowRephrase(mode === 'expanded');
    localStorage.setItem(STORAGE_KEYS.SHOW_REPHRASE, (mode === 'expanded').toString());
  };

  const handleToggleRephrase = () => {
    const newShowRephrase = !showRephrase;
    setShowRephrase(newShowRephrase);
    setDisplayMode(newShowRephrase ? 'expanded' : 'collapsed');
    localStorage.setItem(STORAGE_KEYS.SHOW_REPHRASE, newShowRephrase.toString());
  };

  const handleAiExplanationChange = (enabled: boolean) => {
    setAiExplanationEnabled(enabled);
    localStorage.setItem(STORAGE_KEYS.AI_EXPLANATION_ENABLED, enabled.toString());
  };

  const handleToggleDarkMode = () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);
    localStorage.setItem(STORAGE_KEYS.READER_DARK_MODE, newValue.toString());
  };

  const handleAudiobookChange = (enabled: boolean) => {
    setAudiobookEnabled(enabled);
    localStorage.setItem(STORAGE_KEYS.AUDIOBOOK_ENABLED, enabled.toString());
    if (!enabled) {
      stopAudioBook();
      setKeyboardMode(false);
    }
  };

  const handleContentModeChange = (mode: AudioBookContentMode) => {
    setContentMode(mode);
    localStorage.setItem(STORAGE_KEYS.AUDIOBOOK_CONTENT_MODE, mode);
  };

  const handleToggleKeyboardMode = () => {
    setKeyboardMode(prev => !prev);
  };

  const handleSentenceClick = (sentence: string) => {
    if (!aiExplanationEnabled) return;

    const cleanSentence = stripFurigana(sentence).trim();
    setSelectedSentence(sentence);
    setSentenceContext(cleanSentence);
    setExplanationOpen(true);
  };


  const handleGoToBookmark = useCallback(() => {
    if (!bookmarkPage) return;

    if (currentPage === bookmarkPage) {
      const bookmarkElement = document.getElementById('bookmark');
      if (bookmarkElement) {
        bookmarkElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      handlePageChange(bookmarkPage);
    }
  }, [bookmarkPage, currentPage, handlePageChange]);

  const handleCopyPageText = useCallback(async () => {
    if (currentPageHeaders.length === 0) return;

    try {
      const textToCopy = currentPageHeaders.join('\n');
      await navigator.clipboard.writeText(textToCopy);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [currentPageHeaders]);

  const handleCopyPageRange = useCallback(async (fromPage: number, toPage: number) => {
    const start = (fromPage - 1) * PAGINATION_CONFIG.ITEMS_PER_PAGE;
    const end = toPage * PAGINATION_CONFIG.ITEMS_PER_PAGE;
    const textToCopy = playableUnits
      .slice(start, end)
      .map(unit => stripFurigana(unit.main))
      .join('\n');

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopyRangeFeedback(true);
      setTimeout(() => {
        setCopyRangeFeedback(false);
        setCopyRangeOpen(false);
      }, 1000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [playableUnits]);

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: isDarkMode ? DARK_COLORS.BASE : READER_THEME.SURFACE }}
      >
        <div
          className="w-10 h-10 rounded-full animate-spin"
          style={{
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: isDarkMode ? DARK_COLORS.NEUTRAL : COLORS.NEUTRAL,
            borderTopColor: isDarkMode ? DARK_COLORS.TEXT : COLORS.INK,
          }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ backgroundColor: isDarkMode ? DARK_COLORS.BASE : READER_THEME.SURFACE }}
      >
        <div
          className="p-8 text-center max-w-md border"
          style={{
            backgroundColor: isDarkMode ? DARK_COLORS.SURFACE : READER_THEME.SURFACE,
            borderColor: isDarkMode ? DARK_COLORS.NEUTRAL : COLORS.NEUTRAL,
          }}
        >
          <p className="font-mincho font-bold text-lg mb-2" style={{ color: isDarkMode ? DARK_COLORS.TEXT : COLORS.INK }}>
            本を読み込めませんでした
          </p>
          <p className="text-sm mb-5" style={{ color: isDarkMode ? DARK_COLORS.TEXT_MUTED : COLORS.SECONDARY }}>
            {error}
          </p>
          <button
            onClick={() => router.push('/library')}
            className="min-h-11 px-5 text-sm font-bold interactive-btn"
            style={{ backgroundColor: COLORS.PRIMARY, color: COLORS.SURFACE }}
          >
            本棚に戻る
          </button>
        </div>
      </div>
    );
  }

  const theme = isDarkMode
    ? { bg: DARK_COLORS.BASE, surface: DARK_COLORS.SURFACE, text: DARK_COLORS.TEXT, muted: DARK_COLORS.TEXT_MUTED, rule: DARK_COLORS.NEUTRAL }
    : { bg: READER_THEME.SURFACE, surface: READER_THEME.SURFACE_MUTED, text: COLORS.INK, muted: COLORS.SECONDARY, rule: COLORS.NEUTRAL };

  const hasBookmark = bookmarkPage != null && bookmarkPage > 0;

  return (
    <div
      className="min-h-screen transition-colors duration-300"
      style={{ backgroundColor: theme.bg, color: theme.text }}
    >
      {isGuest && (
        <GuestModeBanner
          isDarkMode={isDarkMode}
          message="Preview only. Sign in to read the full book and use your saved bookmarks."
        />
      )}

      {isPrioritizing && (
        <div
          style={{
            position: 'fixed',
            bottom: audiobookEnabled ? 150 : 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            backgroundColor: isDarkMode ? DARK_COLORS.SURFACE : COLORS.SURFACE,
            color: theme.text,
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            border: `1px solid ${theme.rule}`,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <span
            className="animate-spin"
            style={{ width: 14, height: 14, borderWidth: 2, borderStyle: 'solid', borderColor: COLORS.START_CURSOR, borderTopColor: 'transparent', borderRadius: '50%' }}
          />
          重要度を分析中…
        </div>
      )}

      {prioritizeError && !isPrioritizing && (
        <div
          style={{
            position: 'fixed',
            bottom: audiobookEnabled ? 150 : 24,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            padding: '8px 16px',
            backgroundColor: isDarkMode ? DARK_COLORS.SURFACE : COLORS.SURFACE,
            color: COLORS.DANGER,
            boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            border: `1px solid ${COLORS.DANGER}`,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {prioritizeError}
        </div>
      )}

      <ProgressBar progress={progress} isDarkMode={isDarkMode} />

      <ReaderHeader
        currentPage={currentPage}
        totalPages={totalPages}
        bookmarkPage={bookmarkPage}
        isDarkMode={isDarkMode}
        directoryParam={directoryParam}
        fileNameParam={fileNameParam}
        onPageChange={handlePageChange}
      />

      <main
        className="max-w-3xl mx-auto px-4 py-8 pt-4 pb-12"
        style={{
          fontSize: `${fontSize}px`,
          lineHeight: lineHeight,
          paddingBottom: audiobookEnabled ? 140 : undefined,
        }}
      >
        <ReadingContent
          content={content}
          fileName={fileNameParam || ''}
          directory={directoryParam || ''}
          bookmarkText={bookmarkText}
          showFurigana={showFurigana}
          displayMode={displayMode}
          aiExplanationEnabled={aiExplanationEnabled}
          currentPage={currentPage}
          itemsPerPage={PAGINATION_CONFIG.ITEMS_PER_PAGE}
          isDarkMode={isDarkMode}
          onBookmarkSuccess={refetchBookmark}
          onSentenceClick={handleSentenceClick}
          imageMap={imageMap}
          audiobookEnabled={audiobookEnabled}
          startCursorIndex={audioStartCursor}
          playingIndex={audioStatus === 'idle' ? -1 : audioIndex}
          onStartFromHere={setStartCursor}
          priorityScores={priorityScores}
        />

        {totalPages > 1 && (
          <div
            className="flex justify-between items-center gap-4 mt-10 pt-5 border-t font-gothic"
            style={{ borderColor: theme.rule }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePageChange(currentPage - 1);
              }}
              disabled={currentPage <= 1}
              className="min-h-11 px-4 border disabled:opacity-30 text-sm interactive-page-btn"
              style={{ borderColor: theme.rule, color: theme.text }}
            >
              前のページ
            </button>
            <span className="text-sm" style={{ color: theme.muted }}>
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePageChange(currentPage + 1);
              }}
              disabled={currentPage >= totalPages}
              className="min-h-11 px-4 border disabled:opacity-30 text-sm font-bold interactive-page-btn"
              style={{ borderColor: theme.text, color: theme.text }}
            >
              次のページ
            </button>
          </div>
        )}

        {isGuest && (
          <div
            className="mt-10 p-6 text-center font-gothic"
            style={{ backgroundColor: theme.surface, border: `1px solid ${theme.rule}` }}
          >
            <p className="text-base font-semibold mb-1" style={{ color: theme.text }}>
              End of preview
            </p>
            <p className="text-sm mb-4" style={{ color: theme.muted }}>
              You are reading a free sample. Sign in to read the full book.
            </p>
            <button
              onClick={() => router.push('/login')}
              className="min-h-11 px-5 text-sm font-bold interactive-btn"
              style={{ backgroundColor: COLORS.PRIMARY, color: COLORS.SURFACE }}
            >
              Sign in
            </button>
          </div>
        )}
      </main>

      <ReaderFAB
        onToggleFurigana={handleToggleFurigana}
        onToggleRephrase={handleToggleRephrase}
        onOpenSettings={() => setSettingsOpen(true)}
        onGoToBookmark={handleGoToBookmark}
        onCopyPageText={handleCopyPageText}
        onCopyPageRange={() => setCopyRangeOpen(true)}
        onToggleDarkMode={handleToggleDarkMode}
        onToggleRubyLookup={() => setRubyLookupOpen(prev => !prev)}
        onPrioritize={handlePrioritize}
        isPrioritizing={isPrioritizing}
        hasPriority={Object.keys(priorityScores).length > 0}
        isFuriganaEnabled={showFurigana}
        showRephrase={showRephrase}
        isDarkMode={isDarkMode}
        hasBookmark={hasBookmark}
        bookmarkPage={bookmarkPage}
        currentPage={currentPage}
        copyFeedback={copyFeedback}
      />

      <CopyRangeModal
        isOpen={copyRangeOpen}
        onClose={() => setCopyRangeOpen(false)}
        onCopy={handleCopyPageRange}
        currentPage={currentPage}
        totalPages={totalPages}
        isDarkMode={isDarkMode}
        copyFeedback={copyRangeFeedback}
      />

      <BottomSheet isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} title="Display" isDarkMode={isDarkMode}>
        <ReaderSettings
          fontSize={fontSize}
          lineHeight={lineHeight}
          displayMode={displayMode}
          aiExplanationEnabled={aiExplanationEnabled}
          onFontSizeChange={handleFontSizeChange}
          onLineHeightChange={handleLineHeightChange}
          onDisplayModeChange={handleDisplayModeChange}
          onAiExplanationChange={handleAiExplanationChange}
          audiobookEnabled={audiobookEnabled}
          onAudiobookChange={handleAudiobookChange}
        />
      </BottomSheet>

      <ExplanationSidebar
        isOpen={explanationOpen}
        onClose={() => setExplanationOpen(false)}
        sentence={selectedSentence}
        context={sentenceContext}
        fileName={fullFilePath}
        showFurigana={showFurigana}
      />

      <RubyLookupSidebar
        isOpen={rubyLookupOpen}
        onClose={() => setRubyLookupOpen(false)}
        directory={directoryParam?.split('/')[0] || ''}
        bookName={directoryParam?.split('/').slice(1).join('/') || ''}
      />

      <FloatingStickyNotes
        directory={directoryParam?.split('/')[0] || ''}
        bookName={directoryParam?.split('/').slice(1).join('/') || ''}
      />

      {audiobookEnabled && (
        <AudioPlayerBar
          status={audioStatus}
          index={audioIndex}
          total={audioTotal}
          contentMode={contentMode}
          speed={audioSpeed}
          isDarkMode={isDarkMode}
          keyboardMode={keyboardMode}
          hasNarration={hasNarration}
          playbackError={playbackError ?? narrationLoadError}
          onTogglePlay={togglePlayPause}
          onPrev={audioPrev}
          onNext={audioNext}
          onReplay={audioReplay}
          onContentModeChange={handleContentModeChange}
          onSpeedChange={setAudioSpeed}
          onToggleKeyboardMode={handleToggleKeyboardMode}
          onClose={() => handleAudiobookChange(false)}
        />
      )}

      <GuestApiKeyModal isDarkMode={isDarkMode} />
    </div>
  );
}

export default function ReadPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center"
          style={{ backgroundColor: READER_THEME.SURFACE }}
        >
          <div
            className="w-10 h-10 border-2 rounded-full animate-spin"
            style={{
              borderColor: COLORS.NEUTRAL,
              borderTopColor: COLORS.INK,
            }}
          />
        </div>
      }
    >
      <SearchParamsReader>
        {({ directory, fileName, page, hasExplicitPage }) => (
          <ReaderContent
            directoryParam={directory}
            fileNameParam={fileName}
            pageParam={page}
            hasExplicitPage={hasExplicitPage}
          />
        )}
      </SearchParamsReader>
    </Suspense>
  );
}
