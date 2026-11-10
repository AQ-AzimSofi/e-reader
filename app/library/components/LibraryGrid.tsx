'use client';

import { useEffect, useState, useMemo } from 'react';
import { API_ROUTES, COLORS } from '@/lib/constants';
import { useGuestMode } from '@/app/hooks/useGuestMode';
import BookCard from './BookCard';
import ContinueReading from './ContinueReading';

interface FileListResponse {
  directories: string[];
  filesByDirectory: Record<string, string[]>;
  files: string[];
}

interface BookProgressData {
  progress: number;
  totalCharacters: number;
  bookmarkPage: number | null;
  totalPages: number;
  bookmarkUpdatedAt: string | null;
  createdAt: string | null;
}

interface BookProgress {
  [key: string]: BookProgressData;
}

type SortMode = 'last-read' | 'last-added' | 'progress' | 'title';

interface FlatBook {
  fileName: string;
  directory: string;
  progress: number;
  totalCharacters: number;
  bookmarkPage: number | null;
  totalPages: number;
  bookmarkUpdatedAt: string | null;
  createdAt: string | null;
}

const SORT_OPTIONS: { value: SortMode; label: string }[] = [
  { value: 'last-read', label: '最近読んだ' },
  { value: 'last-added', label: '追加順' },
  { value: 'progress', label: '進捗' },
  { value: 'title', label: 'タイトル' },
];

function toTimestampMs(isoDate: string | null): number {
  return isoDate ? new Date(isoDate).getTime() : 0;
}

function findLastReadBook(books: FlatBook[]): FlatBook | null {
  const bookmarkedBooks = books.filter(book => book.bookmarkUpdatedAt && book.bookmarkPage);
  if (bookmarkedBooks.length === 0) return null;
  return bookmarkedBooks.reduce((latest, book) =>
    toTimestampMs(book.bookmarkUpdatedAt) > toTimestampMs(latest.bookmarkUpdatedAt) ? book : latest
  );
}

function formatDirectoryTag(directory: string): string {
  const topLevel = directory.split('/')[0];
  return topLevel
    .replace(/-/g, ' ')
    .replace(/^\w/, c => c.toUpperCase());
}

export default function LibraryGrid() {
  const [fileData, setFileData] = useState<FileListResponse | null>(null);
  const [bookProgress, setBookProgress] = useState<BookProgress>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>('last-read');
  const { isGuest } = useGuestMode();

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        const [fileResponse, progressResponse] = await Promise.all([
          fetch(API_ROUTES.LIST_TEXT_FILES),
          fetch(API_ROUTES.LIBRARY_PROGRESS),
        ]);

        if (!fileResponse.ok) throw new Error('Failed to load library');
        if (!progressResponse.ok) throw new Error('Failed to load progress');

        const data: FileListResponse = await fileResponse.json();
        setFileData(data);

        const progressData: BookProgress = await progressResponse.json();
        setBookProgress(progressData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const sortedBooks = useMemo(() => {
    if (!fileData) return [];

    const books: FlatBook[] = [];
    for (const directory of fileData.directories) {
      const files = fileData.filesByDirectory[directory] || [];
      for (const fileName of files) {
        const key = `${directory}/${fileName}`;
        const pd = bookProgress[key];
        books.push({
          fileName,
          directory,
          progress: pd?.progress || 0,
          totalCharacters: pd?.totalCharacters || 0,
          bookmarkPage: pd?.bookmarkPage || null,
          totalPages: pd?.totalPages || 0,
          bookmarkUpdatedAt: pd?.bookmarkUpdatedAt || null,
          createdAt: pd?.createdAt || null,
        });
      }
    }

    books.sort((a, b) => {
      switch (sortMode) {
        case 'last-read':
          return toTimestampMs(b.bookmarkUpdatedAt) - toTimestampMs(a.bookmarkUpdatedAt);
        case 'last-added':
          return toTimestampMs(b.createdAt) - toTimestampMs(a.createdAt);
        case 'progress':
          return b.progress - a.progress;
        case 'title':
          return a.fileName.localeCompare(b.fileName);
        default:
          return 0;
      }
    });

    return books;
  }, [fileData, bookProgress, sortMode]);

  const lastReadBook = useMemo(() => findLastReadBook(sortedBooks), [sortedBooks]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="text-center">
          <div
            className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-4"
            style={{
              borderColor: COLORS.NEUTRAL,
              borderTopColor: COLORS.INK,
            }}
          />
          <p className="text-sm" style={{ color: COLORS.SECONDARY }}>読み込み中…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-12 p-8 text-center border" style={{ backgroundColor: COLORS.SURFACE, borderColor: COLORS.NEUTRAL }}>
        <p className="font-mincho text-lg font-bold mb-2" style={{ color: COLORS.INK }}>本棚を読み込めませんでした</p>
        <p className="text-sm" style={{ color: COLORS.SECONDARY }}>{error}</p>
      </div>
    );
  }

  if (sortedBooks.length === 0) {
    return (
      <div className="mt-12 p-8 text-center border" style={{ backgroundColor: COLORS.SURFACE, borderColor: COLORS.NEUTRAL }}>
        <p className="font-mincho text-lg font-bold mb-2" style={{ color: COLORS.INK }}>
          本がまだありません
        </p>
        <p className="text-sm" style={{ color: COLORS.SECONDARY }}>
          public/ に .txt ファイルを追加すると、ここに並びます。
        </p>
      </div>
    );
  }

  return (
    <div>
      {lastReadBook && lastReadBook.bookmarkPage && (
        <ContinueReading
          fileName={lastReadBook.fileName}
          directory={lastReadBook.directory}
          progress={lastReadBook.progress}
          bookmarkPage={lastReadBook.bookmarkPage}
          totalPages={lastReadBook.totalPages}
        />
      )}

      <section aria-label="本棚" className="pt-9">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-6">
          <div className="flex items-baseline gap-3.5">
            <h2 className="font-mincho font-bold text-[26px] tracking-[0.06em]" style={{ color: COLORS.INK }}>
              本棚
            </h2>
            <span className="text-[13px]" style={{ color: COLORS.SECONDARY }}>{sortedBooks.length}冊</span>
          </div>

          <div className="flex flex-wrap gap-x-6 text-sm" role="group" aria-label="並び替え">
            {SORT_OPTIONS.map((option) => {
              const isActive = sortMode === option.value;
              return (
                <button
                  key={option.value}
                  onClick={() => setSortMode(option.value)}
                  aria-pressed={isActive}
                  className="py-3 border-b-2 cursor-pointer interactive-link"
                  style={{
                    borderColor: isActive ? COLORS.INK : 'transparent',
                    color: isActive ? COLORS.INK : COLORS.SECONDARY,
                    fontWeight: isActive ? 700 : 400,
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-7 gap-y-9">
          {sortedBooks.map((book) => (
            <BookCard
              key={`${book.directory}/${book.fileName}`}
              fileName={book.fileName}
              directory={book.directory}
              progress={book.progress}
              totalCharacters={book.totalCharacters}
              directoryTag={formatDirectoryTag(book.directory)}
              bookmarkPage={book.bookmarkPage}
              isPreview={isGuest}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
