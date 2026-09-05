import { afterEach, describe, expect, it, vi } from "vitest";
import type { H3Event } from "h3";
import trafficHandler from "../server/api/traffic.get";
import {
  getTrafficCacheStatus,
  getTrafficSnapshot,
  refreshTrafficSnapshot,
  resetTrafficCacheForTests,
} from "../server/services/idfm/traffic";
import type { TrafficDisruption } from "../src/features/traffic/types";

const GLOBAL_URL = "https://idfm.test/marketplace/disruptions_bulk/disruptions/v2";
const API_KEY = "traffic-test-key";

afterEach(() => {
  resetTrafficCacheForTests();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("unified IDFM traffic cache", () => {
  it("filters 2,000 line references locally after one global upstream call", async () => {
    const lineRefs = Array.from(
      { length: 2_000 },
      (_, index) => `line:IDFM:C${String(index).padStart(5, "0")}`,
    );
    const fetchMock = vi.fn(async () => jsonResponse(globalPayload(lineRefs)));
    vi.stubGlobal("fetch", fetchMock);

    const query = lineRefs.join(",");
    const response = await trafficHandler(createEvent(`/api/traffic?lineRefs=${query}`));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.lines).toHaveLength(2_000);

    const filtered = await trafficHandler(
      createEvent("/api/traffic?lineRefs=line%3AIDFM%3AC00001,line%3AIDFM%3AC01999"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(filtered.lines.map(({ lineRef }) => lineRef)).toEqual([
      "line:IDFM:C00001",
      "line:IDFM:C01999",
    ]);
  });

  it("prefers the regular API key for bulk and Navitia detail when both keys exist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));
    const calls: Array<{
      url: string;
      apiKey: string | null;
      authorization: string | null;
      acceptLanguage: string | null;
    }> = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(input),
        apiKey: headers.get("apikey"),
        authorization: headers.get("authorization"),
        acceptLanguage: headers.get("accept-language"),
      });
      if (String(input).includes("line_reports/lines")) {
        return jsonResponse({
          line_reports: [{ disruptions: [disruption("detail-key", "Détail ciblé")] }],
        });
      }
      return jsonResponse(globalPayload(["line:IDFM:C01730"]));
    });
    vi.stubGlobal("fetch", fetchMock);

    await trafficHandler(createEvent("/api/traffic", { datasetKey: "dataset-test-key" }));
    vi.advanceTimersByTime(60_001);
    await trafficHandler(
      createEvent(
        "/api/traffic?lineRefs=line%3AIDFM%3AC01730&detail=1",
        { datasetKey: "dataset-test-key" },
      ),
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.apiKey).toBe(API_KEY);
    expect(calls[0]?.authorization).toBeNull();
    expect(calls[0]?.acceptLanguage).toBe("fr-FR,fr;q=0.9,en;q=0.8");
    expect(calls[1]?.apiKey).toBe(API_KEY);
    expect(calls[1]?.authorization).toBeNull();
    expect(calls[1]?.acceptLanguage).toBe("fr-FR,fr;q=0.9,en;q=0.8");
  });

  it("uses the dataset credential as a fallback only when the regular API key is absent", async () => {
    const calls: Array<{ apiKey: string | null; authorization: string | null }> = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({
        apiKey: headers.get("apikey"),
        authorization: headers.get("authorization"),
      });
      return jsonResponse(globalPayload(["line:IDFM:C01730"]));
    });
    vi.stubGlobal("fetch", fetchMock);

    await trafficHandler(
      createEvent("/api/traffic", {
        apiKey: "",
        datasetKey: "dataset-test-key",
      }),
    );

    expect(calls).toEqual([
      { apiKey: null, authorization: "apikey dataset-test-key" },
    ]);
  });

  it("coalesces concurrent cold requests into one global request", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const first = getTrafficSnapshot(createEvent("/api/traffic"));
    const second = getTrafficSnapshot(createEvent("/api/traffic"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch(jsonResponse(globalPayload(["line:IDFM:C01730"])));
    const [left, right] = await Promise.all([first, second]);
    expect(left.response.lines).toHaveLength(1);
    expect(right.response.lines).toHaveLength(1);
  });

  it("keeps one global snapshot per selected language", async () => {
    const acceptLanguages: string[] = [];
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      acceptLanguages.push(new Headers(init?.headers).get("accept-language") ?? "");
      return jsonResponse(globalPayload(["line:IDFM:C01730"]));
    });
    vi.stubGlobal("fetch", fetchMock);

    await trafficHandler(createEvent("/api/traffic?locale=fr"));
    await trafficHandler(createEvent("/api/traffic?locale=fr"));
    await trafficHandler(createEvent("/api/traffic?locale=en"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(acceptLanguages).toEqual([
      "fr-FR,fr;q=0.9,en;q=0.8",
      "en-US,en;q=0.9,fr;q=0.8",
    ]);
  });

  it("serves fresh cache data without another upstream call and refreshes after 150 seconds", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));
    const fetchMock = vi.fn(async () => jsonResponse(globalPayload(["line:IDFM:C01730"])));
    vi.stubGlobal("fetch", fetchMock);

    await getTrafficSnapshot(createEvent("/api/traffic"));
    const fresh = await getTrafficSnapshot(createEvent("/api/traffic"));
    expect(fresh.response.cache?.state).toBe("hit");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(150_001);
    await getTrafficSnapshot(createEvent("/api/traffic"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("merges a selected-line detail report only when the global snapshot is older than one minute", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));
    const detailDisruption = disruption("detail", "Incident ciblé");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("line_reports/lines")) {
        return jsonResponse({
          line_reports: [{ disruptions: [detailDisruption] }],
        });
      }
      return jsonResponse(globalPayload(["line:IDFM:C01730"]));
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await trafficHandler(createEvent("/api/traffic"));
    expect(first.lines[0]?.disruptions).toEqual([]);

    vi.advanceTimersByTime(60_001);
    const selected = await trafficHandler(
      createEvent("/api/traffic?lineRefs=line%3AIDFM%3AC01730&detail=1"),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(selected.lines[0]?.disruptions[0]?.id).toBe("detail");
    expect(selected.source).toBe("mixed-cache");
  });

  it("keeps the previous snapshot when the global endpoint returns 429", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));
    const previous = disruption("previous", "Trafic perturbe");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(globalPayload(["line:IDFM:C01730"], [previous])))
      .mockResolvedValueOnce(new Response("quota", { status: 429, statusText: "Too Many Requests" }));
    vi.stubGlobal("fetch", fetchMock);

    const initial = await getTrafficSnapshot(createEvent("/api/traffic"));
    vi.advanceTimersByTime(150_001);
    const stale = await getTrafficSnapshot(createEvent("/api/traffic"));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stale.response.lines).toEqual(initial.response.lines);
    expect(stale.response.cache?.state).toBe("rate-limited");

    const status = await getTrafficCacheStatus(createEvent("/api/traffic/status"));
    expect(status.cache.state).toBe("rate-limited");
    expect(status.cache.lastError).toContain("429");
  });

  it("limits a manual refresh while the previous global attempt is recent", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));
    const fetchMock = vi.fn(async () => jsonResponse(globalPayload(["line:IDFM:C01730"])));
    vi.stubGlobal("fetch", fetchMock);

    await getTrafficSnapshot(createEvent("/api/traffic"));
    const manual = await refreshTrafficSnapshot(createEvent("/api/traffic/refresh"));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(manual.response.cache?.state).toBe("rate-limited");
  });
});

function createEvent(
  path: string,
  options: { apiKey?: string; datasetKey?: string } = {},
): H3Event {
  const headers = new Map<string, string>();
  return {
    path,
    context: {
      cloudflare: {
        env: {
          IDFM_API_KEY: options.apiKey ?? API_KEY,
          NUXT_IDFM_TRAFFIC_GLOBAL_URL: GLOBAL_URL,
          ...(options.datasetKey ? { IDFM_DATASET_KEY: options.datasetKey } : {}),
        },
      },
    },
    node: {
      res: {
        setHeader(name: string, value: string): void {
          headers.set(name, value);
        },
      },
    },
  } as unknown as H3Event;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

function globalPayload(lineRefs: string[], disruptions: TrafficDisruption[] = []): unknown {
  return {
    lines: lineRefs.map((id) => ({ id })),
    disruptions: disruptions.map((item) => ({
      id: item.id,
      title: item.title,
      message: item.message,
      cause: item.cause ?? "PERTURBATION",
      severity: item.severity ?? "INFORMATION",
      applicationPeriods: item.applicationPeriods,
      impactedObjects: item.impactedLineRefs.map((id) => ({
        type: "line",
        id,
        name: id,
        disruptionIds: [item.id],
      })),
    })),
  };
}

function disruption(id: string, title: string): TrafficDisruption {
  return {
    id,
    title,
    kind: "incident",
    applicationPeriods: [],
    impactedLineRefs: ["line:IDFM:C01730"],
    impactedStopNames: [],
  };
}
