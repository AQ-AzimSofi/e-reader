'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { COLORS, API_ROUTES } from '@/lib/constants';
import { toTint } from '@/lib/utils/colorTint';
import { useRubyRegistry } from '@/app/hooks/useRubyRegistry';
import type { TextFileListResponse, RubyEntry } from '@/lib/types';

interface BookOption {
  directory: string;
  bookName: string;
  label: string;
}

const INPUT_STYLE = {
  backgroundColor: COLORS.SURFACE,
  borderColor: COLORS.NEUTRAL,
  '--tw-ring-color': COLORS.PRIMARY,
} as React.CSSProperties;

function RubyRegistryContent() {
  const searchParams = useSearchParams();
  const initialDirectory = searchParams.get('directory') || '';
  const initialBookName = searchParams.get('bookName') || '';

  const [books, setBooks] = useState<BookOption[]>([]);
  const [selectedBook, setSelectedBook] = useState<BookOption | null>(
    initialDirectory && initialBookName
      ? { directory: initialDirectory, bookName: initialBookName, label: `${initialDirectory}/${initialBookName}` }
      : null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RubyEntry | null>(null);
  const [formData, setFormData] = useState({ kanji: '', reading: '', note: '' });

  const {
    registry,
    isLoading,
    error,
    addEntry,
    deleteEntry,
    ignoreSuggestion,
    searchEntries,
  } = useRubyRegistry({
    directory: selectedBook?.directory || '',
    bookName: selectedBook?.bookName || '',
    enabled: !!selectedBook,
  });

  useEffect(() => {
    fetchBooks();
  }, []);

  const fetchBooks = async () => {
    try {
      const response = await fetch(API_ROUTES.LIST_TEXT_FILES);
      const data: TextFileListResponse = await response.json();

      const options: BookOption[] = [];
      for (const [dir, files] of Object.entries(data.filesByDirectory)) {
        for (const file of files) {
          options.push({
            directory: dir,
            bookName: file,
            label: `${dir}/${file}`,
          });
        }
      }
      setBooks(options);

      if (!selectedBook && options.length > 0) {
        setSelectedBook(options[0]);
      }
    } catch (err) {
      console.error('Error fetching books:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.kanji || !formData.reading) return;

    try {
      await addEntry({
        kanji: formData.kanji,
        reading: formData.reading,
        note: formData.note,
        source: editingEntry?.source || 'user',
      });
      setFormData({ kanji: '', reading: '', note: '' });
      setShowAddForm(false);
      setEditingEntry(null);
    } catch (err) {
      console.error('Error saving entry:', err);
    }
  };

  const handleEdit = (entry: RubyEntry) => {
    setEditingEntry(entry);
    setFormData({
      kanji: entry.kanji,
      reading: entry.reading,
      note: entry.note,
    });
    setShowAddForm(true);
  };

  const handleDelete = async (kanji: string) => {
    if (!confirm(`「${kanji}」を削除しますか？`)) return;
    try {
      await deleteEntry(kanji);
    } catch (err) {
      console.error('Error deleting entry:', err);
    }
  };

  const handleAddSuggestion = (kanji: string) => {
    setFormData({ kanji, reading: '', note: '' });
    setEditingEntry(null);
    setShowAddForm(true);
  };

  const handleIgnoreSuggestion = async (kanji: string) => {
    try {
      await ignoreSuggestion(kanji);
    } catch (err) {
      console.error('Error ignoring suggestion:', err);
    }
  };

  const filteredEntries = searchQuery ? searchEntries(searchQuery) : (registry?.entries || []);

  return (
    <div className="min-h-screen pt-24 pb-8 px-4" style={{ color: COLORS.INK }}>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-mincho font-bold text-3xl mb-2">Ruby Registry</h1>
          <p className="text-sm" style={{ color: COLORS.SECONDARY }}>
            Character name readings and special vocabulary lookups
          </p>
        </div>

        {/* Book Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2" style={{ color: COLORS.SECONDARY_DARK }}>
            Select Book
          </label>
          <select
            value={selectedBook?.label || ''}
            onChange={(e) => {
              const book = books.find(b => b.label === e.target.value);
              setSelectedBook(book || null);
            }}
            className="w-full p-3 border focus:outline-none focus:ring-2"
            style={INPUT_STYLE}
          >
            <option value="">Select a book...</option>
            {books.map((book) => (
              <option key={book.label} value={book.label}>
                {book.label}
              </option>
            ))}
          </select>
        </div>

        {selectedBook && (
          <>
            {/* Search and Add */}
            <div className="flex gap-4 mb-6">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search entries..."
                className="flex-1 p-3 border focus:outline-none focus:ring-2"
                style={INPUT_STYLE}
              />
              <button
                onClick={() => {
                  setShowAddForm(true);
                  setEditingEntry(null);
                  setFormData({ kanji: '', reading: '', note: '' });
                }}
                className="min-h-11 px-5 text-sm font-bold interactive-btn"
                style={{ backgroundColor: COLORS.PRIMARY, color: COLORS.SURFACE }}
              >
                + Add Entry
              </button>
            </div>

            {/* Add/Edit Form */}
            {showAddForm && (
              <div
                className="mb-6 p-4 border"
                style={{ borderColor: COLORS.NEUTRAL, backgroundColor: COLORS.SURFACE }}
              >
                <h3 className="font-bold mb-4">
                  {editingEntry ? 'Edit Entry' : 'Add New Entry'}
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm mb-1" style={{ color: COLORS.SECONDARY }}>Kanji</label>
                      <input
                        type="text"
                        value={formData.kanji}
                        onChange={(e) => setFormData({ ...formData, kanji: e.target.value })}
                        className="w-full p-2 border focus:outline-none focus:ring-2 disabled:opacity-50"
                        style={INPUT_STYLE}
                        placeholder="e.g., 月"
                        disabled={!!editingEntry}
                      />
                    </div>
                    <div>
                      <label className="block text-sm mb-1" style={{ color: COLORS.SECONDARY }}>Reading</label>
                      <input
                        type="text"
                        value={formData.reading}
                        onChange={(e) => setFormData({ ...formData, reading: e.target.value })}
                        className="w-full p-2 border focus:outline-none focus:ring-2"
                        style={INPUT_STYLE}
                        placeholder="e.g., るな"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm mb-1" style={{ color: COLORS.SECONDARY }}>Note (optional)</label>
                    <input
                      type="text"
                      value={formData.note}
                      onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                      className="w-full p-2 border focus:outline-none focus:ring-2"
                      style={INPUT_STYLE}
                      placeholder="e.g., main character"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="min-h-11 px-5 text-sm font-bold interactive-btn"
                      style={{ backgroundColor: COLORS.PRIMARY, color: COLORS.SURFACE }}
                    >
                      {editingEntry ? 'Update' : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddForm(false);
                        setEditingEntry(null);
                      }}
                      className="min-h-11 px-5 text-sm border interactive-page-btn"
                      style={{ borderColor: COLORS.INK }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Loading / Error */}
            {isLoading && (
              <div className="text-center py-8 text-sm" style={{ color: COLORS.SECONDARY }}>Loading...</div>
            )}
            {error && (
              <div
                className="p-4 border text-sm mb-6"
                style={{
                  backgroundColor: toTint(COLORS.DANGER, 7),
                  borderColor: COLORS.DANGER,
                  color: COLORS.DANGER,
                }}
              >
                {error.message}
              </div>
            )}

            {/* Entries List */}
            {!isLoading && registry && (
              <>
                <div className="mb-4">
                  <h2 className="font-mincho font-bold text-lg">
                    Entries ({filteredEntries.length})
                  </h2>
                </div>

                {filteredEntries.length === 0 ? (
                  <div className="text-center py-8 text-sm" style={{ color: COLORS.SECONDARY }}>
                    {searchQuery ? 'No matching entries found' : 'No entries yet'}
                  </div>
                ) : (
                  <div className="space-y-2 mb-8">
                    {filteredEntries.map((entry) => (
                      <div
                        key={entry.kanji}
                        className="flex items-center justify-between p-3 border"
                        style={{ borderColor: COLORS.NEUTRAL, backgroundColor: COLORS.SURFACE }}
                      >
                        <div className="flex items-center gap-4">
                          <span className="font-mincho font-bold text-xl">
                            {entry.kanji}
                          </span>
                          <span className="font-mincho text-lg">{entry.reading}</span>
                          {entry.note && (
                            <span className="text-sm" style={{ color: COLORS.SECONDARY }}>({entry.note})</span>
                          )}
                          <span
                            className="text-xs px-2 py-0.5 border"
                            style={{
                              borderColor: entry.source === 'epub' ? COLORS.NEUTRAL : COLORS.PRIMARY,
                              color: entry.source === 'epub' ? COLORS.SECONDARY : COLORS.PRIMARY,
                            }}
                          >
                            {entry.source}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(entry)}
                            className="px-3 py-1 text-sm cursor-pointer interactive-link"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(entry.kanji)}
                            className="px-3 py-1 text-sm cursor-pointer interactive-link"
                            style={{ color: COLORS.DANGER }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Suggestions */}
                {registry.suggestions.length > 0 && !searchQuery && (
                  <>
                    <div className="mb-4">
                      <h2 className="font-mincho font-bold text-lg">
                        Suggestions ({registry.suggestions.length})
                      </h2>
                      <p className="text-sm" style={{ color: COLORS.SECONDARY }}>
                        Frequent kanji compounds without readings - click to add
                      </p>
                    </div>

                    <div className="space-y-2">
                      {registry.suggestions.map((suggestion) => (
                        <div
                          key={suggestion.kanji}
                          className="flex items-center justify-between p-3 border"
                          style={{ borderColor: COLORS.NEUTRAL, backgroundColor: COLORS.BASE }}
                        >
                          <div className="flex items-center gap-4">
                            <span className="font-mincho text-xl">{suggestion.kanji}</span>
                            <span className="text-sm" style={{ color: COLORS.SECONDARY }}>
                              ({suggestion.occurrences} occurrences)
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAddSuggestion(suggestion.kanji)}
                              className="px-3 py-1 text-sm font-bold border interactive-page-btn"
                              style={{ borderColor: COLORS.INK }}
                            >
                              Add Reading
                            </button>
                            <button
                              onClick={() => handleIgnoreSuggestion(suggestion.kanji)}
                              className="px-3 py-1 text-sm cursor-pointer interactive-link"
                              style={{ color: COLORS.SECONDARY }}
                            >
                              Ignore
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* Back Link */}
        <div className="mt-8 pt-4 border-t" style={{ borderColor: COLORS.NEUTRAL }}>
          <Link
            href="/library"
            className="text-sm hover:underline"
            style={{ color: COLORS.SECONDARY }}
          >
            Back to Library
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function RubyRegistryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-24 pb-8 px-4 text-center">Loading...</div>}>
      <RubyRegistryContent />
    </Suspense>
  );
}
