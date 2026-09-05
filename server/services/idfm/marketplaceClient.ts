export const IDFM_MARKETPLACE_BASE_URL =
  "https://prim.iledefrance-mobilites.fr/marketplace";

const DEFAULT_MIN_REQUEST_INTERVAL_MS = 260;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30_000;
const MAX_RATE_LIMIT_COOLDOWN_MS = 24 * 60 * 60_000;

export interface IdfmMarketplaceFetchOptions {
  fetchImpl?: typeof fetch;
  rateGate?: IdfmMarketplaceRateGate;
  /** @deprecated 429 responses are circuit-broken instead of retried. */
  retryDelaysMs?: number[];
}

export interface IdfmMarketplaceRateGateOptions {
  defaultCooldownMs?: number;
  maxCooldownMs?: number;
  minRequestIntervalMs?: number;
  now?: () => number;
  wait?: (durationMs: number) => Promise<void>;
}

/**
 * PRIM applies both daily and per-second quotas. Keep one shared start-rate
 * gate for every server-side consumer so a page rendering several boards does
 * not turn into a burst of parallel requests. A 429 opens a circuit instead
 * of being retried immediately: retrying a rate limit only extends the
 * Cloudflare 1015 block and consumes more quota.
 */
export class IdfmMarketplaceRateGate {
  private readonly defaultCooldownMs: number;
  private readonly maxCooldownMs: number;
  private readonly minRequestIntervalMs: number;
  private readonly now: () => number;
  private readonly wait: (durationMs: number) => Promise<void>;
  private readonly cooldownUntilByScope = new Map<string, number>();
  private nextRequestAt = 0;
  private reservationTail: Promise<void> = Promise.resolve();

  constructor(options: IdfmMarketplaceRateGateOptions = {}) {
    this.defaultCooldownMs = options.defaultCooldownMs ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS;
    this.maxCooldownMs = options.maxCooldownMs ?? MAX_RATE_LIMIT_COOLDOWN_MS;
    this.minRequestIntervalMs = options.minRequestIntervalMs ?? DEFAULT_MIN_REQUEST_INTERVAL_MS;
    this.now = options.now ?? Date.now;
    this.wait = options.wait ?? wait;
  }

  async fetch(
    upstreamUrl: URL,
    init: RequestInit,
    fetchImpl: typeof fetch = fetch,
  ): Promise<Response> {
    const scope = getIdfmRateLimitScope(upstreamUrl);
    const cooldownResponse = await this.reserveRequestSlot(scope);

    if (cooldownResponse) {
      return cooldownResponse;
    }

    const response = await fetchImpl(upstreamUrl, init);

    if (response.status === 429) {
      const cooldownMs = getIdfmRetryDelayMs(
        response,
        this.defaultCooldownMs,
        this.maxCooldownMs,
        this.now(),
      );
      this.cooldownUntilByScope.set(
        scope,
        Math.max(this.cooldownUntilByScope.get(scope) ?? 0, this.now() + cooldownMs),
      );
    }

    return response;
  }

  private async reserveRequestSlot(scope: string): Promise<Response | undefined> {
    let releaseReservation: (() => void) | undefined;
    const previousReservation = this.reservationTail;
    this.reservationTail = new Promise<void>((resolve) => {
      releaseReservation = resolve;
    });

    await previousReservation;

    try {
      const initialCooldown = this.createCooldownResponse(scope);

      if (initialCooldown) {
        return initialCooldown;
      }

      const waitMs = Math.max(0, this.nextRequestAt - this.now());

      if (waitMs > 0) {
        await this.wait(waitMs);
      }

      const delayedCooldown = this.createCooldownResponse(scope);

      if (delayedCooldown) {
        return delayedCooldown;
      }

      this.nextRequestAt = this.now() + this.minRequestIntervalMs;
      return undefined;
    } finally {
      releaseReservation?.();
    }
  }

  private createCooldownResponse(scope: string): Response | undefined {
    const remainingMs = (this.cooldownUntilByScope.get(scope) ?? 0) - this.now();

    if (remainingMs <= 0) {
      return undefined;
    }

    return new Response(
      JSON.stringify({ message: "IDFM upstream rate-limit cooldown active" }),
      {
        status: 429,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "retry-after": String(Math.max(1, Math.ceil(remainingMs / 1_000))),
          "x-idfm-rate-limit-scope": scope,
          "x-idfm-rate-limit-source": "shared-cooldown",
        },
      },
    );
  }
}

export function getIdfmRateLimitScope(upstreamUrl: URL): string {
  const pathname = upstreamUrl.pathname.toLocaleLowerCase("en-US");

  if (pathname.includes("/v2/navitia")) return "navitia";
  if (pathname.includes("/stop-monitoring")) return "siri-unit";
  if (pathname.includes("/estimated-timetable")) return "siri-global";
  if (pathname.includes("/general-message")) return "siri-messages";
  return "marketplace-other";
}

const sharedIdfmMarketplaceRateGate = new IdfmMarketplaceRateGate();

export async function fetchIdfmMarketplaceWithRetry(
  upstreamUrl: URL,
  init: RequestInit,
  options: IdfmMarketplaceFetchOptions = {},
): Promise<Response> {
  return (options.rateGate ?? sharedIdfmMarketplaceRateGate).fetch(
    upstreamUrl,
    init,
    options.fetchImpl ?? fetch,
  );
}

export function getIdfmRetryDelayMs(
  response: Response,
  fallbackMs: number,
  maxDelayMs = MAX_RATE_LIMIT_COOLDOWN_MS,
  now = Date.now(),
): number {
  const retryAfter = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1_000, maxDelayMs);
  }

  const retryAt = retryAfter ? Date.parse(retryAfter) : Number.NaN;

  if (Number.isFinite(retryAt) && retryAt > now) {
    return Math.min(retryAt - now, maxDelayMs);
  }

  return Math.min(Math.max(1, fallbackMs), maxDelayMs);
}

function wait(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}
