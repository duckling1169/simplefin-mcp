import {
  type ConnectionHandle,
  readSnapshot,
  writeSnapshot,
} from "@/lib/connections";
import {
  type AccountSet,
  DAY,
  fetchAccountSet,
  MAX_WINDOW_DAYS,
  type Transaction,
} from "@/lib/simplefin";

// SimpleFin Bridge allows ~24 requests/day and refreshes data about daily, so every tool reads a
// cached snapshot (balances, ~89 days of transactions incl. pending, holdings, errors -- two
// 45-day requests) that's refetched at most every SNAPSHOT_TTL_MS. Only older history costs
// extra requests, capped at MAX_HISTORY_WINDOWS per call.

export const SNAPSHOT_TTL_MS = 4 * 60 * 60 * 1000;
export const MAX_HISTORY_WINDOWS = 4;

export type Snapshot = AccountSet & { fetchedAt: number; windowStart: number };

export async function getSnapshot(
  conn: ConnectionHandle,
  opts: { refresh?: boolean } = {},
): Promise<Snapshot> {
  if (!opts.refresh) {
    const cached = await readSnapshot(conn);
    if (cached && Date.now() - cached.fetchedAt < SNAPSHOT_TTL_MS) {
      return JSON.parse(cached.json) as Snapshot;
    }
  }
  const now = Math.floor(Date.now() / 1000);
  // With no end-date Bridge measures the window to slightly past now, so the open-ended recent
  // request starts a day later to stay within the 45-day recommendation.
  const mid = now - (MAX_WINDOW_DAYS - 1) * DAY;
  const windowStart = mid - MAX_WINDOW_DAYS * DAY;
  const recent = await fetchAccountSet(conn.accessUrl, {
    startDate: mid,
    pending: true,
  });
  const older = await fetchAccountSet(conn.accessUrl, {
    startDate: windowStart,
    endDate: mid,
  });
  const olderById = new Map(older.accounts.map((a) => [a.id, a.transactions]));
  const recentIds = (txns: { id: string }[]) => new Set(txns.map((t) => t.id));
  const accounts = recent.accounts.map((a) => {
    const seen = recentIds(a.transactions);
    return {
      ...a,
      transactions: [
        ...a.transactions,
        ...(olderById.get(a.id) ?? []).filter((t) => !seen.has(t.id)),
      ],
    };
  });
  const snapshot: Snapshot = {
    ...recent,
    accounts,
    fetchedAt: Date.now(),
    windowStart,
  };
  await writeSnapshot(conn, JSON.stringify(snapshot));
  return snapshot;
}

export type TransactionRow = Transaction & {
  accountId: string;
  accountName: string;
  institution: string;
};

export function flattenTransactions(set: AccountSet): TransactionRow[] {
  return set.accounts.flatMap((a) =>
    a.transactions.map((t) => ({
      ...t,
      accountId: a.id,
      accountName: a.name,
      institution: a.institution,
    })),
  );
}

/**
 * Transactions in [start, end). Served from the snapshot when it covers the range; older ranges
 * are fetched in 45-day windows (not cached).
 */
export async function getTransactionsInRange(
  conn: ConnectionHandle,
  snapshot: Snapshot,
  start: number,
  end: number,
  accountIds?: string[],
): Promise<{ rows: TransactionRow[]; note?: string }> {
  const rows = flattenTransactions(snapshot).filter(
    (t) => t.posted >= Math.max(start, snapshot.windowStart) && t.posted < end,
  );
  if (start >= snapshot.windowStart) return { rows };

  let windowEnd = Math.min(end, snapshot.windowStart);
  let windows = 0;
  while (windowEnd > start && windows < MAX_HISTORY_WINDOWS) {
    const windowStart = Math.max(start, windowEnd - MAX_WINDOW_DAYS * DAY);
    const set = await fetchAccountSet(conn.accessUrl, {
      startDate: windowStart,
      endDate: windowEnd,
      accountIds,
    });
    rows.push(
      ...flattenTransactions(set).filter(
        (t) => t.posted >= windowStart && t.posted < windowEnd,
      ),
    );
    windowEnd = windowStart;
    windows++;
  }
  const note =
    windowEnd > start
      ? `Only fetched history back to ${new Date(windowEnd * 1000).toISOString().slice(0, 10)} ` +
        `(at most ${MAX_HISTORY_WINDOWS} extra 45-day requests per call, to stay under SimpleFin's daily quota). ` +
        `Ask again with an earlier end_date for more.`
      : undefined;
  const seen = new Set<string>();
  const unique = rows.filter((t) => {
    const id = `${t.accountId}:${t.id}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  return { rows: unique, note };
}
