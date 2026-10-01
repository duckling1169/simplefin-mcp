import type { TransactionRow } from "@/lib/data";
import { mccCategory } from "@/lib/mcc";
import type { AccountSet } from "@/lib/simplefin";

// Pure shaping for MCP tool output. Amounts follow SimpleFin: negative = money out.

const iso = (unix: number) => new Date(unix * 1000).toISOString();
const round = (n: number) => Math.round(n * 100) / 100;

export function listAccounts(set: AccountSet) {
  const byInstitution = new Map<string, unknown[]>();
  for (const a of set.accounts) {
    const list = byInstitution.get(a.institution) ?? [];
    list.push({
      id: a.id,
      name: a.name,
      currency: a.currency,
      balance: a.balance,
      availableBalance: a.availableBalance,
      balanceAsOf: iso(a.balanceDate),
      hasHoldings: a.holdings.length > 0,
    });
    byInstitution.set(a.institution, list);
  }
  return [...byInstitution].map(([institution, accounts]) => ({
    institution,
    accounts,
  }));
}

export type TransactionFilter = {
  query?: string;
  includePending?: boolean;
  accountIds?: string[];
  minAmount?: number;
  maxAmount?: number;
};

export function filterTransactions(
  rows: TransactionRow[],
  f: TransactionFilter,
): TransactionRow[] {
  const q = f.query?.toLowerCase();
  return rows
    .filter((t) => f.includePending !== false || !t.pending)
    .filter((t) => !f.accountIds?.length || f.accountIds.includes(t.accountId))
    .filter((t) => f.minAmount === undefined || t.amount >= f.minAmount)
    .filter((t) => f.maxAmount === undefined || t.amount <= f.maxAmount)
    .filter(
      (t) =>
        !q ||
        [t.description, t.payee, t.memo].some((s) =>
          s?.toLowerCase().includes(q),
        ),
    )
    .sort((a, b) => b.posted - a.posted);
}

export function formatTransaction(t: TransactionRow) {
  return {
    date: iso(t.transactedAt ?? t.posted).slice(0, 10),
    amount: t.amount,
    description: t.description,
    payee: t.payee,
    memo: t.memo,
    category: t.mcc ? mccCategory(t.mcc) : null,
    pending: t.pending,
    account: t.accountName,
    accountId: t.accountId,
    institution: t.institution,
    id: t.id,
  };
}

export type GroupBy = "payee" | "category" | "account" | "month";

function groupKey(t: TransactionRow, by: GroupBy): string {
  switch (by) {
    case "payee":
      return t.payee ?? (t.description || "Unknown");
    case "category":
      return mccCategory(t.mcc);
    case "account":
      return `${t.institution} / ${t.accountName}`;
    case "month":
      return iso(t.posted).slice(0, 7);
  }
}

export function summarize(rows: TransactionRow[], by: GroupBy, top = 25) {
  const groups = new Map<
    string,
    { spent: number; received: number; count: number }
  >();
  let spent = 0;
  let received = 0;
  for (const t of rows) {
    const key = groupKey(t, by);
    const g = groups.get(key) ?? { spent: 0, received: 0, count: 0 };
    if (t.amount < 0) {
      g.spent -= t.amount;
      spent -= t.amount;
    } else {
      g.received += t.amount;
      received += t.amount;
    }
    g.count++;
    groups.set(key, g);
  }
  const sorted = [...groups].map(([key, g]) => ({
    key,
    spent: round(g.spent),
    received: round(g.received),
    net: round(g.received - g.spent),
    count: g.count,
  }));
  if (by === "month") sorted.sort((a, b) => a.key.localeCompare(b.key));
  else sorted.sort((a, b) => b.spent - a.spent || b.received - a.received);
  const limit = by === "month" ? sorted.length : top;
  return {
    totals: {
      spent: round(spent),
      received: round(received),
      net: round(received - spent),
      transactions: rows.length,
    },
    groupBy: by,
    groups: sorted.slice(0, limit),
    omittedGroups: sorted.length - Math.min(limit, sorted.length),
    note: "Transfers between your own accounts count as both spent and received.",
  };
}

export function listHoldings(set: AccountSet) {
  return set.accounts
    .filter((a) => a.holdings.length > 0)
    .map((a) => ({
      institution: a.institution,
      account: a.name,
      accountId: a.id,
      holdings: a.holdings.map((h) => ({
        symbol: h.symbol,
        description: h.description,
        shares: h.shares,
        marketValue: h.marketValue,
        costBasis: h.costBasis,
        gain:
          h.marketValue !== null && h.costBasis !== null
            ? round(h.marketValue - h.costBasis)
            : null,
        currency: h.currency,
      })),
    }));
}

export function connectionStatus(set: AccountSet, fetchedAt: number) {
  return {
    dataFetchedAt: new Date(fetchedAt).toISOString(),
    connections: set.connections.map((c) => ({
      institution: c.name,
      url: c.orgUrl,
      accounts: set.accounts.filter((a) => a.connectionId === c.id).length,
      errors: set.errors
        .filter((e) => e.connectionId === c.id)
        .map((e) => e.message),
    })),
    errors: set.errors,
    note: set.errors.length
      ? "Fix connection errors at https://beta-bridge.simplefin.org."
      : "No errors reported.",
  };
}
