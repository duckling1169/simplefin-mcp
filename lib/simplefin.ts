// Server-only: handles SimpleFin access URLs (credentials). Never log or return one.
// Protocol: https://www.simplefin.org/protocol.html (version 2). Bridge limits: ~24 requests/day,
// at most 90 days of transactions per request, with a warning above 45 ("may be capped").

export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

export const DAY = 86400;
/** Days of transactions per request -- Bridge's recommended maximum. */
export const MAX_WINDOW_DAYS = 45;

export type Connection = { id: string; name: string; orgUrl: string | null };
export type Transaction = {
  id: string;
  posted: number;
  transactedAt: number | null;
  amount: number;
  description: string;
  payee: string | null;
  memo: string | null;
  mcc: string | null;
  pending: boolean;
};
export type Holding = {
  id: string;
  symbol: string | null;
  description: string | null;
  shares: number | null;
  marketValue: number | null;
  costBasis: number | null;
  purchasePrice: number | null;
  currency: string | null;
};
export type Account = {
  id: string;
  name: string;
  connectionId: string | null;
  institution: string;
  currency: string;
  balance: number;
  availableBalance: number | null;
  balanceDate: number;
  transactions: Transaction[];
  holdings: Holding[];
};
export type SimpleFinError = { code: string | null; message: string; connectionId: string | null; accountId: string | null };
export type AccountSet = { connections: Connection[]; accounts: Account[]; errors: SimpleFinError[] };

export type FetchOptions = {
  startDate?: number;
  endDate?: number;
  pending?: boolean;
  balancesOnly?: boolean;
  accountIds?: string[];
};

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as Raw[]) : []);

function parseTransaction(raw: Raw): Transaction | null {
  const id = str(raw.id);
  const posted = num(raw.posted);
  const amount = num(raw.amount);
  if (!id || posted === null || amount === null) return null;
  return {
    id,
    posted,
    transactedAt: num(raw.transacted_at),
    amount,
    description: str(raw.description) ?? "",
    payee: str(raw.payee),
    memo: str(raw.memo),
    mcc: raw.mcc == null ? null : String(raw.mcc),
    pending: raw.pending === true,
  };
}

function parseHolding(raw: Raw): Holding | null {
  const id = str(raw.id);
  if (!id) return null;
  return {
    id,
    symbol: str(raw.symbol),
    description: str(raw.description),
    shares: num(raw.shares),
    marketValue: num(raw.market_value),
    costBasis: num(raw.cost_basis),
    purchasePrice: num(raw.purchase_price),
    currency: str(raw.currency),
  };
}

export function parseAccountSet(data: Raw): AccountSet {
  const connections: Connection[] = arr(data.connections).flatMap((c) => {
    const id = str(c.conn_id);
    return id ? [{ id, name: str(c.org_name) ?? str(c.name) ?? id, orgUrl: str(c.org_url) }] : [];
  });
  const connName = new Map(connections.map((c) => [c.id, c.name]));

  const accounts: Account[] = arr(data.accounts).flatMap((a) => {
    const id = str(a.id);
    const balance = num(a.balance);
    const balanceDate = num(a["balance-date"]);
    if (!id || balance === null || balanceDate === null) return [];
    const connectionId = str(a.conn_id);
    const org = (a.org ?? null) as Raw | null;
    return [
      {
        id,
        name: str(a.name) ?? id,
        connectionId,
        institution:
          (connectionId && connName.get(connectionId)) || str(org?.name) || str(org?.domain) || "Unknown institution",
        currency: str(a.currency) ?? "USD",
        balance,
        availableBalance: num(a["available-balance"]),
        balanceDate,
        transactions: arr(a.transactions).flatMap((t) => parseTransaction(t) ?? []),
        holdings: arr(a.holdings).flatMap((h) => parseHolding(h) ?? []),
      },
    ];
  });

  const errors: SimpleFinError[] = [
    ...arr(data.errlist).map((e) => ({
      code: str(e.code),
      message: str(e.msg) ?? "Unknown error",
      connectionId: str(e.conn_id),
      accountId: str(e.account_id),
    })),
    ...(Array.isArray(data.errors) ? data.errors : [])
      .filter((e): e is string => typeof e === "string")
      .map((message) => ({ code: null, message, connectionId: null, accountId: null })),
  ];

  return { connections, accounts, errors };
}

/**
 * One GET /accounts call. fetch() refuses URLs with embedded credentials, so they're moved into
 * an explicit Basic Auth header. Errors never include the access URL or the upstream body.
 */
export async function fetchAccountSet(accessUrl: string, opts: FetchOptions = {}): Promise<AccountSet> {
  let url: URL;
  try {
    url = new URL(`${accessUrl.replace(/\/$/, "")}/accounts`);
  } catch {
    throw new UpstreamError("The stored SimpleFin access URL is not valid.");
  }
  const auth = "Basic " + Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString("base64");
  url.username = "";
  url.password = "";
  url.searchParams.set("version", "2");
  if (opts.startDate !== undefined) url.searchParams.set("start-date", String(Math.floor(opts.startDate)));
  if (opts.endDate !== undefined) url.searchParams.set("end-date", String(Math.floor(opts.endDate)));
  if (opts.pending) url.searchParams.set("pending", "1");
  if (opts.balancesOnly) url.searchParams.set("balances-only", "1");
  for (const id of opts.accountIds ?? []) url.searchParams.append("account", id);

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", headers: { Authorization: auth } });
  } catch {
    throw new UpstreamError("Could not reach SimpleFin. Try again later.");
  }
  if (response.status === 403) {
    throw new UpstreamError("SimpleFin rejected this connection (access revoked or disabled). Create a new connector URL.");
  }
  if (response.status === 402) throw new UpstreamError("SimpleFin says payment is required for this account.");
  if (!response.ok) throw new UpstreamError(`SimpleFin returned an error (status ${response.status}).`);

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new UpstreamError("SimpleFin returned a response that could not be read.");
  }
  if (!data || typeof data !== "object" || !Array.isArray((data as Raw).accounts)) {
    throw new UpstreamError("SimpleFin returned an unexpected response shape.");
  }
  return parseAccountSet(data as Raw);
}
