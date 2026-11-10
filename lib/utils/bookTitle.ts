export function formatBookTitle(fileName: string): string {
  return fileName
    .replace(/-rephrase-furigana$/, '')
    .replace(/-rephrase$/, '')
    .replace(/-furigana$/, '')
    .replace(/-/g, ' ')
    .replace(/^\w/, firstLetter => firstLetter.toUpperCase());
}
