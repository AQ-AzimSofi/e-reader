#!/usr/bin/env npx tsx
/**
 * Dev wrapper that starts the local DB container, syncs the local DB with
 * prod on startup, and syncs again on Ctrl+C.
 *
 * Usage:
 *   npx tsx scripts/dev-with-sync.ts            # next dev on default port
 *   npx tsx scripts/dev-with-sync.ts --lan      # next dev on LAN host/port
 *
 * Skip the sync entirely with `npm run dev:nosync`.
 * Press Ctrl+C twice to skip the shutdown sync if it hangs.
 */

import { spawn, type ChildProcess } from 'child_process';
import { resolve } from 'node:path';
import { Client } from 'pg';
import dotenv from 'dotenv';
import { fullSync, type SyncResult } from '../lib/db/sync-core';

dotenv.config({ path: '.env.local' });

function parseTimeoutMs(raw: string | undefined, defaultMs: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

const SYNC_TIMEOUT_MS = parseTimeoutMs(process.env.SYNC_TIMEOUT_MS, 60_000);
const SHUTDOWN_GRACE_MS = 5_000;
const CONNECT_TIMEOUT_MS = 5_000;
const DB_START_TIMEOUT_SECS = 60;

function nextDevArgs(): string[] {
  const lan = process.argv.includes('--lan');
  return lan
    ? ['dev', '--hostname', '192.168.1.15', '--port', '3001']
    : ['dev', '--port', '3333'];
}

function summarize(label: string, results: SyncResult[]) {
  const meaningful = results.filter(r => r.rows > 0 || r.skipped > 0 || r.failed > 0);
  if (meaningful.length === 0) {
    console.log(`[sync] ${label}: nothing to transfer`);
    return;
  }
  console.log(`[sync] ${label}:`);
  for (const r of meaningful) {
    const skippedSuffix = r.skipped > 0 ? `, ${r.skipped} skipped` : '';
    const failedSuffix = r.failed > 0 ? `, ${r.failed} failed` : '';
    console.log(`  ${r.table}: ${r.rows} rows ${r.direction}${skippedSuffix}${failedSuffix}`);
  }
}

// Node reports a refused connection to a dual-stack host (::1 and 127.0.0.1)
// as an AggregateError whose own message is empty; the causes live in .errors.
function describeError(err: unknown): string {
  if (err instanceof AggregateError) {
    return err.errors.map(describeError).join('; ');
  }
  return err instanceof Error ? err.message : String(err);
}

async function runSync(label: string): Promise<void> {
  const prodUrl = process.env.PROD_DATABASE_URL;
  const localUrl = process.env.DATABASE_URL;

  if (!prodUrl || !localUrl) {
    console.log(`[sync] ${label}: skipped (PROD_DATABASE_URL or DATABASE_URL not set)`);
    return;
  }

  console.log(`[sync] ${label}: running full sync...`);
  const prod = new Client({
    connectionString: prodUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });
  const local = new Client({
    connectionString: localUrl,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    prod.end().catch(() => {});
    local.end().catch(() => {});
  }, SYNC_TIMEOUT_MS);

  try {
    await Promise.all([prod.connect(), local.connect()]);
    const results = await fullSync(prod, local);
    summarize(label, results);
  } catch (err) {
    if (timedOut) {
      console.warn(`[sync] ${label} timed out after ${SYNC_TIMEOUT_MS}ms`);
    } else {
      console.warn(`[sync] ${label} failed: ${describeError(err)}`);
    }
    console.warn('[sync] continuing without sync');
  } finally {
    clearTimeout(timer);
    if (!timedOut) {
      await prod.end().catch(() => {});
      await local.end().catch(() => {});
    }
  }
}

// `--wait` blocks until the compose healthcheck passes, so the startup sync
// never races a Postgres that is still booting. A missing Docker only costs
// the sync, which already reports a refused connection and continues.
function startLocalDb(): Promise<void> {
  return new Promise(done => {
    console.log('[dev-with-sync] starting local db container...');
    const compose = spawn(
      'docker',
      ['compose', 'up', '-d', '--wait', '--wait-timeout', String(DB_START_TIMEOUT_SECS), 'db'],
      { stdio: 'inherit' }
    );
    compose.on('error', err => {
      console.warn(`[dev-with-sync] could not run docker: ${err.message}`);
      done();
    });
    compose.on('exit', (code, signal) => {
      if (code !== 0) {
        const reason = signal ? `signal ${signal}` : `code ${code}`;
        console.warn(`[dev-with-sync] docker compose up exited with ${reason}, continuing`);
      }
      done();
    });
  });
}

function spawnNextDev(): ChildProcess {
  // Spawn node with next's bin path directly so the child is a real Node
  // process (not cmd.exe on Windows). The terminal's Ctrl+C is broadcast to
  // every process attached to the console group, so next dev gets the signal
  // naturally and shuts down gracefully without us calling child.kill.
  const nextBin = resolve(process.cwd(), 'node_modules/next/dist/bin/next');
  return spawn(process.execPath, [nextBin, ...nextDevArgs()], {
    stdio: 'inherit',
  });
}

async function main() {
  await startLocalDb();
  await runSync('startup');

  const child = spawnNextDev();

  let shuttingDown = false;
  const handleSigint = () => {
    if (shuttingDown) {
      console.log('\n[sync] second Ctrl+C received, exiting immediately');
      process.exit(130);
    }
    shuttingDown = true;
    console.log('\n[sync] Ctrl+C received, waiting for next dev to exit then running shutdown sync...');
    console.log('[sync] press Ctrl+C again to skip shutdown sync');

    setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        console.log(`[sync] next dev did not exit within ${SHUTDOWN_GRACE_MS}ms, forcing kill`);
        child.kill('SIGKILL');
      }
    }, SHUTDOWN_GRACE_MS).unref();
  };
  process.on('SIGINT', handleSigint);

  child.on('exit', async (code) => {
    process.off('SIGINT', handleSigint);
    if (shuttingDown) {
      await runSync('shutdown');
    }
    process.exit(code ?? 0);
  });
}

main().catch(err => {
  console.error('[dev-with-sync] fatal:', err);
  process.exit(1);
});
