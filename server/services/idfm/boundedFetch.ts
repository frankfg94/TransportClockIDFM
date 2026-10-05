/** Bound queueing, headers and body consumption, including providers ignoring abort. */
export async function fetchBufferedWithTimeout(
  input: string | URL,
  init: RequestInit,
  fetcher: typeof fetch = fetch,
  timeoutMs = 20_000,
): Promise<Response> {
  const controller = new AbortController();
  const cancel = () => controller.abort(init.signal?.reason);
  init.signal?.addEventListener("abort", cancel, { once: true });
  if (init.signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new DOMException("Upstream request timed out", "TimeoutError")), timeoutMs);
  let onAbort: () => void = () => {};
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => {
      void reader?.cancel(controller.signal.reason).catch(() => {});
      reject(controller.signal.reason);
    };
    controller.signal.addEventListener("abort", onAbort, { once: true });
    if (controller.signal.aborted) onAbort();
  });
  try {
    return await Promise.race([aborted, (async () => {
      controller.signal.throwIfAborted();
      const response = await fetcher(input, { ...init, signal: controller.signal });
      if (controller.signal.aborted) {
        void response.body?.cancel(controller.signal.reason).catch(() => {});
        controller.signal.throwIfAborted();
      }
      let body: Uint8Array<ArrayBuffer> | null = null;
      if (response.body) {
        reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            controller.signal.throwIfAborted();
            if (chunk.done) break;
            chunks.push(chunk.value);
            size += chunk.value.byteLength;
          }
        } finally {
          reader.releaseLock();
          reader = undefined;
        }
        body = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          body.set(chunk, offset);
          offset += chunk.byteLength;
        }
      }
      const headers = new Headers(response.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      return new Response(body, { status: response.status, statusText: response.statusText, headers });
    })()]);
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener("abort", onAbort);
    init.signal?.removeEventListener("abort", cancel);
  }
}
