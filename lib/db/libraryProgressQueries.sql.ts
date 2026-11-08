import { sql } from './connection';
import type { QueryResult } from './schema';
import { parseMarkdown } from '@/lib/utils/markdownParser';
import { stripFurigana } from '@/lib/utils/furiganaParser';
import { READER_CONFIG, PAGINATION_CONFIG } from '@/lib/constants';

/**
 * Per-book data for the library cards, without reading the books' text.
 *
 * All book text together is tens of MB, so the counts the cards need are cached in
 * text_entries.total_pages / total_characters and bookmarks.bookmark_page. A book's
 * cache is stale when its stored length differs from char_length(content) (any edit
 * or appended chunk changes it) or when its bookmark moved (upsertBookmark clears
 * bookmark_page). Only stale books' text is fetched, recounted and written back.
 */
export interface LibraryRow {
  id: number;
  file_name: string;
  directory: string;
  created_at: string;
  total_pages: number | null;
  total_characters: number | null;
  content_length: number;
  bookmark_text: string | null;
  bookmark_page: number | null;
  bookmark_updated_at: string | null;
}

interface ContentRow {
  id: number;
  content: string;
  content_length: number;
}

// Records "computed, but the bookmark text is not in the book" so it is not retried.
const BOOKMARK_NOT_FOUND = 0;

function rowsOf<T>(result: QueryResult<T>): T[] {
  const rows: unknown = result && 'rows' in result && Array.isArray(result.rows) ? result.rows : result;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

function isRephraseContent(content: string): boolean {
  return content.includes('>>') && content.includes('<');
}

function readerItems(content: string): { head?: string; text?: string }[] {
  if (isRephraseContent(content)) {
    return parseMarkdown(content);
  }
  return content
    .split(READER_CONFIG.PARAGRAPH_SPLIT_PATTERN)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0)
    .map((paragraph) => ({ text: paragraph }));
}

function normalizeItemText(text: string): string {
  return stripFurigana(text).replace(/[\r\n]/g, '').trim();
}

function bookmarkPageOf(bookmarkText: string, items: { head?: string; text?: string }[]): number {
  const normalizedBookmark = normalizeItemText(bookmarkText);
  if (!normalizedBookmark) return BOOKMARK_NOT_FOUND;
  const itemIndex = items.findIndex((item) => normalizeItemText(item.head || item.text || '') === normalizedBookmark);
  if (itemIndex === -1) return BOOKMARK_NOT_FOUND;
  return Math.floor(itemIndex / PAGINATION_CONFIG.ITEMS_PER_PAGE) + 1;
}

function hasStaleTextCounts(row: LibraryRow): boolean {
  return row.total_characters !== row.content_length;
}

function needsBookmarkPage(row: LibraryRow, isSignedIn: boolean): boolean {
  if (!isSignedIn || !row.bookmark_text) return false;
  return row.bookmark_page === null || hasStaleTextCounts(row);
}

function recountRow(row: LibraryRow, content: ContentRow, isSignedIn: boolean): LibraryRow {
  const items = readerItems(content.content);
  return {
    ...row,
    total_pages: Math.ceil(items.length / PAGINATION_CONFIG.ITEMS_PER_PAGE),
    total_characters: content.content_length,
    content_length: content.content_length,
    bookmark_page: needsBookmarkPage(row, isSignedIn)
      ? bookmarkPageOf(row.bookmark_text ?? '', items)
      : row.bookmark_page,
  };
}

async function saveRecountedRows(recounted: LibraryRow[], bookmarkRows: LibraryRow[]): Promise<void> {
  await sql`
    UPDATE text_entries AS t
    SET total_pages = u.total_pages, total_characters = u.total_characters
    FROM unnest(
      ${recounted.map((row) => row.id)}::int[],
      ${recounted.map((row) => row.total_pages)}::int[],
      ${recounted.map((row) => row.total_characters)}::int[]
    ) AS u(id, total_pages, total_characters)
    WHERE t.id = u.id
  `;
  if (bookmarkRows.length === 0) return;
  await sql`
    UPDATE bookmarks AS b
    SET bookmark_page = u.bookmark_page
    FROM unnest(
      ${bookmarkRows.map((row) => row.file_name)}::text[],
      ${bookmarkRows.map((row) => row.directory)}::text[],
      ${bookmarkRows.map((row) => row.bookmark_page)}::int[]
    ) AS u(file_name, directory, bookmark_page)
    WHERE b.file_name = u.file_name AND b.directory = u.directory
  `;
}

async function refreshStaleRows(rows: LibraryRow[], isSignedIn: boolean): Promise<LibraryRow[]> {
  const staleRows = rows.filter((row) => hasStaleTextCounts(row) || needsBookmarkPage(row, isSignedIn));
  if (staleRows.length === 0) return rows;

  const contentRows = rowsOf<ContentRow>(await sql`
    SELECT id, content, char_length(content) AS content_length
    FROM text_entries
    WHERE id = ANY(${staleRows.map((row) => row.id)}::int[])
  `);
  const contentById = new Map(contentRows.map((content) => [content.id, content]));
  const recounted = staleRows
    .filter((row) => contentById.has(row.id))
    .map((row) => recountRow(row, contentById.get(row.id) as ContentRow, isSignedIn));
  const recountedById = new Map(recounted.map((row) => [row.id, row]));
  const bookmarkRows = staleRows
    .filter((row) => needsBookmarkPage(row, isSignedIn) && recountedById.has(row.id))
    .map((row) => recountedById.get(row.id) as LibraryRow);

  await saveRecountedRows(recounted, bookmarkRows);
  return rows.map((row) => recountedById.get(row.id) ?? row);
}

/**
 * Library rows with up-to-date page counts, and bookmark pages when signed in.
 * `isVisible` limits which books are returned (and therefore recounted).
 */
export async function getLibraryRows(
  isSignedIn: boolean,
  isVisible: (row: LibraryRow) => boolean
): Promise<LibraryRow[]> {
  const rows = rowsOf<LibraryRow>(await sql`
    SELECT
      t.id, t.file_name, t.directory, t.created_at, t.total_pages, t.total_characters,
      char_length(t.content) AS content_length,
      b.bookmark_text, b.bookmark_page, b.updated_at AS bookmark_updated_at
    FROM text_entries t
    LEFT JOIN bookmarks b ON t.file_name = b.file_name AND t.directory = b.directory
  `);
  return refreshStaleRows(rows.filter(isVisible), isSignedIn);
}
