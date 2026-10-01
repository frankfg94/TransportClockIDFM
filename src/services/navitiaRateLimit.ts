import { computed, ref } from "vue";

export type IdfmRateLimitScope = "navitia" | "siri-unit" | "siri-global" | "siri-line" | "siri-messages";

const retryAtByScope = ref<Partial<Record<IdfmRateLimitScope, number>>>({});

export function getIdfmRequestScope(input: RequestInfo | URL): IdfmRateLimitScope {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const pathname = new URL(url, "http://localhost").pathname.toLowerCase();
  if (pathname.includes("/stop-monitoring")) return "siri-unit";
  if (pathname.includes("/estimated-timetable")) return "siri-global";
  if (pathname.includes("/requete-ligne")) return "siri-line";
  if (pathname.includes("/general-message")) return "siri-messages";
  return "navitia";
}

export interface NavitiaRetryDelay {
  totalSeconds: number;
  hours: number;
  minutes: number;
  seconds: string;
}

export function getNavitiaRetryDelay(
  deadline: number,
  now = Date.now(),
): NavitiaRetryDelay {
  const totalSeconds = Math.max(0, Math.ceil((deadline - now) / 1000));

  return {
    totalSeconds,
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: String(totalSeconds % 60).padStart(2, "0"),
  };
}

export class NavitiaRateLimitError extends Error {
  constructor(public readonly retryAt: number, public readonly scope: IdfmRateLimitScope = "navitia") {
    super(`navitia-rate-limit-429;retryAt=${retryAt}`);
    this.name = "NavitiaRateLimitError";
  }
}

export function assertNavitiaAvailable(scope: IdfmRateLimitScope = "navitia"): void {
  const deadline = retryAtByScope.value[scope] ?? 0;
  if (deadline > Date.now()) throw new NavitiaRateLimitError(deadline, scope);
}

export function recordNavitiaRateLimit(response: Response, scope: IdfmRateLimitScope = "navitia"): NavitiaRateLimitError {
  const header = response.headers.get("retry-after");
  const seconds = header ? Number(header) : NaN;
  const date = header ? Date.parse(header) : NaN;
  const deadline = Number.isFinite(seconds) && seconds >= 0
    ? Date.now() + seconds * 1000
    : Number.isFinite(date) && date > Date.now() ? date : Date.now() + 30_000;
  const scopeDeadline = Math.max(retryAtByScope.value[scope] ?? 0, deadline);
  retryAtByScope.value[scope] = scopeDeadline;
  return new NavitiaRateLimitError(scopeDeadline, scope);
}

export function isNavitiaRateLimit(cause: unknown): boolean {
  return cause instanceof NavitiaRateLimitError;
}

export const navitiaRetryAt = computed(() => retryAtByScope.value.navitia ?? 0);
export const idfmRetryAt = computed(() => Math.max(0, ...Object.values(retryAtByScope.value)));
