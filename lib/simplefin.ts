// Server-only: handles SimpleFin access URLs (credentials). Never log or return one.
export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpstreamError";
  }
}

export type SimpleFinAccount = {
  id: string;
  name: string;
  orgName: string;
  currency: string;
  balance: string;
  balanceDate: number;
};

type RawSimpleFinResponse = {
  errors?: unknown;
  accounts?: unknown;
};

type RawSimpleFinAccount = {
  id?: unknown;
  name?: unknown;
  currency?: unknown;
  balance?: unknown;
  "balance-date"?: unknown;
  org?: { name?: unknown; domain?: unknown } | null;
};

function parseAccount(raw: RawSimpleFinAccount): SimpleFinAccount | null {
  if (
    typeof raw.id !== "string" ||
    typeof raw.name !== "string" ||
    typeof raw.currency !== "string" ||
    typeof raw.balance !== "string" ||
    typeof raw["balance-date"] !== "number"
  ) {
    return null;
  }

  const orgName =
    (raw.org && typeof raw.org.name === "string" && raw.org.name) ||
    (raw.org && typeof raw.org.domain === "string" && raw.org.domain) ||
    "Unknown institution";

  return {
    id: raw.id,
    name: raw.name,
    orgName,
    currency: raw.currency,
    balance: raw.balance,
    balanceDate: raw["balance-date"],
  };
}

/**
 * Fetches accounts from SimpleFin's Bridge API.
 * Never include the access URL or the raw upstream response body in a thrown error --
 * SimpleFin can echo the request, and doing so would leak the credential to callers.
 */
export async function fetchSimpleFinAccounts(accessUrl: string): Promise<SimpleFinAccount[]> {
  // fetch() rejects (or silently drops) URLs with embedded username:password --
  // per the Fetch spec, a request cannot be constructed from a URL that includes
  // credentials. Strip them out and send an explicit Basic Auth header instead.
  let requestUrl: URL;
  try {
    requestUrl = new URL(`${accessUrl}/accounts`);
  } catch {
    throw new UpstreamError("The stored SimpleFin access URL is not valid.");
  }
  const username = requestUrl.username;
  const password = requestUrl.password;
  requestUrl.username = "";
  requestUrl.password = "";
  const authHeader = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      cache: "no-store",
      headers: { Authorization: authHeader },
    });
  } catch {
    throw new UpstreamError("Could not reach SimpleFin. Check your network connection and try again.");
  }

  if (!response.ok) {
    throw new UpstreamError(`SimpleFin returned an error (status ${response.status}).`);
  }

  let data: RawSimpleFinResponse;
  try {
    data = (await response.json()) as RawSimpleFinResponse;
  } catch {
    throw new UpstreamError("SimpleFin returned a response that could not be read.");
  }

  if (!Array.isArray(data.accounts)) {
    throw new UpstreamError("SimpleFin returned an unexpected response shape.");
  }

  return data.accounts
    .map((account) => parseAccount(account as RawSimpleFinAccount))
    .filter((account): account is SimpleFinAccount => account !== null);
}

export type InstitutionBalances = {
  orgName: string;
  accounts: SimpleFinAccount[];
};

export function groupByInstitution(accounts: SimpleFinAccount[]): InstitutionBalances[] {
  const groups = new Map<string, SimpleFinAccount[]>();
  for (const account of accounts) {
    const group = groups.get(account.orgName);
    if (group) {
      group.push(account);
    } else {
      groups.set(account.orgName, [account]);
    }
  }
  return Array.from(groups.entries()).map(([orgName, orgAccounts]) => ({
    orgName,
    accounts: orgAccounts,
  }));
}

/**
 * Fetches and groups balances by institution. Propagates fetchSimpleFinAccounts' errors unchanged.
 */
export async function getBalances(accessUrl: string): Promise<InstitutionBalances[]> {
  return groupByInstitution(await fetchSimpleFinAccounts(accessUrl));
}
