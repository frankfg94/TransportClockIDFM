import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import {
  useAddressBook,
  toAddressBookPoint,
  type AddressBookEntry,
} from "../address-book/addressBook";
import { createIgnTransportMapGeocoder } from "../../services/geocoding/ign";
import { searchNavitiaDestinationPoints } from "../../services/idfm";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import { DEFAULT_OPTIMIZER_SETTINGS } from "./lineOptimizer";
import { createLineOptimizerProvider, type LineOptimizerResult } from "./lineOptimizerProvider";
import { optimizerNameKey, type LineOptimizerConfig } from "./optimizerConfig";

export function useLineOptimizer(config: LineOptimizerConfig) {
  const addressBook = useAddressBook();
  const geocoder = createIgnTransportMapGeocoder();
  const provider = createLineOptimizerProvider();
  const originQuery = ref(config.defaultOrigin);
  const destinationQuery = ref(config.defaultDestination);
  const originPoint = shallowRef<GeocoderPoint>();
  const destinationPoint = shallowRef<GeocoderPoint>();
  const settings = ref({ ...DEFAULT_OPTIMIZER_SETTINGS });
  const result = shallowRef<LineOptimizerResult>();
  const status = ref<"idle" | "loading" | "ready" | "partial" | "empty" | "error">("idle");
  const errorPhase = ref<"locations" | "journeys">("locations");
  const now = ref(Date.now());
  const candidates = computed(
    () => result.value?.candidates.filter((candidate) => candidate.leaveAt >= now.value) ?? [],
  );
  const winner = computed(() => candidates.value[0]);
  let generation = 0;
  let controller: AbortController | undefined;
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  let clockTimer: ReturnType<typeof setInterval> | undefined;
  let active = false;
  let enabled = false;

  function stop() {
    generation++;
    controller?.abort();
    clearTimeout(refreshTimer);
  }
  function invalidate() {
    stop();
    enabled = false;
    result.value = undefined;
    status.value = "idle";
  }
  watch(
    originQuery,
    () => {
      originPoint.value = undefined;
      settings.value.walkSeconds = undefined;
      invalidate();
    },
    { flush: "sync" },
  );
  watch(
    destinationQuery,
    () => {
      destinationPoint.value = undefined;
      invalidate();
    },
    { flush: "sync" },
  );
  watch(settings, invalidate, { deep: true, flush: "sync" });

  function selectAddress(entry: AddressBookEntry, side: "origin" | "destination") {
    const point = toAddressBookPoint(entry);
    if (side === "origin") {
      originQuery.value = entry.address || entry.name;
      originPoint.value = point;
    } else {
      destinationQuery.value = entry.address || entry.name;
      destinationPoint.value = point;
    }
    void refresh();
  }

  async function resolveDestination(signal: AbortSignal): Promise<GeocoderPoint | undefined> {
    const query = destinationQuery.value.trim();
    const stations = await searchNavitiaDestinationPoints(
      query,
      { includeStations: true, count: 8 },
      { signal },
    );
    signal.throwIfAborted();
    const exact = stations.filter(
      (station) => optimizerNameKey(station.label) === optimizerNameKey(query),
    );
    if (exact.length === 1) return exact[0];
    if (optimizerNameKey(query) === optimizerNameKey(config.defaultDestination)) return undefined;
    return (await geocoder.geocode(query, signal))[0];
  }

  async function refresh() {
    stop();
    enabled = true;
    const token = generation;
    controller = new AbortController();
    const signal = controller.signal;
    status.value = "loading";
    result.value = undefined;
    errorPhase.value = "locations";
    try {
      if (!originQuery.value.trim() || !destinationQuery.value.trim())
        throw new Error("optimizer-location-required");
      const [origin, destination] = await Promise.all([
        originPoint.value ??
          geocoder.geocode(originQuery.value.trim(), signal).then((points) => points[0]),
        destinationPoint.value ?? resolveDestination(signal),
      ]);
      signal.throwIfAborted();
      if (!origin || !destination) throw new Error("optimizer-location-unresolved");
      if (token !== generation) return;
      originPoint.value = origin;
      destinationPoint.value = destination;
      errorPhase.value = "journeys";
      now.value = Date.now();
      const next = await provider.analyze({
        config,
        origin,
        destination,
        settings: { ...settings.value },
        start: now.value,
        signal,
      });
      signal.throwIfAborted();
      if (token !== generation) return;
      now.value = Date.now();
      result.value = next;
      status.value = !candidates.value.length ? "empty" : next.complete ? "ready" : "partial";
    } catch {
      if (token !== generation || signal.aborted) return;
      status.value = "error";
    } finally {
      if (token === generation && active && enabled && !document.hidden) {
        // Errors wait for an explicit retry, including upstream quota failures.
        if (status.value !== "error") refreshTimer = setTimeout(() => void refresh(), 30_000);
      }
    }
  }
  function visibilityChanged() {
    if (document.hidden) {
      stop();
      if (status.value === "loading") status.value = "idle";
    } else if (active && enabled) void refresh();
  }
  onMounted(() => {
    active = true;
    const home =
      addressBook.primaryAddress.value ??
      addressBook.entries.value.find(
        (entry) => entry.kind === "address" && /^(home|House)$/iu.test(entry.icon),
      );
    if (home) {
      originQuery.value = home.address || home.name;
      originPoint.value = toAddressBookPoint(home);
    }
    document.addEventListener("visibilitychange", visibilityChanged);
    clockTimer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
    if (!document.hidden) void refresh();
  });
  onBeforeUnmount(() => {
    active = false;
    stop();
    clearInterval(clockTimer);
    document.removeEventListener("visibilitychange", visibilityChanged);
  });
  return {
    originQuery,
    destinationQuery,
    originPoint,
    destinationPoint,
    settings,
    result,
    status,
    errorPhase,
    candidates,
    winner,
    now,
    selectAddress,
    refresh,
  };
}
