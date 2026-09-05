import { describe, expect, it } from "vitest";
import { BoundedLruCache } from "../src/features/transport-map/data/decodedChunkCache";

describe("transport map bounded cache", () => {
  it("updates LRU order, disposes evicted entries and stays under byte budget", () => {
    const disposed: string[] = [];
    const cache = new BoundedLruCache<string>(3, 10);
    cache.set("a", { value: "a", bytes: 4, dispose: (value) => disposed.push(value) });
    cache.set("b", { value: "b", bytes: 4, dispose: (value) => disposed.push(value) });
    expect(cache.get("a")).toBe("a");
    cache.set("c", { value: "c", bytes: 4, dispose: (value) => disposed.push(value) });
    expect(cache.has("b")).toBe(false);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("c")).toBe(true);
    expect(cache.metrics().bytes).toBeLessThanOrEqual(10);
    expect(disposed).toEqual(["b"]);
  });

  it("replaces a key without leaking the previous resource", () => {
    const disposed: string[] = [];
    const cache = new BoundedLruCache<string>(2, 100);
    cache.set("chunk", { value: "old", bytes: 2, dispose: (value) => disposed.push(value) });
    cache.set("chunk", { value: "new", bytes: 3, dispose: (value) => disposed.push(value) });
    expect(cache.get("chunk")).toBe("new");
    expect(cache.metrics().bytes).toBe(3);
    expect(disposed).toEqual(["old"]);
  });
});
