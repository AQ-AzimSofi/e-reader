/**
 * Database schema definitions for Vercel Postgres
 */

/**
 * Query result type that handles both Vercel Postgres and standard postgres
 * - Vercel Postgres returns: {rows: T[]}
 * - Standard postgres returns: T[] directly
 */
export type QueryResult<T> = T[] | { rows: T[] };

/**
 * SQL client type compatible with both libraries
 * Using any for values parameter to accommodate both Vercel Postgres and standard postgres
 */
export type SqlClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <T>(strings: TemplateStringsArray, ...values: any[]): Promise<QueryResult<T>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unsafe?: (query: string) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query?: (query: string) => Promise<any>;
};

export interface Bookmark {
  id?: number;
  file_name: string;
  directory: string;
  bookmark_text: string;
  updated_at?: Date;
}

export interface TextEntry {
  id?: number;
  file_name: string;
  directory: string;
  content: string;
  total_pages?: number;
  total_characters?: number;
  created_at?: Date;
}

export interface Book {
  id: string;
  title: string;
  author: string;
  file_name: string;
  text_file_path: string;
  original_epub_name: string;
  created_at: Date;
  updated_at: Date;
}

export interface BookImage {
  id: string;
  book_id: string;
  file_name: string;
  image_path: string;
  order_index: number;
  chapter_name?: string;
  alt_text?: string;
  created_at: Date;
}

export interface ProcessingHistory {
  id: string;
  book_id: string;
  processed_at: Date;
  filter_mode: string;
  hiragana_style: string;
  chapters_count: number;
  file_size: number;
  image_count: number;
}

export interface UserBookmark {
  id: string;
  book_id: string;
  user_id: string;
  bookmark_text: string;
  position?: number;
  created_at: Date;
  updated_at: Date;
}

export interface VocabularyEntry {
  id: string;
  word: string;
  reading?: string;
  sentence: string;
  file_name: string;
  directory: string;
  paragraph_text?: string;
  notes?: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * SQL schema for creating tables
 * Run this in Vercel Postgres dashboard or via migration script
 */
export const CREATE_TABLES_SQL = `
  -- Bookmarks table
  CREATE TABLE IF NOT EXISTS bookmarks (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    directory VARCHAR(255) NOT NULL,
    bookmark_text TEXT NOT NULL,
    bookmark_page INT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(file_name, directory)
  );
  ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS bookmark_page INT;

  -- Create index for faster lookups
  CREATE INDEX IF NOT EXISTS idx_bookmarks_file_directory
    ON bookmarks(file_name, directory);

  -- Text entries table (for user-generated content)
  CREATE TABLE IF NOT EXISTS text_entries (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    directory VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    total_pages INT DEFAULT 0,
    total_characters INT DEFAULT 0,
    content_bytes INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(file_name, directory)
  );

  -- Create index for faster lookups
  CREATE INDEX IF NOT EXISTS idx_text_entries_file_directory
    ON text_entries(file_name, directory);

  -- Narration table (audiobook recording paired with one text variant)
  -- Holds the S3 object key rather than a URL: the recording is private, so the
  -- API signs a short-lived URL per request instead of storing a durable one.
  CREATE TABLE IF NOT EXISTS narration (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR(255) NOT NULL,
    directory VARCHAR(255) NOT NULL,
    audio_key VARCHAR(500) NOT NULL,
    unit_count INT NOT NULL,
    cues JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(file_name, directory)
  );

  CREATE INDEX IF NOT EXISTS idx_narration_file_directory
    ON narration(file_name, directory);

  -- Books table (book metadata from EPUB processing)
  CREATE TABLE IF NOT EXISTS books (
    id VARCHAR(255) PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    author VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) UNIQUE NOT NULL,
    text_file_path VARCHAR(500) NOT NULL,
    original_epub_name VARCHAR(500) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_books_file_name ON books(file_name);

  -- Book images table (images extracted from EPUB)
  CREATE TABLE IF NOT EXISTS book_images (
    id VARCHAR(255) PRIMARY KEY,
    book_id VARCHAR(255) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    order_index INT NOT NULL,
    chapter_name VARCHAR(255),
    alt_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_book_images_book_id ON book_images(book_id);
  CREATE INDEX IF NOT EXISTS idx_book_images_order ON book_images(book_id, order_index);

  -- Processing history table (tracks EPUB processing)
  CREATE TABLE IF NOT EXISTS processing_history (
    id VARCHAR(255) PRIMARY KEY,
    book_id VARCHAR(255) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    filter_mode VARCHAR(50) NOT NULL,
    hiragana_style VARCHAR(50) NOT NULL,
    chapters_count INT NOT NULL,
    file_size INT NOT NULL,
    image_count INT DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_processing_history_book_id ON processing_history(book_id);
  CREATE INDEX IF NOT EXISTS idx_processing_history_processed_at ON processing_history(processed_at);

  -- User bookmarks table (linked to books)
  CREATE TABLE IF NOT EXISTS user_bookmarks (
    id VARCHAR(255) PRIMARY KEY,
    book_id VARCHAR(255) NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    user_id VARCHAR(255) DEFAULT 'default',
    bookmark_text TEXT NOT NULL,
    position INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(book_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_user_bookmarks_book_id ON user_bookmarks(book_id);

  -- Vocabulary entries table (user vocabulary diary)
  CREATE TABLE IF NOT EXISTS vocabulary_entries (
    id VARCHAR(255) PRIMARY KEY,
    word VARCHAR(255) NOT NULL,
    reading VARCHAR(255),
    sentence TEXT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    directory VARCHAR(255) NOT NULL,
    paragraph_text TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_vocabulary_entries_created_at ON vocabulary_entries(created_at);
  CREATE INDEX IF NOT EXISTS idx_vocabulary_entries_word ON vocabulary_entries(word);
  CREATE INDEX IF NOT EXISTS idx_vocabulary_entries_file ON vocabulary_entries(file_name, directory);
`;
