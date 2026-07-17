import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MissingCredentialError, UpstreamError } from "../lib/simplefin";

const DEMO_ACCESS_URL = "https://demo:demo@beta-bridge.simplefin.org/simplefin";

const { fetchSimpleFinAccounts } = vi.hoisted(() => ({
  fetchSimpleFinAccounts: vi.fn(),
}));

vi.mock("../lib/simplefin", async () => {
  const actual = await vi.importActual<typeof import("../lib/simplefin")>("../lib/simplefin");
  return { ...actual, fetchSimpleFinAccounts };
});

async function renderHome(): Promise<string> {
  const { default: Home } = await import("../app/page");
  const element = await Home();
  return renderToStaticMarkup(element);
}

describe("Home page", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("renders accounts grouped by institution with balance, currency, and as-of date", async () => {
    fetchSimpleFinAccounts.mockResolvedValue([
      {
        id: "acct-1",
        name: "Checking",
        orgName: "Demo Bank",
        currency: "USD",
        balance: "1234.56",
        balanceDate: 1700000000,
      },
      {
        id: "acct-2",
        name: "Savings",
        orgName: "Demo Bank",
        currency: "USD",
        balance: "500.00",
        balanceDate: 1700000000,
      },
    ]);

    const html = await renderHome();

    expect(html).toContain("Demo Bank");
    expect(html).toContain("Checking");
    expect(html).toContain("Savings");
    expect(html).toContain("$1,234.56");
    expect(html).toContain("$500.00");
  });

  it("shows a clear error state, not a crash, when SIMPLEFIN_ACCESS_URL is unset", async () => {
    fetchSimpleFinAccounts.mockRejectedValue(new MissingCredentialError());

    const html = await renderHome();

    expect(html).toContain("not configured");
    expect(html).not.toContain("undefined");
  });

  it("shows a clear error state, not a raw upstream error, when SimpleFin's API fails", async () => {
    fetchSimpleFinAccounts.mockRejectedValue(new UpstreamError("SimpleFin returned an error (status 401)."));

    const html = await renderHome();

    expect(html).toContain("Could not load accounts");
  });

  it("never renders the access URL or its embedded credential, even on error", async () => {
    fetchSimpleFinAccounts.mockRejectedValue(
      new UpstreamError(`SimpleFin returned an error: ${DEMO_ACCESS_URL}/accounts`),
    );

    const html = await renderHome();

    expect(html).not.toContain("demo:demo");
    expect(html).not.toContain(DEMO_ACCESS_URL);
  });
});
