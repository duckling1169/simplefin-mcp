import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchSimpleFinAccounts,
  MissingCredentialError,
  UpstreamError,
} from "../lib/simplefin";

const DEMO_ACCESS_URL = "https://demo:demo@beta-bridge.simplefin.org/simplefin";

describe("fetchSimpleFinAccounts", () => {
  const originalAccessUrl = process.env.SIMPLEFIN_ACCESS_URL;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    delete process.env.SIMPLEFIN_ACCESS_URL;
  });

  afterEach(() => {
    process.env.SIMPLEFIN_ACCESS_URL = originalAccessUrl;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("throws MissingCredentialError and never calls fetch when SIMPLEFIN_ACCESS_URL is unset", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    await expect(fetchSimpleFinAccounts()).rejects.toBeInstanceOf(MissingCredentialError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("parses SimpleFin's /accounts response into grouped-ready account records", async () => {
    process.env.SIMPLEFIN_ACCESS_URL = DEMO_ACCESS_URL;
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

    const accounts = await fetchSimpleFinAccounts();

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
    process.env.SIMPLEFIN_ACCESS_URL = DEMO_ACCESS_URL;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(`Unauthorized: ${DEMO_ACCESS_URL}/accounts`, { status: 401 })) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await fetchSimpleFinAccounts();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UpstreamError);
    expect((caught as Error).message).not.toContain("demo:demo");
    expect((caught as Error).message).not.toContain(DEMO_ACCESS_URL);
  });

  it("throws UpstreamError without leaking the access URL when the network request fails", async () => {
    process.env.SIMPLEFIN_ACCESS_URL = DEMO_ACCESS_URL;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error(`connect failed for ${DEMO_ACCESS_URL}`)) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await fetchSimpleFinAccounts();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(UpstreamError);
    expect((caught as Error).message).not.toContain("demo:demo");
    expect((caught as Error).message).not.toContain(DEMO_ACCESS_URL);
  });
});
