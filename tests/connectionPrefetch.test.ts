import { describe, expect, it, vi } from "vitest";
import { prefetchGtfsConnectionBatch } from "../shared/gtfs/connectionPrefetch";

describe("bounded GTFS connection prefetch", () => {
  it("starts one batch before consumption and preserves every batch in order", async () => {
    const read = vi.fn();
    async function* batches() { for (const batch of [[1, 2], [3], [4, 5]]) { read(); yield batch; } }
    const stream = prefetchGtfsConnectionBatch(batches());
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    const result = [];
    for await (const batch of stream) result.push(batch);
    expect(result).toEqual([[1, 2], [3], [4, 5]]);
    expect(read).toHaveBeenCalledTimes(3);
  });
  it("retains empty streams, errors and cleanup when the consumer stops", async () => {
    const empty = prefetchGtfsConnectionBatch((async function* () {})());
    expect(await empty.next()).toEqual({ value: undefined, done: true });
    const failure = new Error("missing shard");
    const failed = prefetchGtfsConnectionBatch((async function* (): AsyncGenerator<number> { throw failure; })());
    await expect(failed.next()).rejects.toBe(failure);
    const closed = vi.fn();
    const bounded = prefetchGtfsConnectionBatch((async function* () { try { yield 1; yield 2; } finally { closed(); } })());
    for await (const _batch of bounded) break;
    expect(closed).toHaveBeenCalledTimes(1);
  });
});
