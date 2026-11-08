import { sql } from './connection';
import type { QueryResult } from './schema';
import { stripFurigana } from '@/lib/utils/furiganaParser';
import { parseReaderItems, type ReaderItem } from '@/lib/utils/buildPlayableUnits';
import { PAGINATION_CONFIG } from '@/lib/constants';

/**
 * Per-book data for the library cards, without reading the books' text.
 *
 * All book text together is tens of MB, so the counts the cards need are cached in
 * text_entries.total_pages / total_characters and bookmarks.bookmark_page. A book's
 * cache is stale when text_entries.content_bytes (the size it was counted at) differs
 * from octet_length(content): any edit or appended chunk changes the size, and
 * octet_length reads it without decompressing the text, unlike char_length. A moved
 * bookmark is stale because upsertBookmark clears bookmark_page. Only stale books'
 * text is fetched, recounted and written back.
 */
export interface LibraryRow {
  id: number;
  file_name: string;
  directory: string;
  created_at: string;
  total_pages: number | null;
  total_characters: number | null;
  content_bytes: number | null;
  current_bytes: number;
  bookmark_text: string | null;
  bookmark_page: number | null;
  bookmark_updated_at: string | null;
}

interface ContentRow {
  id: number;
  content: string;
  character_count: number;
  byte_count: number;
}

// Records "computed, but the bookmark text is not in the book" so it is not retried.
const BOOKMARK_NOT_FOUND = 0;

function normalizeResult<T>(result: QueryResult<T>): T[] {
  const rows: unknown = result && 'rows' in result && Array.isArray(result.rows) ? result.rows : result;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

function normalizeItemText(text: string): string {
  return stripFurigana(text).replace(/[\r\n]/g, '').trim();
}

function bookmarkPageOf(bookmarkText: string, items: ReaderItem[]): number {
  const normalizedBookmark = normalizeItemText(bookmarkText);
  if (!normalizedBookmark) return BOOKMARK_NOT_FOUND;
  const itemIndex = items.findIndex(
    (item) => normalizeItemText('head' in item ? item.head : item.text) === normalizedBookmark
  );
  if (itemIndex === -1) return BOOKMARK_NOT_FOUND;
  return Math.floor(itemIndex / PAGINATION_CONFIG.ITEMS_PER_PAGE) + 1;
}

function hasStaleTextCounts(row: LibraryRow): boolean {
  return row.content_bytes !== row.current_bytes;
}

// Recomputed whenever the text is recounted, even on a guest's request: recounting
// refreshes content_bytes, which would otherwise hide that the bookmark page is stale.
function needsBookmarkPage(row: LibraryRow): boolean {
  if (!row.bookmark_text) return false;
  return row.bookmark_page === null || hasStaleTextCounts(row);
}

function recountRow(row: LibraryRow, content: ContentRow): LibraryRow {
  const items = parseReaderItems(content.content);
  return {
    ...row,
    total_pages: Math.ceil(items.length / PAGINATION_CONFIG.ITEMS_PER_PAGE),
    total_characters: content.character_count,
    content_bytes: content.byte_count,
    current_bytes: content.byte_count,
    bookmark_page: needsBookmarkPage(row) ? bookmarkPageOf(row.bookmark_text ?? '', items) : row.bookmark_page,
  };
}

async function saveRecountedRows(recounted: LibraryRow[], bookmarkRows: LibraryRow[]): Promise<void> {
  await sql`
    UPDATE text_entries AS t
    SET total_pages = u.total_pages, total_characters = u.total_characters, content_bytes = u.content_bytes
    FROM unnest(
      ${recounted.map((row) => row.id)}::int[],
      ${recounted.map((row) => row.total_pages)}::int[],
      ${recounted.map((row) => row.total_characters)}::int[],
      ${recounted.map((row) => row.content_bytes)}::int[]
    ) AS u(id, total_pages, total_characters, content_bytes)
    WHERE t.id = u.id
  `;
  if (bookmarkRows.length === 0) return;
  // Matching bookmark_text skips a bookmark that moved while this request ran, so
  // the page of its old position never overwrites the NULL upsertBookmark set.
  await sql`
    UPDATE bookmarks AS b
    SET bookmark_page = u.bookmark_page
    FROM unnest(
      ${bookmarkRows.map((row) => row.file_name)}::text[],
      ${bookmarkRows.map((row) => row.directory)}::text[],
      ${bookmarkRows.map((row) => row.bookmark_text)}::text[],
      ${bookmarkRows.map((row) => row.bookmark_page)}::int[]
    ) AS u(file_name, directory, bookmark_text, bookmark_page)
    WHERE b.file_name = u.file_name AND b.directory = u.directory AND b.bookmark_text = u.bookmark_text
  `;
}

async function refreshStaleRows(rows: LibraryRow[]): Promise<LibraryRow[]> {
  const staleRows = rows.filter((row) => hasStaleTextCounts(row) || needsBookmarkPage(row));
  if (staleRows.length === 0) return rows;

  const contentRows = normalizeResult<ContentRow>(await sql`
    SELECT id, content, char_length(content) AS character_count, octet_length(content) AS byte_count
    FROM text_entries
    WHERE id = ANY(${staleRows.map((row) => row.id)}::int[])
  `);
  const contentById = new Map(contentRows.map((content) => [content.id, content]));
  const recounted = staleRows
    .filter((row) => contentById.has(row.id))
    .map((row) => recountRow(row, contentById.get(row.id) as ContentRow));
  const recountedById = new Map(recounted.map((row) => [row.id, row]));
  const bookmarkRows = staleRows
    .filter((row) => needsBookmarkPage(row) && recountedById.has(row.id))
    .map((row) => recountedById.get(row.id) as LibraryRow);

  await saveRecountedRows(recounted, bookmarkRows);
  return rows.map((row) => recountedById.get(row.id) ?? row);
}

/**
 * Library rows with up-to-date page counts and bookmark pages. `isVisible` limits
 * which books are returned (and therefore recounted); callers decide what to expose.
 */
export async function getLibraryRows(isVisible: (row: LibraryRow) => boolean): Promise<LibraryRow[]> {
  const rows = normalizeResult<LibraryRow>(await sql`
    SELECT
      t.id, t.file_name, t.directory, t.created_at, t.total_pages, t.total_characters, t.content_bytes,
      octet_length(t.content) AS current_bytes,
      b.bookmark_text, b.bookmark_page, b.updated_at AS bookmark_updated_at
    FROM text_entries t
    LEFT JOIN bookmarks b ON t.file_name = b.file_name AND t.directory = b.directory
  `);
  return refreshStaleRows(rows.filter(isVisible));
}
