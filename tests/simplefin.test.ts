import { afterEach, describe, expect, it, vi } from "vitest";

import { flattenTransactions } from "../lib/data";
import { mccCategory } from "../lib/mcc";
import {
  fetchAccountSet,
  parseAccountSet,
  UpstreamError,
} from "../lib/simplefin";
import {
  connectionStatus,
  filterTransactions,
  listHoldings,
  summarize,
} from "../lib/tools";

const DEMO_ACCESS_URL = "https://demo:demo@beta-bridge.simplefin.org/simplefin";

// Shape mirrors a real version=2 response from the demo bridge.
const V2 = {
  errlist: [
    { code: "con.auth", msg: "Re-authenticate Demo Bank", conn_id: "CON-1" },
  ],
  connections: [
    {
      conn_id: "CON-1",
      name: "Demo",
      org_name: "Demo Bank",
      org_url: "https://demo.example",
    },
  ],
  accounts: [
    {
      id: "ACT-1",
      name: "Checking",
      conn_id: "CON-1",
      currency: "USD",
      balance: "1000.50",
      "available-balance": "900.00",
      "balance-date": 1790000000,
      transactions: [
        {
          id: "t1",
          posted: 1790000000,
          amount: "-50.00",
          description: "Grocer",
          payee: "Grocer",
          memo: null,
          transacted_at: 1789990000,
          mcc: 5411,
        },
        {
          id: "t2",
          posted: 1790100000,
          amount: "-20.00",
          description: "Cafe",
          payee: "Cafe",
          memo: "latte",
          mcc: 5814,
          pending: true,
        },
        {
          id: "t3",
          posted: 1790200000,
          amount: "2000.00",
          description: "Pay day!",
          payee: "You",
          mcc: null,
        },
        { id: "bad", amount: "1" },
      ],
      holdings: [
        {
          id: "h1",
          symbol: "AAPL",
          shares: "10",
          market_value: "2000",
          cost_basis: "500",
          currency: "USD",
        },
      ],
    },
  ],
};

describe("parseAccountSet", () => {
  it("parses version 2 accounts, transactions, holdings, connections and errors", () => {
    const set = parseAccountSet(V2);
    const [a] = set.accounts;
    expect(a.institution).toBe("Demo Bank");
    expect(a.balance).toBe(1000.5);
    expect(a.availableBalance).toBe(900);
    expect(a.transactions.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(a.transactions[1]).toMatchObject({
      amount: -20,
      pending: true,
      mcc: "5814",
      memo: "latte",
    });
    expect(a.holdings[0]).toMatchObject({
      symbol: "AAPL",
      shares: 10,
      marketValue: 2000,
      costBasis: 500,
    });
    expect(set.errors[0]).toMatchObject({
      code: "con.auth",
      connectionId: "CON-1",
    });
  });

  it("falls back to version 1 org names and string errors", () => {
    const set = parseAccountSet({
      errors: ["oops"],
      accounts: [
        {
          id: "a",
          name: "A",
          currency: "USD",
          balance: "1",
          "balance-date": 1,
          org: { domain: "bank.example" },
        },
      ],
    });
    expect(set.accounts[0].institution).toBe("bank.example");
    expect(set.errors[0].message).toBe("oops");
  });
});

describe("fetchAccountSet", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends Basic Auth and the query parameters without credentials in the URL", async () => {
    const spy = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(V2), { status: 200 }));
    globalThis.fetch = spy as unknown as typeof fetch;

    await fetchAccountSet(DEMO_ACCESS_URL, {
      startDate: 100,
      endDate: 200,
      pending: true,
      accountIds: ["A", "B"],
    });

    const [url, init] = spy.mock.calls[0] as [URL, RequestInit];
    expect(url.username).toBe("");
    expect(url.pathname).toBe("/simplefin/accounts");
    expect(url.searchParams.get("version")).toBe("2");
    expect(url.searchParams.get("start-date")).toBe("100");
    expect(url.searchParams.get("end-date")).toBe("200");
    expect(url.searchParams.get("pending")).toBe("1");
    expect(url.searchParams.getAll("account")).toEqual(["A", "B"]);
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Basic " + Buffer.from("demo:demo").toString("base64"),
    );
  });

  it("explains a revoked connection without leaking the access URL", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("nope", { status: 403 }),
      ) as unknown as typeof fetch;
    const error = await fetchAccountSet(DEMO_ACCESS_URL).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(UpstreamError);
    expect(String((error as Error).message)).not.toContain("demo:demo");
    expect((error as Error).message).toMatch(/revoked/);
  });
});

describe("tools", () => {
  const set = parseAccountSet(V2);
  const rows = flattenTransactions(set);

  it("filters by text, pending and amount", () => {
    expect(
      filterTransactions(rows, { query: "LATTE" }).map((t) => t.id),
    ).toEqual(["t2"]);
    expect(
      filterTransactions(rows, { includePending: false }).map((t) => t.id),
    ).toEqual(["t3", "t1"]);
    expect(filterTransactions(rows, { maxAmount: 0 }).map((t) => t.id)).toEqual(
      ["t2", "t1"],
    );
  });

  it("summarizes spending by category and payee", () => {
    const byCategory = summarize(rows, "category");
    expect(byCategory.totals).toEqual({
      spent: 70,
      received: 2000,
      net: 1930,
      transactions: 3,
    });
    expect(byCategory.groups.map((g) => g.key)).toEqual([
      "Groceries",
      "Restaurants & bars",
      "Uncategorized",
    ]);
    expect(summarize(rows, "payee", 1)).toMatchObject({
      groups: [{ key: "Grocer", spent: 50 }],
      omittedGroups: 2,
    });
  });

  it("reports holdings and connection errors", () => {
    expect(listHoldings(set)[0].holdings[0]).toMatchObject({
      symbol: "AAPL",
      gain: 1500,
    });
    expect(connectionStatus(set, 0).connections[0]).toMatchObject({
      institution: "Demo Bank",
      accounts: 1,
      errors: ["Re-authenticate Demo Bank"],
    });
  });

  it("maps merchant category codes", () => {
    expect(mccCategory("5411")).toBe("Groceries");
    expect(mccCategory("5542")).toBe("Gas");
    expect(mccCategory("8011")).toBe("Health care");
    expect(mccCategory(null)).toBe("Uncategorized");
  });
});
