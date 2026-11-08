/**
 * Import bookmarks to local PostgreSQL
 *
 * Run this script AFTER deploying to AWS Lightsail to import your bookmarks.
 *
 * Prerequisites:
 * - Have bookmarks-export.json in the same directory
 * - Have DATABASE_URL environment variable set
 *
 * Usage:
 *   npx tsx scripts/import-bookmarks.ts
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import postgres from 'postgres';

interface BookmarkRow {
  file_name: string;
  directory: string;
  bookmark_text: string;
}

interface TextEntryRow {
  file_name: string;
  directory: string;
  content: string;
}

interface ExportData {
  exportedAt: string;
  source: string;
  bookmarks: BookmarkRow[];
  textEntries: TextEntryRow[];
}

async function importBookmarks() {
  console.log('[IMPORT] Importing bookmarks to local PostgreSQL...\n');

  // Check for export file
  const exportPath = join(__dirname, 'bookmarks-export.json');
  if (!existsSync(exportPath)) {
    console.error('[ERROR] Export file not found:', exportPath);
    console.error('   Run export-vercel-bookmarks.ts first, then copy the file here.');
    process.exit(1);
  }

  // Read export data
  const exportData: ExportData = JSON.parse(readFileSync(exportPath, 'utf-8'));
  console.log(`[FILE] Found export from ${exportData.exportedAt}`);
  console.log(`   Bookmarks: ${exportData.bookmarks.length}`);
  console.log(`   Text entries: ${exportData.textEntries.length}\n`);

  // Connect to local database
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
  if (!connectionString) {
    console.error('[ERROR] No DATABASE_URL or POSTGRES_URL found');
    process.exit(1);
  }

  const sql = postgres(connectionString);

  try {
    // Ensure tables exist
    console.log('[TABLES] Ensuring tables exist...');
    await sql`
      CREATE TABLE IF NOT EXISTS bookmarks (
        id SERIAL PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        directory VARCHAR(255) DEFAULT '',
        bookmark_text TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(file_name, directory)
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS text_entries (
        id SERIAL PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        directory VARCHAR(255) DEFAULT '',
        content TEXT DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(file_name, directory)
      )
    `;

    // Import bookmarks
    console.log('[BOOKMARKS] Importing bookmarks...');
    let bookmarkCount = 0;
    for (const bookmark of exportData.bookmarks) {
      await sql`
        INSERT INTO bookmarks (file_name, directory, bookmark_text)
        VALUES (${bookmark.file_name}, ${bookmark.directory || ''}, ${bookmark.bookmark_text || ''})
        ON CONFLICT (file_name, directory)
        DO UPDATE SET bookmark_text = ${bookmark.bookmark_text || ''}, bookmark_page = NULL, updated_at = CURRENT_TIMESTAMP
      `;
      bookmarkCount++;
    }
    console.log(`   Imported ${bookmarkCount} bookmarks`);

    // Import text entries
    console.log('[TEXT] Importing text entries...');
    let textEntryCount = 0;
    for (const entry of exportData.textEntries) {
      await sql`
        INSERT INTO text_entries (file_name, directory, content)
        VALUES (${entry.file_name}, ${entry.directory || ''}, ${entry.content || ''})
        ON CONFLICT (file_name, directory)
        DO UPDATE SET content = ${entry.content || ''}, updated_at = CURRENT_TIMESTAMP
      `;
      textEntryCount++;
    }
    console.log(`   Imported ${textEntryCount} text entries`);

    console.log('\n[OK] Import complete!');

    await sql.end();
  } catch (error) {
    console.error('[ERROR] Import failed:', error);
    await sql.end();
    process.exit(1);
  }
}

importBookmarks();
