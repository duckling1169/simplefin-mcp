import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchAccountSet,
  parseAccountSet,
  UpstreamError,
} from "@/lib/simplefin";

import { loadFixture } from "./fixtures";

const DEMO_ACCESS_URL = "https://demo:demo@beta-bridge.simplefin.org/simplefin";
// Mirrors a real version=2 response from the demo bridge.
const V2 = loadFixture("account-set-v2.json") as Record<string, unknown>;

describe("parseAccountSet", () => {
  it("keeps holdings that arrive without an id", () => {
    const raw = structuredClone(V2) as { accounts: { holdings: unknown[] }[] };
    raw.accounts[0]!.holdings.push({
      symbol: "VTI",
      shares: "3",
      market_value: "900",
    });
    const holdings = parseAccountSet(raw).accounts[0]!.holdings;
    expect(holdings).toHaveLength(2);
    expect(holdings[1]).toMatchObject({
      symbol: "VTI",
      shares: 3,
      marketValue: 900,
    });
    expect(holdings[1]!.id).toContain("VTI");
  });

  it("parses version 2 accounts, transactions, holdings, connections and errors", () => {
    const set = parseAccountSet(V2);
    const a = set.accounts[0]!;
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
    expect(set.accounts[0]?.institution).toBe("bank.example");
    expect(set.errors[0]?.message).toBe("oops");
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
