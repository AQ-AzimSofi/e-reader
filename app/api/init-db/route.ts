import { sql } from '@/lib/db/connection';
import { NextResponse } from 'next/server';
import { CREATE_TABLES_SQL } from '@/lib/db/schema';

const MIGRATIONS_SQL = `
  ALTER TABLE text_entries ADD COLUMN IF NOT EXISTS total_pages INT DEFAULT 0;
  ALTER TABLE text_entries ADD COLUMN IF NOT EXISTS total_characters INT DEFAULT 0;
  -- Size the cached page counts were computed at; NULL means not yet counted.
  ALTER TABLE text_entries ADD COLUMN IF NOT EXISTS content_bytes INT;
  -- Add updated_at with no default first so existing rows stay NULL, seed them
  -- from created_at (guarded by IS NULL so repeat init-db calls never overwrite
  -- real write times), then set the default for future inserts. A plain
  -- ADD COLUMN ... DEFAULT CURRENT_TIMESTAMP would instead stamp every existing
  -- row with the ALTER time, making one DB look uniformly newer than the other
  -- and pushing/pulling all content the wrong way on the first sync.
  ALTER TABLE text_entries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
  UPDATE text_entries SET updated_at = created_at WHERE updated_at IS NULL;
  ALTER TABLE text_entries ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
`;

export async function GET() {
  try {
    const execSql = typeof sql.unsafe === 'function'
      ? sql.unsafe.bind(sql)
      : typeof sql.query === 'function'
        ? sql.query.bind(sql)
        : null;

    if (!execSql) throw new Error('Unsupported database client');

    await execSql(CREATE_TABLES_SQL);
    await execSql(MIGRATIONS_SQL);

    return NextResponse.json({
      message: 'Database tables created successfully',
      success: true,
    });
  } catch (error) {
    console.error('Database initialization error:', error);
    return NextResponse.json(
      {
        message: 'Failed to initialize database',
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
      },
      { status: 500 }
    );
  }
}
