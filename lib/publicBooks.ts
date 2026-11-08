/**
 * Public (guest-accessible) book allowlist.
 *
 * These few books are readable without signing in, capped to a short page
 * preview to respect copyright. This is the single source of truth consulted
 * by the page-route middleware and by the content API routes.
 */

export interface PublicBook {
  directory: string;
  fileName: string;
  maxPreviewPages: number;
}

export const DEFAULT_PREVIEW_PAGES = 5;

export const PUBLIC_BOOKS: readonly PublicBook[] = [
  {
    directory: 'bookv2-furigana/アドラー心理学を職場に取り入れてみた アドラー心理学を実践で学ぶ',
    fileName: 'アドラー心理学を職場に取り入れてみた アドラー心理学を実践で学ぶ-rephrase-furigana',
    maxPreviewPages: DEFAULT_PREVIEW_PAGES,
  },
  {
    directory: 'bookv2-furigana/幼女戦記 1 Deus lo vult',
    fileName: '幼女戦記 1 Deus lo vult-rephrase-furigana',
    maxPreviewPages: DEFAULT_PREVIEW_PAGES,
  },
  {
    directory: 'bookv2-furigana/いま悩む人への「禅語」～あなたに必要なすべてがあります～',
    fileName: 'いま悩む人への「禅語」～あなたに必要なすべてがあります～-rephrase-furigana',
    maxPreviewPages: DEFAULT_PREVIEW_PAGES,
  },
];

function publicBookPath(book: PublicBook): string {
  return `${book.directory}/${book.fileName}`;
}

export function findPublicBook(
  directory: string | null | undefined,
  fileName: string | null | undefined
): PublicBook | null {
  if (!directory || !fileName) return null;
  return (
    PUBLIC_BOOKS.find(
      (book) => book.directory === directory && book.fileName === fileName
    ) || null
  );
}

/**
 * Match a book by its combined "directory/fileName" path. The reader fetches
 * content with the two parts joined, so API routes resolve the book this way.
 */
export function findPublicBookByPath(
  fullPath: string | null | undefined
): PublicBook | null {
  if (!fullPath) return null;
  return PUBLIC_BOOKS.find((book) => publicBookPath(book) === fullPath) || null;
}

/**
 * Whether a book asset path (an illustration or the metadata JSON, laid out as
 * `/<directory>/...`) belongs to a preview book, so a guest may load it.
 */
export function isPublicBookAsset(assetPath: string): boolean {
  return PUBLIC_BOOKS.some((book) => assetPath.startsWith(`/${book.directory}/`));
}

export function isPublicDirectory(directory: string | null | undefined): boolean {
  if (!directory) return false;
  return PUBLIC_BOOKS.some((book) => book.directory === directory);
}
