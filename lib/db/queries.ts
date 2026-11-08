import { sql } from './connection';
import type { Bookmark, TextEntry, QueryResult } from './schema';

function normalizeResult<T>(result: QueryResult<T>): T[] {
  if (result && 'rows' in result && Array.isArray(result.rows)) {
    return result.rows;
  }
  if (Array.isArray(result)) {
    return result;
  }
  return [];
}

export async function getBookmark(
  fileName: string,
  directory: string = 'public'
): Promise<string> {
  try {
    const result = await sql<Pick<Bookmark, 'bookmark_text'>>`
      SELECT bookmark_text
      FROM bookmarks
      WHERE file_name = ${fileName} AND directory = ${directory}
    `;

    const rows = normalizeResult(result);
    if (rows.length === 0) {
      return '';
    }

    return rows[0].bookmark_text;
  } catch (error) {
    console.error('Error fetching bookmark:', error);
    throw error;
  }
}

export async function upsertBookmark(
  fileName: string,
  bookmarkText: string,
  directory: string = 'public',
  _bookmarkPage?: number
): Promise<void> {
  try {
    await sql`
      INSERT INTO bookmarks (file_name, directory, bookmark_text, updated_at)
      VALUES (${fileName}, ${directory}, ${bookmarkText}, CURRENT_TIMESTAMP)
      ON CONFLICT (file_name, directory)
      DO UPDATE SET
        bookmark_text = ${bookmarkText},
        bookmark_page = NULL,
        updated_at = CURRENT_TIMESTAMP
    `;
  } catch (error) {
    console.error('Error upserting bookmark:', error);
    throw error;
  }
}

export async function initializeBookmarksForFiles(
  fileNames: string[],
  directory: string = 'public'
): Promise<void> {
  try {
    const existing = await sql<Pick<Bookmark, 'file_name'>>`
      SELECT file_name FROM bookmarks WHERE directory = ${directory}
    `;

    const rows = normalizeResult(existing);
    const existingFiles = new Set(rows.map((row) => row.file_name));

    for (const fileName of fileNames) {
      if (!existingFiles.has(fileName)) {
        await sql`
          INSERT INTO bookmarks (file_name, directory, bookmark_text)
          VALUES (${fileName}, ${directory}, '')
          ON CONFLICT (file_name, directory) DO NOTHING
        `;
      }
    }
  } catch (error) {
    console.error('Error initializing bookmarks:', error);
    throw error;
  }
}

export async function getTextEntry(
  fileName: string,
  directory: string = 'public'
): Promise<string> {
  try {
    const result = await sql<Pick<TextEntry, 'content'>>`
      SELECT content
      FROM text_entries
      WHERE file_name = ${fileName} AND directory = ${directory}
    `;

    const rows = normalizeResult(result);
    if (rows.length === 0) {
      return '';
    }

    return rows[0].content;
  } catch (error) {
    console.error('Error fetching text entry:', error);
    throw error;
  }
}


export async function upsertTextEntry(
  fileName: string,
  content: string,
  directory: string = 'public'
): Promise<void> {
  try {
    await sql`
      INSERT INTO text_entries (file_name, directory, content, created_at, updated_at)
      VALUES (${fileName}, ${directory}, ${content}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (file_name, directory)
      DO UPDATE SET
        content = ${content},
        updated_at = CURRENT_TIMESTAMP
    `;
  } catch (error) {
    console.error('Error upserting text entry:', error);
    throw error;
  }
}

export async function deleteTextEntry(
  fileName: string,
  directory: string = 'public'
): Promise<void> {
  try {
    await sql`
      DELETE FROM text_entries
      WHERE file_name = ${fileName} AND directory = ${directory}
    `;
  } catch (error) {
    console.error('Error deleting text entry:', error);
    throw error;
  }
}

export async function getAllTextEntries(): Promise<{
  directories: string[];
  filesByDirectory: Record<string, string[]>;
}> {
  try {
    const result = await sql<Pick<TextEntry, 'directory' | 'file_name'>>`
      SELECT DISTINCT directory, file_name
      FROM text_entries
      ORDER BY directory, file_name
    `;

    const rows = normalizeResult(result);
    const filesByDirectory: Record<string, string[]> = {};
    const directoriesSet = new Set<string>();

    rows.forEach((row) => {
      const dir = row.directory;
      const fileName = row.file_name;

      directoriesSet.add(dir);

      if (!filesByDirectory[dir]) {
        filesByDirectory[dir] = [];
      }
      filesByDirectory[dir].push(fileName);
    });

    const directories = Array.from(directoriesSet).sort((a, b) => {
      if (a === 'bookv2-furigana') return -1;
      if (b === 'bookv2-furigana') return 1;
      return a.localeCompare(b);
    });

    return {
      directories,
      filesByDirectory,
    };
  } catch (error) {
    console.error('Error fetching all text entries:', error);
    throw error;
  }
}

export async function getTextEntriesInDirectory(
  directory: string
): Promise<string[]> {
  try {
    const result = await sql<Pick<TextEntry, 'file_name'>>`
      SELECT file_name
      FROM text_entries
      WHERE directory = ${directory}
      ORDER BY file_name
    `;

    const rows = normalizeResult(result);
    return rows.map((row) => row.file_name);
  } catch (error) {
    console.error('Error fetching text entries in directory:', error);
    throw error;
  }
}

export async function cleanupTextEntries(
  existingFileNames: string[],
  directory: string = 'public'
): Promise<number> {
  try {
    const result = await sql`
      DELETE FROM text_entries
      WHERE directory = ${directory}
      AND file_name != ALL(${existingFileNames})
      RETURNING id
    `;

    const rows = normalizeResult(result);
    return rows.length;
  } catch (error) {
    console.error('Error cleaning up text entries:', error);
    throw error;
  }
}

export async function syncTextEntries(
  autoAdd: boolean = false
): Promise<{ removed: number; added: number }> {
  try {
    const { listTextFiles, readTextFile } = await import('@/lib/services/fileService');
    const { directories, filesByDirectory } = await listTextFiles();

    let totalRemoved = 0;
    let totalAdded = 0;

    for (const directory of directories) {
      const filesInDir = filesByDirectory[directory] || [];
      const removed = await cleanupTextEntries(filesInDir, directory);
      totalRemoved += removed;

      if (autoAdd) {
        const existingFiles = await getTextEntriesInDirectory(directory);
        const existingSet = new Set(existingFiles);

        for (const fileName of filesInDir) {
          if (!existingSet.has(fileName)) {
            const filePath = directory ? `${directory}/${fileName}` : fileName;
            const content = await readTextFile(filePath);
            if (content) {
              await upsertTextEntry(fileName, content, directory);
              totalAdded++;
              console.log(`Added new text entry: ${directory}/${fileName}`);
            }
          }
        }
      }
    }

    return { removed: totalRemoved, added: totalAdded };
  } catch (error) {
    console.error('Error syncing text entries:', error);
    throw error;
  }
}

export async function backfillTextMetadata(): Promise<number> {
  return 0;
}

export async function resetTextEntries(): Promise<number> {
  try {
    const result = await sql`
      DELETE FROM text_entries
      RETURNING id
    `;

    const rows = normalizeResult(result);
    return rows.length;
  } catch (error) {
    console.error('Error resetting text entries:', error);
    throw error;
  }
}
