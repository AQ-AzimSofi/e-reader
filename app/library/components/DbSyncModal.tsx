'use client';

import { useState, useCallback } from 'react';
import { API_ROUTES, COLORS } from '@/lib/constants';
import { toTint } from '@/lib/utils/colorTint';

interface DiffResult {
  table: string;
  localCount: number | null;
  prodCount: number | null;
  onlyLocal: string[];
  onlyProd: string[];
  localNewer: number;
  prodNewer: number;
}

interface SyncResult {
  table: string;
  rows: number;
  skipped: number;
  failed: number;
  direction: string;
}

type SyncDirection = 'pull' | 'push' | 'full';

export default function DbSyncModal({ onClose }: { onClose: () => void }) {
  const [diffs, setDiffs] = useState<DiffResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSyncResults(null);
    try {
      const res = await fetch(API_ROUTES.DB_SYNC);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setDiffs(data.diffs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status');
    } finally {
      setLoading(false);
    }
  }, []);

  const runSync = useCallback(async (direction: SyncDirection) => {
    setSyncing(true);
    setError(null);
    setSyncResults(null);
    try {
      const res = await fetch(API_ROUTES.DB_SYNC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setSyncResults(data.results);
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }, [fetchStatus]);

  const hasLocalToPush = diffs?.some(d => d.onlyLocal.length > 0 || d.localNewer > 0) ?? false;
  const hasProdToPull = diffs?.some(d => d.onlyProd.length > 0 || d.prodNewer > 0) ?? false;
  const allInSync = diffs !== null && !hasLocalToPush && !hasProdToPull &&
    diffs.every(d => d.localCount !== null && d.prodCount !== null && d.localCount === d.prodCount);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: toTint(COLORS.INK, 40) }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] overflow-y-auto border"
        style={{ backgroundColor: COLORS.SURFACE, borderColor: COLORS.INK, color: COLORS.INK }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b" style={{ backgroundColor: COLORS.SURFACE, borderColor: COLORS.NEUTRAL }}>
          <h2 className="font-mincho font-bold text-lg tracking-[0.04em]" style={{ color: COLORS.INK }}>Database Sync</h2>
          <button
            onClick={onClose}
            className="p-1.5 interactive-close"
            style={{ color: COLORS.SECONDARY }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {!diffs && !loading && !error && (
            <div className="text-center py-8">
              <p className="text-sm mb-4" style={{ color: COLORS.SECONDARY }}>
                Compare local and production databases
              </p>
              <button
                onClick={fetchStatus}
                className="min-h-11 px-5 text-sm font-bold interactive-btn"
                style={{ backgroundColor: COLORS.PRIMARY, color: COLORS.SURFACE }}
              >
                Check Status
              </button>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div
                className="w-6 h-6 border-2 rounded-full animate-spin mr-3"
                style={{ borderColor: COLORS.NEUTRAL, borderTopColor: COLORS.INK }}
              />
              <span className="text-sm" style={{ color: COLORS.SECONDARY }}>Connecting to databases...</span>
            </div>
          )}

          {error && (
            <div className="p-4 border" style={{ backgroundColor: toTint(COLORS.DANGER, 8), borderColor: COLORS.DANGER }}>
              <p className="text-sm font-bold" style={{ color: COLORS.DANGER }}>{error}</p>
            </div>
          )}

          {diffs && !loading && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs" style={{ color: COLORS.SECONDARY }}>
                      <th className="text-left py-2 px-3 font-bold">Table</th>
                      <th className="text-right py-2 px-3 font-bold">Local</th>
                      <th className="text-right py-2 px-3 font-bold">Prod</th>
                      <th className="text-left py-2 px-3 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diffs.map((d) => {
                      const countsKnown = d.localCount !== null && d.prodCount !== null;
                      const toPush = d.onlyLocal.length + d.localNewer;
                      const toPull = d.onlyProd.length + d.prodNewer;
                      const inSync = toPush === 0 && toPull === 0
                        && countsKnown && d.localCount === d.prodCount;
                      let status = 'In sync';
                      let statusColor: string = COLORS.SUCCESS;
                      if (!countsKnown) {
                        status = 'Count unavailable';
                        statusColor = COLORS.DANGER;
                      } else if (toPush > 0 && toPull > 0) {
                        status = `${toPush} to push, ${toPull} to pull`;
                        statusColor = COLORS.DANGER;
                      } else if (toPush > 0) {
                        status = `${toPush} to push`;
                        statusColor = COLORS.PRIMARY;
                      } else if (toPull > 0) {
                        status = `${toPull} to pull`;
                        statusColor = COLORS.INK;
                      } else if (d.localCount !== d.prodCount) {
                        status = 'Counts differ';
                        statusColor = COLORS.DANGER;
                      }
                      return (
                        <tr key={d.table} className="border-t" style={{ borderColor: COLORS.NEUTRAL }}>
                          <td className="py-2.5 px-3 font-mono text-xs" style={{ color: COLORS.INK }}>{d.table}</td>
                          <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: COLORS.INK }}>
                            {d.localCount === null ? 'N/A' : d.localCount}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums" style={{ color: COLORS.INK }}>
                            {d.prodCount === null ? 'N/A' : d.prodCount}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className="inline-flex items-center gap-1 text-xs font-bold"
                              style={{ color: statusColor }}
                            >
                              {inSync && (
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                              {status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {syncResults && (
                <div className="p-4 border" style={{ backgroundColor: toTint(COLORS.SUCCESS, 8), borderColor: COLORS.SUCCESS }}>
                  <p className="text-sm font-bold mb-2" style={{ color: COLORS.SUCCESS }}>Sync completed</p>
                  {syncResults.map((r, i) => (
                    <p key={i} className="text-xs" style={{ color: COLORS.INK }}>
                      {r.table}: {r.rows} rows ({r.direction}){r.skipped > 0 ? `, ${r.skipped} skipped` : ''}{r.failed > 0 ? `, ${r.failed} failed` : ''}
                    </p>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={fetchStatus}
                  disabled={syncing}
                  className="min-h-11 px-5 text-sm font-bold border"
                  style={{ backgroundColor: 'transparent', borderColor: COLORS.NEUTRAL, color: COLORS.INK, opacity: syncing ? 0.5 : 1 }}
                >
                  Refresh
                </button>
                <button
                  onClick={() => runSync('pull')}
                  disabled={syncing || !hasProdToPull}
                  className="min-h-11 px-5 text-sm font-bold border"
                  style={{
                    backgroundColor: 'transparent',
                    borderColor: COLORS.INK,
                    color: COLORS.INK,
                    opacity: syncing || !hasProdToPull ? 0.4 : 1,
                  }}
                >
                  {syncing ? 'Syncing...' : 'Pull (Prod -> Local)'}
                </button>
                <button
                  onClick={() => runSync('push')}
                  disabled={syncing || !hasLocalToPush}
                  className="min-h-11 px-5 text-sm font-bold"
                  style={{
                    backgroundColor: COLORS.PRIMARY,
                    color: COLORS.SURFACE,
                    opacity: syncing || !hasLocalToPush ? 0.4 : 1,
                  }}
                >
                  {syncing ? 'Syncing...' : 'Push (Local -> Prod)'}
                </button>
                <button
                  onClick={() => runSync('full')}
                  disabled={syncing || allInSync}
                  className="min-h-11 px-5 text-sm font-bold"
                  style={{
                    backgroundColor: COLORS.INK,
                    color: COLORS.SURFACE,
                    opacity: syncing || allInSync ? 0.4 : 1,
                  }}
                >
                  {syncing ? 'Syncing...' : 'Full Sync'}
                </button>
              </div>

              {allInSync && (
                <p className="text-sm text-center" style={{ color: COLORS.SUCCESS }}>
                  All tables are in sync.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
