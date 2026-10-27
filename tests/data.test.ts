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

const readSnapshot = vi.fn(
  async (): Promise<{ json: string; fetchedAt: number } | null> => null,
);

vi.mock("@/lib/connections", () => ({
  readSnapshot,
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

  it("serves the stale cache when a refresh fails", async () => {
    const conn = { key: "k", keyHash: "h2", accessUrl: "https://u:p@x/s" };
    const old = {
      connections: [],
      accounts: [],
      errors: [],
      fetchedAt: 0,
      windowStart: 0,
    };
    readSnapshot.mockResolvedValueOnce({
      json: JSON.stringify(old),
      fetchedAt: 0,
    });
    fetchAccountSet.mockRejectedValueOnce(
      new Error("SimpleFin didn't respond"),
    );

    const snap = await getSnapshot(conn);

    expect(snap.staleReason).toBe("SimpleFin didn't respond");
  });

  it("still fails when there is no cache to fall back on", async () => {
    const conn = { key: "k", keyHash: "h3", accessUrl: "https://u:p@x/s" };
    fetchAccountSet.mockRejectedValueOnce(new Error("down"));

    await expect(getSnapshot(conn)).rejects.toThrow("down");
  });
});
