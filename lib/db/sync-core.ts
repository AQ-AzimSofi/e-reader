import { Client } from 'pg';

export type SyncDirection = 'prod -> local' | 'local -> prod';

type IdentityKey =
  | { kind: 'column'; col: string }
  | { kind: 'composite'; cols: readonly [string, string]; sep: string };

type ConflictKey =
  | { kind: 'column'; col: string }
  | { kind: 'composite'; cols: readonly [string, string, ...string[]] };

const FILE_DIR_PAIR = ['file_name', 'directory'] as const;

// Every table in this schema names its surrogate primary key `id`. If that
// assumption ever changes, lift this into a per-table TableConfig field.
const SURROGATE_PK = 'id';

type ConflictStrategy =
  | { kind: 'insert-only' }
  | { kind: 'last-write-wins'; timestampCol: string };

export interface TableConfig {
  name: string;
  conflictKey: ConflictKey;
  orderBy: string;
  identity: IdentityKey;
  strategy: ConflictStrategy;
}

export const TABLES: TableConfig[] = [
  {
    name: '"Book"',
    // Conflict on id (cuid), not fileName: BookImage, UserBookmark, and
    // ProcessingHistory FK to Book.id. Resolving conflicts on fileName would
    // keep the target's id while incoming child rows still reference the
    // source's id, leaving child FK references dangling. In this app's
    // workflow books are only ingested via the EPUB pipeline on a single
    // machine, so cuids stay consistent across DBs and id-conflict is safe.
    conflictKey: { kind: 'column', col: 'id' },
    orderBy: '"createdAt"',
    identity: { kind: 'column', col: '"fileName"' },
    strategy: { kind: 'last-write-wins', timestampCol: '"updatedAt"' },
  },
  {
    name: '"BookImage"',
    conflictKey: { kind: 'column', col: 'id' },
    orderBy: '"createdAt"',
    identity: { kind: 'column', col: '"fileName"' },
    strategy: { kind: 'insert-only' },
  },
  {
    name: '"ProcessingHistory"',
    conflictKey: { kind: 'column', col: 'id' },
    orderBy: '"processedAt"',
    identity: { kind: 'column', col: 'id' },
    strategy: { kind: 'insert-only' },
  },
  {
    name: 'bookmarks',
    conflictKey: { kind: 'composite', cols: FILE_DIR_PAIR },
    orderBy: 'updated_at',
    identity: { kind: 'composite', cols: FILE_DIR_PAIR, sep: '|' },
    strategy: { kind: 'last-write-wins', timestampCol: 'updated_at' },
  },
  {
    name: '"UserBookmark"',
    // userId is technically nullable; Postgres treats NULLs as distinct in
    // unique indexes, so legacy NULL rows would multiply on every sync. The
    // Prisma schema sets a default of "default", so any row inserted via the
    // app is safe — but backfill before sync if NULLs ever appear.
    conflictKey: { kind: 'composite', cols: ['bookId', 'userId'] },
    orderBy: '"updatedAt"',
    identity: { kind: 'column', col: 'id' },
    strategy: { kind: 'last-write-wins', timestampCol: '"updatedAt"' },
  },
  {
    name: 'vocabulary_entries',
    conflictKey: { kind: 'column', col: 'id' },
    orderBy: 'created_at',
    identity: { kind: 'column', col: 'word' },
    strategy: { kind: 'last-write-wins', timestampCol: 'updated_at' },
  },
  {
    name: 'text_entries',
    conflictKey: { kind: 'composite', cols: FILE_DIR_PAIR },
    orderBy: 'created_at',
    identity: { kind: 'composite', cols: FILE_DIR_PAIR, sep: '|' },
    strategy: { kind: 'last-write-wins', timestampCol: 'updated_at' },
  },
];

export function stripQuotes(name: string): string {
  return name.replace(/^"|"$/g, '');
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function getColumns(client: Client, tableName: string): Promise<string[]> {
  const bare = stripQuotes(tableName);
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = $1 AND table_schema = 'public'
     ORDER BY ordinal_position`,
    [bare]
  );
  return result.rows.map((r: { column_name: string }) => r.column_name);
}

async function getCount(client: Client, table: string): Promise<number | null> {
  const bare = stripQuotes(table);
  try {
    const result = await client.query(`SELECT COUNT(*) as count FROM "${bare}"`);
    return parseInt(result.rows[0].count, 10);
  } catch (err) {
    console.error(`[sync-core] getCount(${bare}) failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

function identityQuery(table: TableConfig): string {
  const bare = stripQuotes(table.name);
  const keyExpr = table.identity.kind === 'composite'
    ? `${table.identity.cols[0]} || '${table.identity.sep}' || ${table.identity.cols[1]}`
    : `${table.identity.col}::text`;
  // Only last-write-wins tables can propagate content edits, so only they need a
  // comparable timestamp; insert-only tables report NULL and are never "newer".
  const tsExpr = table.strategy.kind === 'last-write-wins'
    ? `extract(epoch from ${table.strategy.timestampCol})`
    : 'NULL';
  return `SELECT ${keyExpr} as key, ${tsExpr} as updated_at FROM "${bare}"`;
}

async function getIdentitySnapshots(
  client: Client,
  table: TableConfig
): Promise<Map<string, number | null>> {
  try {
    const result = await client.query(identityQuery(table));
    return new Map(
      result.rows.map((r: { key: string; updated_at: string | null }): [string, number | null] => [
        r.key,
        r.updated_at === null ? null : Number(r.updated_at),
      ])
    );
  } catch (err) {
    console.error(
      `[sync-core] getIdentitySnapshots(${stripQuotes(table.name)}) failed:`,
      err instanceof Error ? err.message : err
    );
    return new Map();
  }
}

export interface DiffResult {
  table: string;
  localCount: number | null;
  prodCount: number | null;
  onlyLocal: string[];
  onlyProd: string[];
  localNewer: number;
  prodNewer: number;
}

// Rows present on both sides whose last-write-wins timestamp differs. Identity
// diffs alone miss these, so an edited-in-place row (e.g. a moved bookmark)
// would otherwise look "in sync" and never get pushed.
function countNewer(
  localRows: Map<string, number | null>,
  prodRows: Map<string, number | null>
): { localNewer: number; prodNewer: number } {
  let localNewer = 0;
  let prodNewer = 0;
  for (const [key, localTs] of localRows) {
    const prodTs = prodRows.get(key);
    if (prodTs === undefined || localTs === null || prodTs === null) continue;
    if (localTs > prodTs) localNewer++;
    else if (prodTs > localTs) prodNewer++;
  }
  return { localNewer, prodNewer };
}

export async function computeDiffs(prod: Client, local: Client): Promise<DiffResult[]> {
  const diffs: DiffResult[] = [];
  for (const table of TABLES) {
    const [localCount, prodCount, localRows, prodRows] = await Promise.all([
      getCount(local, table.name),
      getCount(prod, table.name),
      getIdentitySnapshots(local, table),
      getIdentitySnapshots(prod, table),
    ]);
    const { localNewer, prodNewer } = countNewer(localRows, prodRows);
    diffs.push({
      table: stripQuotes(table.name),
      localCount,
      prodCount,
      onlyLocal: Array.from(localRows.keys()).filter(id => !prodRows.has(id)),
      onlyProd: Array.from(prodRows.keys()).filter(id => !localRows.has(id)),
      localNewer,
      prodNewer,
    });
  }
  return diffs;
}

function conflictColumns(key: ConflictKey): readonly string[] {
  return key.kind === 'column' ? [key.col] : key.cols;
}

function buildBatchUpsertSql(table: TableConfig, columns: string[], batchSize: number): string {
  const colList = columns.map(quoteIdent).join(', ');

  const rowPlaceholders: string[] = [];
  for (let batchI = 0; batchI < batchSize; batchI++) {
    const cols = columns.map((_, colI) => `$${batchI * columns.length + colI + 1}`).join(', ');
    rowPlaceholders.push(`(${cols})`);
  }
  const valuesClause = rowPlaceholders.join(', ');

  const conflictCols = conflictColumns(table.conflictKey);
  const conflictExpr = conflictCols.map(quoteIdent).join(', ');

  if (table.strategy.kind === 'insert-only') {
    return `INSERT INTO ${table.name} (${colList}) VALUES ${valuesClause}
            ON CONFLICT (${conflictExpr}) DO NOTHING`;
  }

  const ts = table.strategy.timestampCol;
  // Preserve the target's surrogate PK on conflict so child FK references
  // already pointing at it stay valid. The conflict columns are likewise
  // excluded since updating them would change the row's identity.
  const excludedFromUpdate = new Set<string>([...conflictCols, SURROGATE_PK]);
  const updateSet = columns
    .filter(c => !excludedFromUpdate.has(c))
    .map(c => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
    .join(', ');

  return `INSERT INTO ${table.name} (${colList}) VALUES ${valuesClause}
          ON CONFLICT (${conflictExpr}) DO UPDATE SET ${updateSet}
          WHERE EXCLUDED.${ts} > ${table.name}.${ts}`;
}

export interface SyncResult {
  table: string;
  rows: number;
  skipped: number;
  failed: number;
  direction: SyncDirection;
}

const BATCH_SIZE = 25;
const PG_MAX_PARAMS = 65535;

function isConnectionClosed(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return msg.includes('Client was closed')
    || msg.includes('Connection terminated')
    || msg.includes('Client has encountered a connection error');
}

type KeySnapshot = Map<string, { keyValues: unknown[]; updatedAtMs: number | null }>;

function keySnapshotQuery(table: TableConfig): string {
  const keyCols = conflictColumns(table.conflictKey).map(quoteIdent).join(', ');
  const tsExpr = table.strategy.kind === 'last-write-wins'
    ? `extract(epoch from ${table.strategy.timestampCol})`
    : 'NULL';
  return `SELECT ${keyCols}, ${tsExpr} as sync_ts FROM ${table.name}`;
}

async function getKeySnapshot(client: Client, table: TableConfig): Promise<KeySnapshot> {
  const keyCols = conflictColumns(table.conflictKey);
  const result = await client.query(keySnapshotQuery(table));
  return new Map(
    result.rows.map((row: Record<string, unknown>) => {
      const keyValues = keyCols.map(c => row[c]);
      // Compare at millisecond precision: the pg driver serialises JS Dates
      // with ms resolution, so a sub-ms difference can never win the upsert's
      // timestamp check and would only be re-fetched and skipped every sync.
      const updatedAtMs = row.sync_ts === null ? null : Math.floor(Number(row.sync_ts) * 1000);
      return [JSON.stringify(keyValues), { keyValues, updatedAtMs }];
    })
  );
}

// Ship only rows the target lacks or holds an older copy of. Sending every row
// and letting the upsert's WHERE discard it moved ~17 MB of text_entries each
// way on every sync, which alone took close to the dev wrapper's timeout.
function selectKeysToTransfer(
  source: KeySnapshot,
  target: KeySnapshot,
  table: TableConfig
): unknown[][] {
  const canOverwrite = table.strategy.kind === 'last-write-wins';
  const keys: unknown[][] = [];
  for (const [key, sourceEntry] of source) {
    const targetEntry = target.get(key);
    if (targetEntry === undefined) {
      keys.push(sourceEntry.keyValues);
      continue;
    }
    if (!canOverwrite) continue;
    if (sourceEntry.updatedAtMs === null || targetEntry.updatedAtMs === null) continue;
    if (sourceEntry.updatedAtMs > targetEntry.updatedAtMs) keys.push(sourceEntry.keyValues);
  }
  return keys;
}

const FETCH_KEYS_CHUNK = 500;

async function fetchRowsByKey(
  client: Client,
  table: TableConfig,
  keys: unknown[][]
): Promise<Record<string, unknown>[]> {
  const keyCols = conflictColumns(table.conflictKey);
  const keyList = keyCols.map(quoteIdent).join(', ');
  const rows: Record<string, unknown>[] = [];
  for (let start = 0; start < keys.length; start += FETCH_KEYS_CHUNK) {
    const chunk = keys.slice(start, start + FETCH_KEYS_CHUNK);
    const tuples = chunk
      .map((_, rowI) => `(${keyCols.map((_, colI) => `$${rowI * keyCols.length + colI + 1}`).join(', ')})`)
      .join(', ');
    const result = await client.query(
      `SELECT * FROM ${table.name} WHERE (${keyList}) IN (${tuples}) ORDER BY ${table.orderBy}`,
      chunk.flat()
    );
    rows.push(...result.rows);
  }
  return rows;
}

function rowIdentityLog(table: TableConfig, row: Record<string, unknown>): string {
  const cols = conflictColumns(table.conflictKey);
  return cols.map(c => `${c}=${row[c]}`).join(',');
}

export async function syncDirection(
  source: Client,
  target: Client,
  table: TableConfig,
  direction: SyncDirection
): Promise<SyncResult> {
  const tableName = stripQuotes(table.name);
  const columns = await getColumns(source, table.name);
  if (columns.length === 0) return { table: tableName, rows: 0, skipped: 0, failed: 0, direction };

  // Crash early on impossible state: if a future schema widens to where one
  // batch would exceed PG's hard parameter limit, the cause would otherwise
  // surface only on the last (partial) batch of large tables.
  if (columns.length * BATCH_SIZE > PG_MAX_PARAMS) {
    throw new Error(
      `[sync-core] ${tableName}: ${columns.length} cols x BATCH_SIZE ${BATCH_SIZE} ` +
      `exceeds PG param limit ${PG_MAX_PARAMS}; lower BATCH_SIZE or split the schema`
    );
  }

  const [sourceSnapshot, targetSnapshot] = await Promise.all([
    getKeySnapshot(source, table),
    getKeySnapshot(target, table),
  ]);
  const keys = selectKeysToTransfer(sourceSnapshot, targetSnapshot, table);
  if (keys.length === 0) return { table: tableName, rows: 0, skipped: 0, failed: 0, direction };

  const sourceRows = await fetchRowsByKey(source, table, keys);

  const singleRowSql = buildBatchUpsertSql(table, columns, 1);
  let rows = 0;
  let skipped = 0;
  let failed = 0;
  for (let start = 0; start < sourceRows.length; start += BATCH_SIZE) {
    const batch = sourceRows.slice(start, start + BATCH_SIZE);
    const sql = buildBatchUpsertSql(table, columns, batch.length);
    const values: unknown[] = [];
    for (const row of batch) {
      for (const c of columns) values.push(row[c]);
    }

    try {
      const result = await target.query(sql, values);
      const affected = result.rowCount ?? 0;
      rows += affected;
      skipped += batch.length - affected;
    } catch (err) {
      // A dead connection will fail every remaining batch identically — bail
      // out so the wrapper's outer catch can report one error instead of N.
      if (isConnectionClosed(err)) {
        throw new Error(`[sync-core] ${tableName}: target connection closed mid-sync`);
      }
      // Data error: one poison row aborted the whole batch atomically. Retry
      // row-by-row to land the valid rows and pinpoint the offender.
      console.error(
        `  [WARN] ${table.name} (batch of ${batch.length}) failed, retrying per-row: ` +
        `${err instanceof Error ? err.message : String(err)}`
      );
      for (const row of batch) {
        const singleValues = columns.map(c => row[c]);
        try {
          const result = await target.query(singleRowSql, singleValues);
          const affected = result.rowCount ?? 0;
          rows += affected;
          skipped += 1 - affected;
        } catch (rowErr) {
          if (isConnectionClosed(rowErr)) {
            throw new Error(`[sync-core] ${tableName}: target connection closed mid-sync`);
          }
          failed++;
          console.error(
            `  [ERR] ${table.name} row (${rowIdentityLog(table, row)}): ` +
            `${rowErr instanceof Error ? rowErr.message : String(rowErr)}`
          );
        }
      }
    }
  }

  return { table: tableName, rows, skipped, failed, direction };
}

export async function withClients<T>(
  prodUrl: string,
  localUrl: string,
  fn: (prod: Client, local: Client) => Promise<T>
): Promise<T> {
  const prod = new Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
  const local = new Client({ connectionString: localUrl });

  try {
    await Promise.all([prod.connect(), local.connect()]);
    return await fn(prod, local);
  } finally {
    await prod.end().catch(() => {});
    await local.end().catch(() => {});
  }
}

export async function pull(prod: Client, local: Client): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const table of TABLES) {
    results.push(await syncDirection(prod, local, table, 'prod -> local'));
  }
  return results;
}

export async function push(prod: Client, local: Client): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const table of TABLES) {
    results.push(await syncDirection(local, prod, table, 'local -> prod'));
  }
  return results;
}

export async function fullSync(prod: Client, local: Client): Promise<SyncResult[]> {
  const pullResults = await pull(prod, local);
  const pushResults = await push(prod, local);
  return [...pullResults, ...pushResults];
}
