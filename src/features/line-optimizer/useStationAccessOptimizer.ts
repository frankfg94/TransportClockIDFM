import { computed, onBeforeUnmount, onMounted, ref, shallowReactive, shallowRef, watch } from "vue";
import { createIgnTransportMapGeocoder } from "../../services/geocoding/ign";
import { fetchGtfsLineTimetable } from "../../services/lineFrequencyTimetable";
import { toAddressBookPoint, useAddressBook, type AddressBookEntry } from "../address-book/addressBook";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import { TransportMapDataSource } from "../transport-map/data/createTransportMapDataSource";
import { fetchGpeStations, type GpeMapStation } from "../transport-map/gpeStationsApi";
import { parisDateTime } from "../nearby-stations/travelTurbo";
import { DEFAULT_OPTIMIZER_SETTINGS } from "./lineOptimizer";
import { createLineOptimizerProvider } from "./lineOptimizerProvider";
import { stationAccessJourneys, stationAccessUltimateJourney, type StationAccessDepartureMode, type StationAccessJourney } from "./stationAccessJourneys";
import { publicTimetableStations, resolveStationAccessDestination, stationAccessLines, stationAccessTargets, type StationAccessCatalog, type StationAccessTarget } from "./stationAccessTargets";
import { matchingAddress, resolveOptimizerStart } from "./useLineOptimizer";

const settings = {
  ...DEFAULT_OPTIMIZER_SETTINGS,
  walkSeconds: undefined,
  transferSeconds: undefined,
  preferSemiDirect: false,
};
const STATION_ACCESS_CONCURRENCY = 3;

export interface StationAccessRow {
  target: StationAccessTarget;
  state: "queued" | "running" | "ready" | "empty" | "error";
  options: StationAccessJourney[];
  complete?: boolean;
  ultimate?: { state: "running" | "empty" | "error" } |
    { state: "ready"; journey: StationAccessJourney; complete: boolean };
}

type StationAccessAnalysis = Omit<StationAccessRow, "options"> & {
  optionsByMode?: Record<Exclude<StationAccessDepartureMode, "ultimate">, StationAccessJourney[]>;
};

type StationAccessRun = {
  origin: GeocoderPoint;
  start: number;
  analyze: ReturnType<ReturnType<typeof createLineOptimizerProvider>["createStationAccessSession"]>;
  destinations: Map<string, GeocoderPoint>;
};

export function useStationAccessOptimizer() {
  const addressBook = useAddressBook();
  const geocoder = createIgnTransportMapGeocoder();
  const provider = createLineOptimizerProvider();
  let catalogController: AbortController | undefined;
  const network = shallowRef<StationAccessCatalog>();
  const projects = shallowRef<GpeMapStation[]>([]);
  const catalogLoading = ref(true);
  const catalogIncomplete = ref(false);
  const lines = computed(() => stationAccessLines(network.value, projects.value));
  const lineId = ref<string>();
  const line = computed(() => lineId.value
    ? lines.value.find((item) => item.id === lineId.value)
    : lines.value.find((item) => item.mode === "METRO" && item.code === "15"));
  const originQuery = ref("");
  const originPoint = shallowRef<GeocoderPoint>();
  const radiusKm = ref(5);
  const simulationTime = ref("");
  const maxTransfers = ref<number>();
  const departureMode = ref<StationAccessDepartureMode>("now");
  const analyses = shallowRef<StationAccessAnalysis[]>([]);
  const rows = computed<StationAccessRow[]>(() => {
    const mode = departureMode.value;
    return analyses.value.map(({ optionsByMode, ...row }) => {
      if (mode === "ultimate") {
        const { ultimate } = row;
        return {
          ...row, state: ultimate?.state ?? "queued",
          options: ultimate?.state === "ready" ? [ultimate.journey] : [],
          complete: ultimate?.state === "ready" ? ultimate.complete : undefined,
        };
      }
      const options = optionsByMode?.[mode] ?? [];
      return { ...row, options, state: row.state === "ready" && !options.length ? "empty" : row.state };
    });
  });
  const runOrigin = shallowRef<GeocoderPoint>();
  const runStart = ref<number>();
  const selection = ref<string>();
  const standardProgress = shallowReactive(new Map<string, number>());
  const ultimateProgress = shallowReactive(new Map<string, number>());
  const cardProgress = computed(() => departureMode.value === "ultimate" ? ultimateProgress : standardProgress);
  const comparing = ref(false);
  const locating = ref(false);
  const busy = computed(() => locating.value || comparing.value);
  const error = ref<"origin" | "time">();
  const processed = computed(() => rows.value.filter((row) => row.state !== "queued" && row.state !== "running").length);
  const selectedRow = computed(() => rows.value.find((row) => row.target.id === selection.value));
  let controller: AbortController | undefined;
  let batchController: AbortController | undefined;
  let manualUltimate: AbortController | undefined;
  let run: StationAccessRun | undefined;

  async function loadCatalog() {
    catalogController?.abort();
    catalogController = new AbortController();
    const { signal } = catalogController;
    catalogLoading.value = true;
    async function loadStationCatalog(): Promise<StationAccessCatalog> {
      const source = new TransportMapDataSource();
      try {
        const { lines, stations, entrances } = await source.ensureCatalog(signal);
        return { lines, stations, entrances };
      } finally {
        source.dispose();
      }
    }
    const [map, gpe] = await Promise.allSettled([
      network.value ?? loadStationCatalog(),
      fetchGpeStations(),
    ]);
    if (signal.aborted) return;
    if (map.status === "fulfilled") network.value = map.value;
    if (gpe.status === "fulfilled") projects.value = gpe.value;
    catalogIncomplete.value = map.status === "rejected" || gpe.status === "rejected";
    catalogLoading.value = false;
  }

  function invalidate() {
    controller?.abort();
    batchController?.abort();
    cancelUltimate();
    run = undefined;
    selection.value = undefined;
    analyses.value = [];
    runOrigin.value = undefined;
    runStart.value = undefined;
    comparing.value = false;
    locating.value = false;
    error.value = undefined;
  }

  watch(originQuery, () => {
    originPoint.value = undefined;
    invalidate();
  }, { flush: "sync" });
  watch([lineId, radiusKm, simulationTime], invalidate, { flush: "sync" });

  function selectOrigin(point: GeocoderPoint) {
    originQuery.value = point.address ?? point.label ?? originQuery.value;
    originPoint.value = point;
    invalidate();
  }

  function selectAddress(address: AddressBookEntry) {
    selectOrigin(toAddressBookPoint(address));
  }

  function updateRow(id: string, patch: Partial<StationAccessAnalysis>) {
    analyses.value = analyses.value.map((row) => row.target.id === id ? { ...row, ...patch } : row);
  }

  function cancelUltimate() {
    manualUltimate?.abort();
    manualUltimate = undefined;
  }

  async function evaluate(target: StationAccessTarget, ultimate: boolean, signal: AbortSignal) {
    if (!run || signal.aborted) return;
    const { origin, start, analyze, destinations } = run;
    const id = target.id;
    const progress = ultimate ? ultimateProgress : standardProgress;
    progress.set(id, 0);
    updateRow(id, ultimate ? { ultimate: { state: "running" } } : { state: "running" });
    const reset = () => {
      progress.delete(id);
      updateRow(id, ultimate ? { ultimate: undefined } : { state: "queued" });
    };
    signal.addEventListener("abort", reset, { once: true });
    try {
      const destination = destinations.get(id) ?? await resolveStationAccessDestination(target, signal);
      signal.throwIfAborted();
      if (destination.id || !target.arrivalAtExistingStation) destinations.set(id, destination);
      const request = {
        origin, destination, settings, start, signal, maxTransfers: maxTransfers.value,
        onProgress(percent: number) {
          if (!signal.aborted) progress.set(id, percent);
        },
      };
      if (ultimate) {
        const { candidate, complete } = await provider.analyzeUltimateStationAccess(request);
        signal.throwIfAborted();
        updateRow(id, { ultimate: candidate
          ? { state: "ready", journey: stationAccessUltimateJourney(candidate, origin, destination), complete }
          : { state: complete ? "empty" : "error" } });
      } else {
        const result = await analyze(request);
        signal.throwIfAborted();
        const now = stationAccessJourneys(result, origin, destination, start, settings.exitSeconds);
        const zeroWait = stationAccessJourneys(result, origin, destination, start, settings.exitSeconds, "zeroWait");
        updateRow(id, {
          optionsByMode: { now, zeroWait },
          state: now.length || zeroWait.length ? "ready" : "empty",
          complete: result.complete,
        });
      }
    } catch {
      if (!signal.aborted) updateRow(id, ultimate ? { ultimate: { state: "error" } } : { state: "error" });
    } finally {
      signal.removeEventListener("abort", reset);
      if (!signal.aborted) progress.delete(id);
    }
  }

  async function searchUltimate(id: string) {
    const row = analyses.value.find((entry) => entry.target.id === id);
    if (!row || departureMode.value === "ultimate" || row.ultimate?.state === "running" || row.ultimate?.state === "ready") return;
    cancelUltimate();
    const job = new AbortController();
    manualUltimate = job;
    await evaluate(row.target, true, job.signal);
    if (manualUltimate === job) manualUltimate = undefined;
  }

  function selectRecommendation() {
    const ordered = rankStationAccessRows(rows.value);
    selection.value = ordered.find((row) => hasTransitRecommendation(row))?.target.id ??
      ordered.find((row) => row.state === "ready")?.target.id;
  }

  async function compareStations(resetResults = false) {
    if (!run) return;
    batchController?.abort();
    const ultimate = departureMode.value === "ultimate";
    if (ultimate || resetResults) cancelUltimate();
    if (resetResults) {
      analyses.value = analyses.value.map(({ target }) => ({ target, state: "queued" }));
    }
    batchController = new AbortController();
    const { signal } = batchController;
    const pending = analyses.value.filter((row) => ultimate ? row.ultimate === undefined : row.state === "queued");
    comparing.value = pending.length > 0;
    let next = 0;
    async function worker() {
      while (next < pending.length && !signal.aborted) {
        await evaluate(pending[next++]!.target, ultimate, signal);
      }
    }
    await Promise.all(Array.from({ length: Math.min(STATION_ACCESS_CONCURRENCY, pending.length) }, worker));
    if (signal.aborted) return;
    comparing.value = false;
    if (!selection.value) selectRecommendation();
  }

  watch(departureMode, (mode, previous) => {
    if (mode === "ultimate" || previous === "ultimate") {
      selection.value = undefined;
      void compareStations();
    } else if (!busy.value) selectRecommendation();
    else selection.value = undefined;
  });
  watch(maxTransfers, () => { void compareStations(true); }, { flush: "sync" });

  async function calculate() {
    const chosenLine = line.value;
    const radius = Number(radiusKm.value);
    if (!chosenLine || !Number.isFinite(radius) || radius <= 0 || catalogLoading.value) return;
    invalidate();
    controller = new AbortController();
    const { signal } = controller;
    const simulated = simulationTime.value;
    const query = originQuery.value.trim();
    locating.value = true;
    try {
      const origin = originPoint.value ?? (query ? matchingAddress(query, await geocoder.geocode(query, signal)) : undefined);
      signal.throwIfAborted();
      if (!origin) {
        error.value = "origin";
        return;
      }
      originPoint.value = origin;
      error.value = "time";
      const start = resolveOptimizerStart(simulated, Date.now());
      error.value = undefined;
      const current = chosenLine.current;
      let publicStations: ReadonlySet<string> | undefined;
      if (current && chosenLine.projects.some((project) => project.projectStatus !== "open")) {
        const timetable = await fetchGtfsLineTimetable(current.sourceLineId ?? current.id, {
          serviceDate: parisDateTime(start).slice(0, 8), signal,
        }).catch(() => undefined);
        signal.throwIfAborted();
        if (timetable?.status === "ready") publicStations = publicTimetableStations(timetable);
      }
      runStart.value = start;
      runOrigin.value = origin;
      const targets = stationAccessTargets(chosenLine, network.value, origin, radius * 1000, publicStations);
      analyses.value = targets.map((target) => ({ target, state: "queued" }));
      run = { origin, start, analyze: provider.createStationAccessSession(!simulated), destinations: new Map() };
      locating.value = false;
      await compareStations();
    } catch {
      if (!signal.aborted && !error.value) error.value = "origin";
    } finally {
      if (!signal.aborted) locating.value = false;
    }
  }

  function retry(id: string) {
    if (!batchController || busy.value || rows.value.some((row) => row.state === "running")) return;
    const row = rows.value.find((entry) => entry.target.id === id);
    if (row?.state === "error") void evaluate(row.target, departureMode.value === "ultimate", batchController.signal);
  }

  onMounted(() => {
    if (addressBook.primaryAddress.value) selectAddress(addressBook.primaryAddress.value);
    void loadCatalog();
  });
  onBeforeUnmount(() => {
    controller?.abort();
    batchController?.abort();
    manualUltimate?.abort();
    catalogController?.abort();
  });

  return {
    originQuery, radiusKm, simulationTime, maxTransfers, departureMode, lineId, line, lines, catalogLoading, catalogIncomplete, loadCatalog,
    busy, locating, processed, runOrigin, runStart, rows, selection, selectedRow, error, selectAddress, selectOrigin, calculate, retry,
    cardProgress, ultimateProgress, searchUltimate, cancelUltimate,
  };
}

export function hasTransitRecommendation(row: StationAccessRow): boolean {
  const kind = row.options[0]?.kind;
  return kind === "fastest" || kind === "recommended" || kind === "ultimate";
}

export function stationAccessComparisonTime(row: StationAccessRow): number {
  const journey = row.options[0];
  if (!journey || !hasTransitRecommendation(row)) return Number.POSITIVE_INFINITY;
  return journey.kind === "ultimate" ? journey.itinerary.route.durationSeconds * 1000 : journey.arrival;
}

export function rankStationAccessRows(rows: readonly StationAccessRow[]): StationAccessRow[] {
  return [...rows].sort((a, b) =>
    Number(a.target.future) - Number(b.target.future) ||
    stationAccessComparisonTime(a) - stationAccessComparisonTime(b) ||
    Number(b.options.length > 0) - Number(a.options.length > 0) ||
    a.target.distanceMeters - b.target.distanceMeters);
}
