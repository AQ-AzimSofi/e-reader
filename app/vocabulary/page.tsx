'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { COLORS, STORAGE_KEYS } from '@/lib/constants';
import { toTint } from '@/lib/utils/colorTint';
import { parseFurigana, segmentsToHTML } from '@/lib/utils/furiganaParser';
import type { VocabularyEntry } from '@/lib/types';

export default function VocabularyPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<VocabularyEntry | null>(null);
  const [showFurigana, setShowFurigana] = useState(true);

  // Load furigana preference from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEYS.FURIGANA_ENABLED);
      if (stored !== null) {
        setShowFurigana(stored === 'true');
      }
    }
  }, []);

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/vocabulary');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to fetch vocabulary');
      }

      setEntries(data.entries || []);
    } catch (err) {
      console.error('Error fetching vocabulary:', err);
      setError(err instanceof Error ? err.message : 'Failed to load vocabulary');
    } finally {
      setLoading(false);
    }
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('この単語を削除しますか？')) return;

    try {
      const response = await fetch(`/api/vocabulary/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete entry');
      }

      // Remove from list
      setEntries(entries.filter((e) => e.id !== id));
      if (selectedEntry?.id === id) {
        setSelectedEntry(null);
      }
    } catch (err) {
      console.error('Error deleting entry:', err);
      alert('削除に失敗しました');
    }
  };

  const navigateToSource = (entry: VocabularyEntry) => {
    // Navigate to the book with the word highlighted
    const params = new URLSearchParams({
      directory: entry.directory,
      fileName: entry.fileName,
      highlight: entry.word,
    });
    router.push(`/read?${params.toString()}`);
  };

  const formatDate = (dateString: string | Date) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Render text with furigana support
  const renderTextWithFurigana = (text: string) => {
    const segments = parseFurigana(text);
    const html = segmentsToHTML(segments, showFurigana);
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  };

  // Filter entries by search query
  const filteredEntries = entries.filter((entry) =>
    entry.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
    entry.sentence.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (entry.reading && entry.reading.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (entry.notes && entry.notes.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="min-h-screen pt-24 pb-8 px-4" style={{ color: COLORS.INK }}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-mincho font-bold text-3xl mb-2">単語帳</h1>
          <p className="text-sm" style={{ color: COLORS.SECONDARY }}>
            保存した単語: {entries.length}個
          </p>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="単語、文、メモで検索..."
            className="w-full p-4 border focus:outline-none focus:ring-2"
            style={{
              backgroundColor: COLORS.SURFACE,
              borderColor: COLORS.NEUTRAL,
              '--tw-ring-color': COLORS.PRIMARY,
            } as React.CSSProperties}
          />
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div className="text-center py-12 text-sm" style={{ color: COLORS.SECONDARY }}>
            読み込み中...
          </div>
        )}

        {error && (
          <div
            className="p-4 border text-sm"
            style={{
              backgroundColor: toTint(COLORS.DANGER, 7),
              borderColor: COLORS.DANGER,
              color: COLORS.DANGER,
            }}
          >
            {error}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && entries.length === 0 && (
          <div
            className="text-center p-8 border"
            style={{ backgroundColor: COLORS.SURFACE, borderColor: COLORS.NEUTRAL }}
          >
            <p className="font-mincho font-bold text-xl mb-4">
              まだ単語を保存していません
            </p>
            <p className="text-sm mb-6" style={{ color: COLORS.SECONDARY }}>
              単語帳モードをONにして、テキストを選択してください
            </p>
            <Link
              href="/"
              className="inline-flex items-center min-h-11 px-5 text-sm font-bold interactive-btn"
              style={{
                backgroundColor: COLORS.PRIMARY,
                color: COLORS.SURFACE,
              }}
            >
              読書ページへ
            </Link>
          </div>
        )}

        {/* Vocabulary List */}
        {!loading && !error && filteredEntries.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredEntries.map((entry) => (
              <div
                key={entry.id}
                className="group p-4 border cursor-pointer"
                style={{
                  borderColor: COLORS.NEUTRAL,
                  backgroundColor: COLORS.SURFACE,
                }}
                onClick={() => setSelectedEntry(entry)}
              >
                {/* Word and Reading */}
                <div className="mb-3">
                  <h3 className="font-mincho font-bold text-xl group-hover:underline">
                    {renderTextWithFurigana(entry.word)}
                  </h3>
                  {entry.reading && (
                    <p className="text-sm" style={{ color: COLORS.SECONDARY }}>
                      {entry.reading}
                    </p>
                  )}
                </div>

                {/* Sentence */}
                <p className="font-mincho text-sm line-clamp-2 mb-3" style={{ color: COLORS.SECONDARY_DARK }}>
                  {renderTextWithFurigana(entry.sentence)}
                </p>

                {/* Notes */}
                {entry.notes && (
                  <div
                    className="text-sm p-2 mb-3 line-clamp-2"
                    style={{
                      backgroundColor: COLORS.NEUTRAL_SOFT,
                    }}
                  >
                    {entry.notes}
                  </div>
                )}

                {/* Meta */}
                <div className="flex items-center justify-between text-xs border-t pt-2"
                  style={{ borderColor: COLORS.NEUTRAL, color: COLORS.SECONDARY }}
                >
                  <span>{entry.directory}/{entry.fileName}</span>
                  <span>{new Date(entry.createdAt).toLocaleDateString('ja-JP')}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No Search Results */}
        {!loading && !error && entries.length > 0 && filteredEntries.length === 0 && (
          <div className="text-center py-12 text-sm" style={{ color: COLORS.SECONDARY }}>
            <p>「{searchQuery}」に一致する単語が見つかりませんでした</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: toTint(COLORS.INK, 40) }}
          onClick={() => setSelectedEntry(null)}
        >
          <div
            className="w-full max-w-2xl border max-h-[90vh] overflow-y-auto"
            style={{ backgroundColor: COLORS.SURFACE, borderColor: COLORS.NEUTRAL, color: COLORS.INK }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between p-6 border-b"
              style={{ borderColor: COLORS.NEUTRAL }}
            >
              <div>
                <h2 className="font-mincho font-bold text-2xl">
                  {renderTextWithFurigana(selectedEntry.word)}
                </h2>
                {selectedEntry.reading && (
                  <p className="mt-1" style={{ color: COLORS.SECONDARY }}>{selectedEntry.reading}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedEntry(null)}
                className="p-2 interactive-nav-btn"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {/* Sentence */}
              <div>
                <h3 className="text-sm font-bold mb-2" style={{ color: COLORS.SECONDARY }}>文脈</h3>
                <div
                  className="font-mincho p-4 border whitespace-pre-wrap"
                  style={{
                    backgroundColor: COLORS.BASE,
                    borderColor: COLORS.NEUTRAL,
                  }}
                >
                  {renderTextWithFurigana(selectedEntry.sentence)}
                </div>
              </div>

              {/* Notes */}
              {selectedEntry.notes && (
                <div>
                  <h3 className="text-sm font-bold mb-2" style={{ color: COLORS.SECONDARY }}>メモ</h3>
                  <div
                    className="p-4 whitespace-pre-wrap"
                    style={{
                      backgroundColor: COLORS.NEUTRAL_SOFT,
                    }}
                  >
                    {selectedEntry.notes}
                  </div>
                </div>
              )}

              {/* Source Info */}
              <div>
                <h3 className="text-sm font-bold mb-2" style={{ color: COLORS.SECONDARY }}>出典</h3>
                <p style={{ color: COLORS.SECONDARY_DARK }}>
                  {selectedEntry.directory}/{selectedEntry.fileName}
                </p>
                <p className="text-sm mt-1" style={{ color: COLORS.SECONDARY }}>
                  保存日時: {formatDate(selectedEntry.createdAt)}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-between p-6 border-t"
              style={{ borderColor: COLORS.NEUTRAL }}
            >
              <button
                onClick={() => deleteEntry(selectedEntry.id)}
                className="min-h-11 text-sm font-bold cursor-pointer interactive-link"
                style={{ color: COLORS.DANGER }}
              >
                削除
              </button>
              <button
                onClick={() => navigateToSource(selectedEntry)}
                className="min-h-11 px-5 text-sm font-bold interactive-btn"
                style={{
                  backgroundColor: COLORS.PRIMARY,
                  color: COLORS.SURFACE,
                }}
              >
                元の文章を見る →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
