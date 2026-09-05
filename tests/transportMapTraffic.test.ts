import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrafficDisruption, TrafficLineReport } from "../src/features/traffic/types";
import { useTransportMapTraffic } from "../src/features/transport-map/state/useTransportMapTraffic";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("global transport optional traffic", () => {
  it("starts disabled and does no work before activation", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const traffic = useTransportMapTraffic();

    expect(traffic.enabled.value).toBe(false);
    expect(traffic.status.value).toBe("disabled");
    expect(traffic.snapshot.value).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses one backend snapshot request even for thousands of lines", async () => {
    const urls: string[] = [];
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return trafficResponse([
        report("line:IDFM:C00001", "disrupted", [
          disruption("red", "Trafic interrompu entre A et B"),
        ]),
      ]);
    });

    const traffic = useTransportMapTraffic();
    await traffic.refresh(Array.from({ length: 85 }, (_, index) => `line:IDFM:C${String(index).padStart(5, "0")}`));

    expect(urls.length).toBe(1);
    expect(new URL(urls[0]!, "http://localhost").pathname).toBe("/api/traffic");
    expect(new URL(urls[0]!, "http://localhost").searchParams.get("locale")).toBe("fr");
    expect(Math.max(...urls.map((url) => url.length))).toBeLessThan(8_000);
    expect(traffic.status.value).toBe("ready");
    expect(traffic.snapshot.value?.lineImpacts).toEqual([{
      lineId: "line:IDFM:C00001",
      kind: "interruption",
      disruptions: [expect.objectContaining({ id: "red" })],
    }]);
  });

  it("keeps only current usable disruptions and prioritizes red", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", async () => trafficResponse([
      report("line:IDFM:C01730", "disrupted", [
        disruption("orange", "Trafic perturbé entre Paris Est et Provins"),
        disruption("red", "Trafic interrompu entre Paris Est et Tournan"),
      ]),
      report("line:IDFM:C00002", "planned", [
        disruption("expired", "Travaux", [{ begin: "2020-01-01", end: "2020-01-02" }]),
      ]),
      report("line:IDFM:C00003", "normal", [disruption("ignored-normal", "Trafic interrompu")]),
      report("line:IDFM:C00004", "error", [disruption("ignored-error", "Trafic interrompu")]),
    ]));

    const traffic = useTransportMapTraffic();
    await traffic.refresh(["line:IDFM:C01730"]);

    expect(traffic.snapshot.value?.lineImpacts).toHaveLength(1);
    expect(traffic.snapshot.value?.lineImpacts[0]).toMatchObject({
      lineId: "line:IDFM:C01730",
      kind: "interruption",
    });
    expect(traffic.snapshot.value?.lineImpacts[0]?.disruptions.map(({ id }) => id)).toEqual(["red", "orange"]);
  });

  it("does not mark any line when the optional source is unconfigured or rate-limited", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({
      configured: false,
      lines: [report("line:IDFM:C00001", "error", [])],
    }), { status: 200 }));

    const traffic = useTransportMapTraffic();
    await traffic.refresh(["line:IDFM:C00001"]);

    expect(traffic.status.value).toBe("error");
    expect(traffic.snapshot.value).toBeUndefined();

    vi.stubGlobal("fetch", async () => trafficResponse([
      { ...report("line:IDFM:C00001", "error", []), error: "429 Too Many Requests" },
    ]));
    await traffic.refresh(["line:IDFM:C00001"]);

    expect(traffic.status.value).toBe("error");
    expect(traffic.snapshot.value).toBeUndefined();

    vi.stubGlobal("fetch", async () => new Response("rate limited", { status: 429 }));
    await traffic.refresh(["line:IDFM:C00001"]);

    expect(traffic.status.value).toBe("error");
    expect(traffic.snapshot.value).toBeUndefined();
  });

  it("keeps a stale snapshot after a later failure", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(trafficResponse([
        report("line:IDFM:C01730", "information", [disruption("orange", "Trafic perturbé")]),
      ]))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    const traffic = useTransportMapTraffic();

    await traffic.refresh(["line:IDFM:C01730"]);
    const firstSnapshot = traffic.snapshot.value;
    await traffic.refresh(["line:IDFM:C01730"]);

    expect(traffic.status.value).toBe("stale");
    expect(traffic.snapshot.value).toBe(firstSnapshot);
  });

  it("ignores a response completed after traffic was disabled", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    let resolveResponse!: (response: Response) => void;
    vi.stubGlobal("fetch", () => new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    }));
    const traffic = useTransportMapTraffic();

    const refresh = traffic.refresh(["line:IDFM:C01730"]);
    expect(traffic.status.value).toBe("loading");
    traffic.disable();
    resolveResponse(trafficResponse([
      report("line:IDFM:C01730", "disrupted", [disruption("red", "Trafic interrompu")]),
    ]));
    await refresh;

    expect(traffic.enabled.value).toBe(false);
    expect(traffic.status.value).toBe("disabled");
    expect(traffic.snapshot.value).toBeUndefined();
  });
});

function trafficResponse(lines: TrafficLineReport[]): Response {
  return new Response(JSON.stringify({
    configured: true,
    generatedAt: "2026-08-11T12:00:00.000Z",
    lines,
  }), { status: 200 });
}

function report(
  lineRef: string,
  status: TrafficLineReport["status"],
  disruptions: TrafficDisruption[],
): TrafficLineReport {
  return { lineRef, status, disruptions };
}

function disruption(
  id: string,
  title: string,
  applicationPeriods: TrafficDisruption["applicationPeriods"] = [],
): TrafficDisruption {
  return {
    id,
    title,
    kind: "incident",
    applicationPeriods,
    impactedLineRefs: ["line:IDFM:C01730"],
    impactedStopNames: [],
  };
}
