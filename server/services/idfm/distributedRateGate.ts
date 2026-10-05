import type { H3Event } from "h3";
import { getIdfmRateLimitScope, getIdfmRetryDelayMs } from "./marketplaceClient";

export interface IdfmRateGateNamespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}
export function getIdfmRateGateBinding(event: H3Event): IdfmRateGateNamespace | undefined {
  return (event.context as { cloudflare?: { env?: { IDFM_RATE_GATE?: IdfmRateGateNamespace } } }).cloudflare?.env?.IDFM_RATE_GATE;
}

export async function fetchWithDistributedRateGate(namespace: IdfmRateGateNamespace, url: URL, init: RequestInit, fetcher: typeof fetch): Promise<Response> {
  const key = new Headers(init.headers).get("apikey");
  if (!key) throw new Error("IDFM rate gate requires a server credential");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const name = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const stub = namespace.get(namespace.idFromName(name));
  const scope = getIdfmRateLimitScope(url);
  async function command(path: string, body: Record<string, unknown>) {
    init.signal?.throwIfAborted();
    const response = await stub.fetch(new Request(`https://rate-gate/${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: init.signal,
    }));
    if (!response.ok) throw new Error(`IDFM shared rate gate unavailable: ${response.status}`);
    return response.json() as Promise<{ startsAt?: number; retryAfterMs?: number }>;
  }
  const reservation = await command("reserve", { scope });
  if (reservation.retryAfterMs) return cooldownResponse(reservation.retryAfterMs, scope);
  const waitMs = Math.max(0, (reservation.startsAt ?? 0) - Date.now());
  if (waitMs > 0) {
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(init.signal?.reason); };
      const timer = setTimeout(() => { init.signal?.removeEventListener("abort", cancel); resolve(); }, waitMs);
      init.signal?.addEventListener("abort", cancel, { once: true });
      if (init.signal?.aborted) cancel();
    });
    const check = await command("check", { scope });
    if (check.retryAfterMs) return cooldownResponse(check.retryAfterMs, scope);
  }
  init.signal?.throwIfAborted();
  const response = await fetcher(url, init);
  if (response.status === 429) {
    await command("cooldown", { scope, durationMs: getIdfmRetryDelayMs(response, 30_000) });
  }
  return response;
}
function cooldownResponse(ms: number, scope: string): Response {
  return Response.json({ message: "IDFM upstream rate-limit cooldown active" }, { status: 429, headers: {
    "retry-after": String(Math.ceil(ms / 1_000)), "x-idfm-rate-limit-source": "distributed-cooldown", "x-idfm-rate-limit-scope": scope,
  } });
}
