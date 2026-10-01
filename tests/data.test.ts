import { describe, expect, it, vi } from "vitest";

const fetchAccountSet = vi.fn(async () => ({
  connections: [],
  accounts: [],
  errors: [],
}));

vi.mock("@/lib/simplefin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/simplefin")>()),
  fetchAccountSet,
}));

vi.mock("@/lib/connections", () => ({
  readSnapshot: async () => null,
  writeSnapshot: async () => {},
}));

const { getSnapshot } = await import("@/lib/data");

describe("getSnapshot", () => {
  it("shares one refresh between concurrent calls on a cold cache", async () => {
    const conn = { key: "k", keyHash: "h", accessUrl: "https://u:p@x/s" };

    await Promise.all(Array.from({ length: 5 }, () => getSnapshot(conn)));

    // One refresh is two 45-day requests.
    expect(fetchAccountSet).toHaveBeenCalledTimes(2);
  });
});
