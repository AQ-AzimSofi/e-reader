import { NextResponse } from 'next/server';
import { isAuthenticated } from '@/lib/auth/apiSession';
import { findPublicBook } from '@/lib/publicBooks';
import { getLibraryRows, type LibraryRow } from '@/lib/db/libraryProgressQueries.sql';

export const dynamic = 'force-dynamic';

interface BookProgress {
  progress: number;
  totalCharacters: number;
  bookmarkPage: number | null;
  totalPages: number;
  bookmarkUpdatedAt: string | null;
  createdAt: string | null;
}

interface ProgressResponse {
  [key: string]: BookProgress;
}

function toBookProgress(row: LibraryRow, isSignedIn: boolean): BookProgress {
  const fullPages = row.total_pages ?? 0;
  // Guests only see the preview, so their card reflects the capped page count
  // and does not disclose the full work's length.
  const previewBook = isSignedIn ? null : findPublicBook(row.directory, row.file_name);
  const totalPages = previewBook ? Math.min(fullPages, previewBook.maxPreviewPages) : fullPages;
  const bookmarkPage = isSignedIn ? row.bookmark_page || null : null;
  return {
    progress: bookmarkPage && totalPages > 0 ? (bookmarkPage / totalPages) * 100 : 0,
    totalCharacters: previewBook ? 0 : row.total_characters ?? 0,
    bookmarkPage,
    totalPages,
    bookmarkUpdatedAt: isSignedIn ? row.bookmark_updated_at || null : null,
    createdAt: row.created_at || null,
  };
}

export async function GET() {
  try {
    const isSignedIn = await isAuthenticated();
    // Guests only see allowlisted books, and never the owner's reading position.
    const rows = await getLibraryRows(
      (row) => isSignedIn || findPublicBook(row.directory, row.file_name) !== null
    );
    const progressData: ProgressResponse = Object.fromEntries(
      rows.map((row) => [`${row.directory}/${row.file_name}`, toBookProgress(row, isSignedIn)])
    );
    return NextResponse.json(progressData);
  } catch (error) {
    console.error('Error fetching library progress:', error);
    return NextResponse.json({ error: 'Failed to fetch library progress' }, { status: 500 });
  }
}
