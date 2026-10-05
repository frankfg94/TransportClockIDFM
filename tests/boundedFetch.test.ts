import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBufferedWithTimeout } from "../server/services/idfm/boundedFetch";
describe("upstream deadline", () => {
  afterEach(() => vi.useRealTimers());
  it("bounds the body even when headers have already arrived", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetcher = vi.fn(async () => new Response(new ReadableStream({ start() {}, cancel })));
    const request = fetchBufferedWithTimeout("https://upstream.test", {}, fetcher, 100);
    const assertion = expect(request).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("bounds a fetch that ignores cancellation", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    const request = fetchBufferedWithTimeout("https://upstream.test", {}, fetcher, 100);
    const assertion = expect(request).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
  });
});
