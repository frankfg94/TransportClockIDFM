import type { VerdictDebugTask } from "../../services/verdictDebugTimeline";

type Snapshot = Record<string, any>;
const observationFields = new Set(["observedAt", "generatedAt", "computedAt", "fetchedAt", "updatedAt", "timingObservedAt"]);
function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort()
    .filter(key => !observationFields.has(key) && value[key] !== undefined).map(key => [key, stable(value[key])]));
  return value;
}

/** Same public projection in both environments; no requests or inferred
 * counterpart. Departure times, provider versions and every route are kept. */
export function projectVerdictTransportSnapshot(snapshot: Snapshot) {
  const transport = snapshot.result?.categories?.find((category: Snapshot) => category.id === "transport");
  const facts = transport ? ["positiveFacts", "negativeFacts", "neutralFacts"].flatMap(group =>
    (transport[group] ?? []).map((fact: Snapshot) => ({ ...fact, group }))) : [];
  return stable({
    context: { lon: snapshot.origin?.lon, lat: snapshot.origin?.lat, journeyDateTime: snapshot.journeyDateTime,
      nightJourneyDateTime: snapshot.nightJourneyDateTime },
    transport, heavyCandidates: snapshot.heavyCandidates,
    benchmarks: snapshot.diagnostics?.benchmarks, frequencies: snapshot.diagnostics?.frequencies,
    lastServices: snapshot.diagnostics?.lastServices, noctilienJourneys: snapshot.diagnostics?.noctilienJourneys,
    lineTargets: snapshot.diagnostics?.lineTargets, futureProjects: snapshot.futureProjects,
    serviceQuality: snapshot.serviceQuality,
    factIds: facts.map((fact: Snapshot) => ({ id: fact.id, kind: fact.kind, label: fact.label, labelValues: fact.labelValues, group: fact.group })),
  });
}

export function compareVerdictTransportSnapshots(current: Snapshot, reference: Snapshot) {
  const a = projectVerdictTransportSnapshot(current), b = projectVerdictTransportSnapshot(reference);
  const differences: { path: string; current: unknown; reference: unknown }[] = [];
  let differenceCount = 0;
  function compare(left: any, right: any, path: string) {
    if (JSON.stringify(left) === JSON.stringify(right)) return;
    if (!left || !right || typeof left !== "object" || typeof right !== "object") {
      differenceCount++;
      if (differences.length < 200) differences.push({ path, current: left, reference: right });
      return;
    }
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) compare(left[key], right[key], `${path}/${key}`);
  }
  compare(a, b, "");
  const ids = (value: any) => new Set<string>((value.factIds ?? []).map((fact: Snapshot) => fact.id));
  const currentIds = ids(a), referenceIds = ids(b);
  return { status: differenceCount ? "different" as const : "equal" as const,
    sameContext: JSON.stringify(a.context) === JSON.stringify(b.context),
    revisions: { current: current.revision, reference: reference.revision }, differenceCount, differences,
    missingFacts: (b.factIds ?? []).filter((fact: Snapshot) => !currentIds.has(fact.id)),
    additionalFacts: (a.factIds ?? []).filter((fact: Snapshot) => !referenceIds.has(fact.id)),
  };
}

/** Completion and data quality are distinct. A resolved fallback or filtered
 * access must never be mistaken for a fully verified transport result. */
export function buildVerdictTransportIntegrity(snapshot: Snapshot, tasks: readonly VerdictDebugTask[]) {
  const workers = tasks.filter(task => task.system === "gtfs-worker" && task.status === "ready"
    && ["transport", "night-transport"].includes(String(task.details?.purpose)));
  const matrices = workers.flatMap(task => Array.isArray(task.details?.steps) ? task.details.steps : [])
    .filter((step: Snapshot) => step.task === "walking-matrix");
  const degradedMatrices = matrices.filter((step: Snapshot) => Number(step.details?.estimated) > 0);
  const excludedAccesses = tasks.filter(task => task.system === "heavy-targets" && task.status === "ready")
    .flatMap(task => Array.isArray(task.details?.rejected) ? task.details.rejected
      .filter((entry: Snapshot) => entry.reason === "unverified-bus-walking-access")
      .map((entry: Snapshot) => ({ station: task.details?.station, stationName: task.details?.stationName,
        lineId: task.details?.lineId, lineCode: task.details?.lineCode, ...entry })) : []);
  const excludedFeeders = workers.flatMap(task => Array.isArray(task.details?.excludedFeederAccesses) ? task.details.excludedFeederAccesses : []);
  const benchmarks = snapshot.diagnostics?.benchmarks ?? [];
  const missingBenchmarks = benchmarks.filter((benchmark: Snapshot) => benchmark.status !== "loading" && !benchmark.journeys?.length)
    .map((benchmark: Snapshot) => ({ id: benchmark.id, status: benchmark.status }));
  const loading = snapshot.loading?.heavy || snapshot.loading?.stations || snapshot.loading?.serviceQuality
    || (snapshot.performance?.transitions?.at(-1)?.transportPending?.length ?? 0) > 0;
  const issues = [
    ...(degradedMatrices.length ? [{ code: "estimated-transport-walking", matrices: degradedMatrices.length,
      estimatedPairs: degradedMatrices.reduce((count: number, step: Snapshot) => count + Number(step.details?.estimated ?? 0), 0),
      reasons: [...new Set(degradedMatrices.flatMap((step: Snapshot) => step.details?.unavailabilityReasons ?? ["unspecified"]))] }] : []),
    ...(excludedAccesses.length ? [{ code: "excluded-unverified-bus-access", accesses: excludedAccesses }] : []),
    ...(excludedFeeders.length ? [{ code: "excluded-unverified-boarding-stops", accesses: excludedFeeders }] : []),
    ...(missingBenchmarks.length ? [{ code: "missing-benchmark-journeys", destinations: missingBenchmarks }] : []),
  ];
  return { status: loading ? "loading" as const : issues.length ? "degraded" as const : "complete" as const,
    comparison: "not-compared", issues,
    counts: { benchmarks: benchmarks.length, readyBenchmarks: benchmarks.filter((benchmark: Snapshot) => Boolean(benchmark.journeys?.length)).length,
      heavyStations: snapshot.heavyCandidates?.length ?? 0, frequencies: snapshot.diagnostics?.frequencies?.length ?? 0,
      lastServices: snapshot.diagnostics?.lastServices?.length ?? 0 },
    walkingProviders: [...new Set(matrices.flatMap((step: Snapshot) => step.details?.providers ?? []))],
    walkingDatasetVersions: [...new Set(matrices.flatMap((step: Snapshot) => step.details?.datasetVersions ?? []))],
  };
}
