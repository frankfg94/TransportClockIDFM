import { describe, expect, it } from "vitest";
import { buildVerdictTransportIntegrity, compareVerdictTransportSnapshots } from "../src/features/nearby-stations/verdictTransportDebug";
const snapshot = () => ({ revision: "fixture", origin: { lon: 2.3, lat: 48.8 }, journeyDateTime: "20261014T090000",
  loading: { heavy: false, stations: false, serviceQuality: false },
  result: { categories: [{ id: "transport", score: 8, positiveFacts: [{ id: "rer-b", label: "RER B via BUS 162", observedAt: "before" }], neutralFacts: [], negativeFacts: [] }] },
  diagnostics: { benchmarks: [{ id: "chatelet", status: "ready", journeys: [{ durationSeconds: 1800 }] }], frequencies: [{ lineId: "b" }], lastServices: [] }, heavyCandidates: [] });
describe("transport data integrity and environment comparison", () => {
  it("distinguishes a completed initial calculation from a visibility refresh without hiding current loading", () => {
    const data = snapshot(); data.loading.heavy = true;
    const runs = [
      { id: 1, system: "heavy-transports", task: "resolve", startMs: 0, status: "ready" as const, details: { phase: "initial", reason: "inputs" } },
      { id: 2, system: "heavy-transports", task: "resolve", startMs: 100, status: "running" as const, details: { phase: "refresh", reason: "visibility" } },
    ];
    expect(buildVerdictTransportIntegrity(data, runs)).toMatchObject({ status: "loading",
      calculation: { initialCompleted: true, initialInProgress: false, refreshInProgress: true, reason: "visibility" } });
    expect(buildVerdictTransportIntegrity(data, [])).toMatchObject({ calculation: { initialCompleted: false, initialInProgress: true } });
  });
  it("deduplicates measured request and pair IDs instead of interpreting cumulative observations as HTTP calls", () => {
    const step = { task: "walking-matrix", details: { phase: "final-line-access", destinations: 2,
      pairIds: ["one", "two"], proxyRequests: [{ requestId: "actual-http", cause: "success" }], estimated: 0 } };
    const worker = { id: 1, system: "gtfs-worker", task: "routes", startMs: 0, status: "ready" as const,
      details: { purpose: "transport", steps: [step, step] } };
    expect(buildVerdictTransportIntegrity(snapshot(), [worker]).walkingVolumes.phases[0]).toMatchObject({
      phase: "final-line-access", consultations: 2, pairUsages: 4, uniquePairs: 2, proxyHttpRequests: 1,
    });
  });
  it("detects a missing RER B fact even when both calculations completed", () => {
    const local = snapshot(), prod = snapshot(); prod.result.categories[0]!.positiveFacts = [];
    const result = compareVerdictTransportSnapshots(prod, local);
    expect(result.status).toBe("different"); expect(result.sameContext).toBe(true);
    expect(result.missingFacts).toEqual([expect.objectContaining({ id: "rer-b" })]);
    expect(result.differenceCount).toBeGreaterThan(0);
  });
  it("ignores only observation clocks, keeps departure times, durations and route metadata", () => {
    const local = snapshot(), prod = snapshot(); prod.result.categories[0]!.positiveFacts[0]!.observedAt = "after";
    expect(compareVerdictTransportSnapshots(local, prod).status).toBe("equal");
    prod.diagnostics.benchmarks[0]!.journeys[0]!.durationSeconds++;
    expect(compareVerdictTransportSnapshots(local, prod).status).toBe("different");
    prod.journeyDateTime = "20261015T090000";
    expect(compareVerdictTransportSnapshots(local, prod).sameContext).toBe(false);
  });
  it("reports a resolved estimated walk as degraded, not complete", () => {
    const task = { id: 1, system: "gtfs-worker", task: "routes", startMs: 0, status: "ready" as const,
      details: { purpose: "transport", steps: [{ task: "walking-matrix", details: { estimated: 1, unavailabilityReasons: ["quota-exceeded"] } }] } };
    const quality = buildVerdictTransportIntegrity(snapshot(), [task]);
    expect(quality.status).toBe("degraded"); expect(quality.issues).toEqual([expect.objectContaining({ code: "estimated-transport-walking" })]);
    expect(quality.comparison).toBe("not-compared");
  });
  it("reports excluded unverified bus accesses explicitly", () => {
    const quality = buildVerdictTransportIntegrity(snapshot(), [{ id: 1, startMs: 0, status: "ready", system: "heavy-targets", task: "eligibility",
      details: { lineCode: "B", rejected: [{ reason: "unverified-bus-walking-access", count: 1 }] } }]);
    expect(quality.status).toBe("degraded"); expect(quality.issues[0]).toMatchObject({ code: "excluded-unverified-bus-access" });
  });
  it("reports missing benchmark journeys while retaining completed versus loading state", () => {
    const data = snapshot(); data.diagnostics.benchmarks[0]!.journeys = [];
    expect(buildVerdictTransportIntegrity(data, []).status).toBe("degraded");
    data.loading.heavy = true; expect(buildVerdictTransportIntegrity(data, []).status).toBe("loading");
  });
});
