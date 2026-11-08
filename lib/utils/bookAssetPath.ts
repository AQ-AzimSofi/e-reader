import { API_ROUTES } from '@/lib/constants';

const REPHRASE_SUFFIX_PATTERN = /-rephrase(-furigana)?$/;

/**
 * Asset path of a per-book sidecar, shared by every text variant of that book.
 *
 * Both branches resolve to `/<...>/<book>/<book><extension>`; they differ only in
 * where the book folder comes from. For a rephrase file the directory already
 * points at it, so the sidecar sits beside the text file. For an original file
 * the directory is the parent and the book name doubles as the subfolder.
 */
export function bookAssetPath(directory: string, fileName: string, extension: string): string {
  const isRephraseFile = REPHRASE_SUFFIX_PATTERN.test(fileName);
  const baseFileName = fileName.replace(REPHRASE_SUFFIX_PATTERN, '');
  return isRephraseFile
    ? `/${directory}/${baseFileName}${extension}`
    : `/${directory}/${baseFileName}/${baseFileName}${extension}`;
}

/**
 * URL that serves a book asset path (an illustration or the metadata JSON) from
 * the private BookImages bucket. Book files are not deployed with the app.
 */
export function bookAssetUrl(assetPath: string): string {
  return `${API_ROUTES.BOOK_ASSET}?path=${encodeURIComponent(assetPath)}`;
}
