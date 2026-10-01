import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchSimpleFinAccounts,
  UpstreamError,
} from "../lib/simplefin";

const DEMO_ACCESS_URL = "https://demo:demo@beta-bridge.simplefin.org/simplefin";

describe("fetchSimpleFinAccounts", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("parses SimpleFin's /accounts response into grouped-ready account records", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          errors: [],
          accounts: [
            {
              id: "acct-1",
              name: "Checking",
              currency: "USD",
              balance: "1234.56",
              "balance-date": 1700000000,
              org: { name: "Demo Bank", domain: "demo.example" },
            },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const accounts = await fetchSimpleFinAccounts(DEMO_ACCESS_URL);

    expect(accounts).toEqual([
      {
        id: "acct-1",
        name: "Checking",
        orgName: "Demo Bank",
        currency: "USD",
        balance: "1234.56",
        balanceDate: 1700000000,
      },
    ]);
  });

  it("throws UpstreamError without leaking the access URL when SimpleFin returns a non-2xx status", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(`Unauthorized: ${DEMO_ACCESS_URL}/accounts`, { status: 401 })) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await fetchSimpleFinAccounts(DEMO_ACCESS_URL);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UpstreamError);
    expect((caught as Error).message).not.toContain("demo:demo");
    expect((caught as Error).message).not.toContain(DEMO_ACCESS_URL);
  });

  it("strips embedded credentials from the request URL and sends them as a Basic Auth header instead", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ errors: [], accounts: [] }), { status: 200 }),
    );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await fetchSimpleFinAccounts(DEMO_ACCESS_URL);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchSpy.mock.calls[0];
    // fetch() rejects/drops URLs with embedded userinfo -- the request URL itself
    // must never contain the credential.
    expect(String(calledUrl)).not.toContain("demo:demo");
    expect(String(calledUrl)).not.toContain("@beta-bridge");
    expect(String(calledUrl)).toBe("https://beta-bridge.simplefin.org/simplefin/accounts");
    const headers = new Headers((calledInit as RequestInit).headers);
    expect(headers.get("Authorization")).toBe(`Basic ${Buffer.from("demo:demo").toString("base64")}`);
  });

  it("throws UpstreamError without leaking the access URL when the network request fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error(`connect failed for ${DEMO_ACCESS_URL}`)) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await fetchSimpleFinAccounts(DEMO_ACCESS_URL);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UpstreamError);
    expect((caught as Error).message).not.toContain("demo:demo");
    expect((caught as Error).message).not.toContain(DEMO_ACCESS_URL);
  });
});
