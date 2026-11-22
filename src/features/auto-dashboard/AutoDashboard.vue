<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import TransitBoard from "../../components/TransitBoard.vue";
import { useUserGeolocation } from "../../composables/useUserGeolocation";
import { useNearbyStations } from "../nearby-stations/useNearbyStations";
import { createBoardFromDraft, createFallbackDirectionGroup } from "../../services/boardBuilder";
import { fetchBoardDepartures, fetchDirectionGroupsForStation, searchLineStations } from "../../services/idfm";
import { idfmLineToSiriRef } from "../../services/idfmStopReferences";
import { getNearbyWalkingRouteMatrix } from "../../services/nearbyWalkingRoutes";
import { getCoordinatesDistanceMeters } from "../../services/distance";
import { toDashboardLineOption } from "../transport-map/adapters/dashboard";
import { normalizeStationLabel } from "../nearby-stations/nearbyStationSchedules";
import type { TransitBoardConfig, BoardDeparturesResult, Departure, DirectionDepartureGroup, StationSearchOption } from "../../types/transit";
import type { NearbyWalkingRoute } from "../nearby-stations/nearbyWalkingRoutes";
import { useI18n } from "../../i18n";
import { filterTerminalOnly } from "../app-settings/appSettings";
import { collectAutoDashboardCandidates, type AutoDashboardCandidate } from "./candidates";
import { AutoDashboardStabilizer, isAutoDashboardEligible } from "./eligibility";

const emit = defineEmits<{ back: []; "show-pattern": [payload: { board: TransitBoardConfig; directionGroup: DirectionDepartureGroup; departure: Departure }] }>();
const props = withDefaults(defineProps<{
  displayMode?: "grid" | "list";
  closedSummaryMode?: "last" | "next";
  terminalDirectionsOnly?: boolean;
  maxDeparturesPerDirection?: "default" | 1 | 2 | 3 | 4 | 6 | 8 | 10;
}>(), { displayMode: "grid", closedSummaryMode: "last", terminalDirectionsOnly: false, maxDeparturesPerDirection: "default" });
const { t } = useI18n();
const location = useUserGeolocation({ autoStart: false });
const nearby = useNearbyStations({ stationCatalog: "full" });
nearby.radius.value = 1500;
nearby.clusterGroupingDistanceMeters.value = 0;

interface Card {
  candidate: AutoDashboardCandidate;
  board: TransitBoardConfig;
  route: NearbyWalkingRoute;
  result?: BoardDeparturesResult;
  loading: boolean;
  error?: string;
  updatedAt?: Date;
  collapsed: string[];
}
const cards = ref<Card[]>([]);
const loading = ref(false);
const partial = ref(false);
const scanError = ref(false);
const limitReached = ref(false);
const stabilizer = new AutoDashboardStabilizer();
const boardCache = new Map<string, TransitBoardConfig>();
const routeCache = new Map<string, { at: number; routes: NearbyWalkingRoute[] }>();
let generation = 0;
let controller: AbortController | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let positionTimer: ReturnType<typeof setInterval> | undefined;
let lastScanAt = 0;
let lastOrigin: { lat: number; lon: number } | undefined;
let lastFixTimestamp = 0;
let disposed = false;
let departuresRefreshing = false;
let activationRequested = false;

const validPosition = computed(() => {
  const point = location.coordinates.value;
  if (!point || location.isStale.value || !location.isAuthorized.value) return undefined;
  if (point.accuracy !== null && point.accuracy > 100) return undefined;
  if (Date.now() - point.timestamp > 60_000) return undefined;
  return { lat: point.latitude, lon: point.longitude, timestamp: point.timestamp, accuracy: point.accuracy };
});

const message = computed(() => {
  if (location.permissionState.value === "unsupported") return t("autoDashboard.unsupported");
  if (location.permissionState.value === "denied") return t("autoDashboard.denied");
  if (!validPosition.value && (location.isLoading.value || location.permissionState.value === "checking")) {
    return t("autoDashboard.permissionLoading");
  }
  if (
    location.permissionState.value === "prompt" ||
    location.permissionState.value === "unknown"
  ) return t("autoDashboard.permissionRequest");
  if (!validPosition.value) return t("autoDashboard.noPosition");
  if (scanError.value) return t("autoDashboard.scanError");
  if (loading.value) return t("autoDashboard.loading");
  if (cards.value.length === 0) return t(partial.value ? "autoDashboard.emptyPartial" : "autoDashboard.empty");
  return "";
});

function invalidate(): void {
  generation += 1;
  controller?.abort();
  controller = undefined;
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  loading.value = false;
}

function scheduleScan(force = false): void {
  const point = validPosition.value;
  if (!point || document.hidden || disposed) return;
  const moved = !lastOrigin || getCoordinatesDistanceMeters(lastOrigin.lat, lastOrigin.lon, point.lat, point.lon)
    >= Math.max(30, Math.min(100, point.accuracy ?? 30));
  if (loading.value && !moved) return;
  if (!force && !moved && controller && !stabilizer.hasPending) return;
  if (!force && stabilizer.hasPending && !moved && point.timestamp === lastFixTimestamp) return;
  invalidate();
  const delay = Math.max(0, lastScanAt + 30_000 - Date.now());
  timer = setTimeout(() => { timer = undefined; void scan(); }, delay);
}

async function scan(): Promise<void> {
  const point = validPosition.value;
  if (!point || document.hidden || disposed) return;
  const request = ++generation;
  const currentController = new AbortController();
  controller = currentController;
  const current = () => !disposed && !document.hidden && generation === request && !currentController.signal.aborted;
  lastScanAt = Date.now();
  lastOrigin = { lat: point.lat, lon: point.lon };
  lastFixTimestamp = point.timestamp;
  loading.value = true;
  scanError.value = false;
  try {
    await nearby.selectPlace({ lat: point.lat, lon: point.lon, provider: "device", label: "AUTO" });
    if (!current()) return;
    if (nearby.error.value) throw new Error("station scan failed");
    const candidates = collectAutoDashboardCandidates(nearby.stations.value, point, 1500);
    const oldIds = new Set(cards.value.map((card) => card.candidate.station.id));
    const stations = [...new Map(candidates.map((candidate) => [candidate.station.id, candidate.station])).values()];
    stations.sort((a, b) => Number(oldIds.has(b.id)) - Number(oldIds.has(a.id)) ||
      getCoordinatesDistanceMeters(point.lat, point.lon, a.lat, a.lon) - getCoordinatesDistanceMeters(point.lat, point.lon, b.lat, b.lon));
    limitReached.value = stations.length > 64;
    const selectedStations = stations.slice(0, 64);
    const cacheKey = `${point.lat.toFixed(5)},${point.lon.toFixed(5)}:${selectedStations.map((station) => station.id).join("|")}`;
    const cached = routeCache.get(cacheKey);
    const routes = cached && Date.now() - cached.at < 60_000 ? cached.routes : await getNearbyWalkingRouteMatrix(
      point, selectedStations.map((station) => ({ id: station.id, lat: station.lat, lon: station.lon })),
      currentController.signal, "preferred", { persistentCache: false },
    );
    if (!current()) return;
    if (!cached || Date.now() - cached.at >= 60_000) {
      if (routeCache.size >= 4) routeCache.delete(routeCache.keys().next().value!);
      routeCache.set(cacheKey, { at: Date.now(), routes });
    }
    const byStation = new Map(routes.map((route) => [route.id, route]));
    const observations = new Map<string, boolean | undefined>();
    for (const candidate of candidates) {
      const route = byStation.get(candidate.station.id);
      observations.set(candidate.key, route ? isAutoDashboardEligible(candidate.line.mode, route.durationSeconds) : undefined);
    }
    const accepted = stabilizer.update(observations);
    partial.value = routes.some((route) => route.fallback || route.provider === "straight-line") || limitReached.value || byStation.size < selectedStations.length;
    const previous = new Map(cards.value.map((card) => [card.candidate.key, card]));
    const known = new Map(candidates.map((candidate) => [candidate.key, candidate]));
    // Keep a previous card during its confirmation window or a missing route.
    // Its old walking time is temporary; the displayed straight-line distance
    // continues to use the latest position.
    for (const card of cards.value) if (!known.has(card.candidate.key)) known.set(card.candidate.key, card.candidate);
    const routeFor = (candidate: AutoDashboardCandidate) => byStation.get(candidate.station.id) ?? previous.get(candidate.key)?.route;
    const selected = [...known.values()].filter((candidate) => accepted.has(candidate.key) && routeFor(candidate))
      .sort((a, b) => routeFor(a)!.durationSeconds - routeFor(b)!.durationSeconds || a.key.localeCompare(b.key))
      .slice(0, 12);
    const next: Card[] = [];
    const stationsByLine = new Map<string, Promise<StationSearchOption[]>>();
    // Direction discovery is bounded to three concurrent requests and cached in memory.
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(3, selected.length) }, async () => {
      while (index < selected.length && current()) {
        const candidate = selected[index++]!;
        const line = toDashboardLineOption(candidate.line);
        if (!line) continue;
        let board = boardCache.get(candidate.key);
        if (!board) {
          let stations = stationsByLine.get(line.navitiaId);
          if (!stations) {
            stations = searchLineStations(line, "", { signal: currentController.signal });
            stationsByLine.set(line.navitiaId, stations);
          }
          const source = candidate.station;
          const label = normalizeStationLabel(source.name);
          // Map quays and Navitia stop areas use different references.
          // Only accept a single nearby stop with the same name on this line.
          const matches = (await stations.catch(() => [])).filter((station) =>
            station.scheduleStopAreaRef && station.lat !== undefined && station.lon !== undefined &&
            normalizeStationLabel(station.label) === label &&
            getCoordinatesDistanceMeters(source.lat, source.lon, station.lat, station.lon) <= 150,
          );
          if (!current()) return;
          const station = matches.length === 1 ? matches[0] : undefined;
          if (!station) {
            partial.value = true;
            continue;
          }
          const groups = await fetchDirectionGroupsForStation(line, station, { signal: currentController.signal })
            .catch(() => { if (current()) partial.value = true; return [createFallbackDirectionGroup(station.label)]; });
          if (!current()) return;
          const resolvedGroups = groups.length ? groups : [createFallbackDirectionGroup(station.label)];
          board = createBoardFromDraft({ family: line.family, line: { ...line, ref: idfmLineToSiriRef(line.ref) }, station }, resolvedGroups.map((group) =>
            group.id === "all-directions" ? { ...group, label: t("autoDashboard.allDirections") } : group,
          ));
          board = { ...board, id: `auto-${board.id}` };
          boardCache.set(candidate.key, board);
        }
        const old = previous.get(candidate.key);
        next.push({ candidate, board, route: routeFor(candidate)!, result: old?.result,
          loading: false, error: old?.error, updatedAt: old?.updatedAt, collapsed: old?.collapsed ?? [] });
      }
    }));
    if (!current()) return;
    const order = new Map(selected.map((candidate, position) => [candidate.key, position]));
    cards.value = next.sort((a, b) => order.get(a.candidate.key)! - order.get(b.candidate.key)!);
    void refreshDepartures(request, currentController.signal);
  } catch {
    if (current()) scanError.value = true;
  } finally {
    if (current()) {
      loading.value = false;
      // Confirm a boundary even when the OS suppresses stationary GPS updates.
      if (stabilizer.hasPending) timer = setTimeout(() => { timer = undefined; scheduleScan(true); }, 30_000);
    }
  }
}

async function refreshDepartures(request = generation, signal = controller?.signal): Promise<void> {
  if (!signal || signal.aborted || document.hidden || !validPosition.value || departuresRefreshing) return;
  departuresRefreshing = true;
  const snapshot = cards.value;
  let index = 0;
  try { await Promise.all(Array.from({ length: Math.min(3, snapshot.length) }, async () => {
    while (index < snapshot.length && request === generation && !signal.aborted) {
      const card = snapshot[index++]!;
      card.loading = true;
      try {
        const board = typeof props.maxDeparturesPerDirection === "number"
          ? { ...card.board, maxDeparturesPerDirection: props.maxDeparturesPerDirection } : card.board;
        const result = await fetchBoardDepartures(board, {
          signal,
          onUpdate: (update) => {
            if (request === generation && !signal.aborted) card.result = update;
          },
        });
        if (request !== generation || signal.aborted) return;
        card.result = result;
        card.error = undefined;
        card.updatedAt = new Date();
      } catch {
        if (request === generation && !signal.aborted) card.error = t("autoDashboard.departuresError");
      } finally {
        card.loading = false;
      }
    }
  })); } finally {
    departuresRefreshing = false;
    if (request !== generation && !loading.value && !disposed) void refreshDepartures();
  }
}

function currentDistance(card: Card): number {
  const point = validPosition.value;
  return point ? Math.round(getCoordinatesDistanceMeters(point.lat, point.lon, card.candidate.station.lat, card.candidate.station.lon)) : 0;
}

function toggle(card: Card, id: string): void {
  card.collapsed = card.collapsed.includes(id) ? card.collapsed.filter((value) => value !== id) : [...card.collapsed, id];
}

function onVisibility(): void {
  if (document.hidden) invalidate();
  else if (location.isAuthorized.value) scheduleScan(true);
}
function activate(): void {
  if (activationRequested || location.isLoading.value || location.permissionState.value === "checking") return;
  if (location.permissionState.value === "granted") {
    activationRequested = true;
    void location.askGeolocation();
  }
}
function requestLocation(): void {
  activationRequested = true;
  void location.askGeolocation();
}
watch(() => location.coordinates.value, () => scheduleScan());
watch([() => location.permissionState.value, () => location.isLoading.value], activate);
watch(() => location.isAuthorized.value, (authorized) => {
  if (!authorized) { invalidate(); cards.value = []; stabilizer.clear(); lastOrigin = undefined; }
});
onMounted(() => {
  document.addEventListener("visibilitychange", onVisibility);
  activate();
  refreshTimer = setInterval(() => { if (!loading.value) void refreshDepartures(); }, 60_000);
  positionTimer = setInterval(() => {
    if (document.hidden || !location.isAuthorized.value || location.isLoading.value) return;
    const fix = location.coordinates.value;
    if (!fix || Date.now() - fix.timestamp >= 30_000) void location.refresh();
  }, 30_000);
});
onBeforeUnmount(() => {
  disposed = true;
  invalidate();
  if (refreshTimer !== undefined) clearInterval(refreshTimer);
  if (positionTimer !== undefined) clearInterval(positionTimer);
  document.removeEventListener("visibilitychange", onVisibility);
  routeCache.clear();
});
</script>

<template>
  <section class="auto-dashboard" aria-live="polite">
    <div class="auto-dashboard__status">
      <strong>{{ t("autoDashboard.title") }}</strong>
      <p>{{ t("autoDashboard.explanation") }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <p v-if="partial && validPosition">{{ t("autoDashboard.partial") }}</p>
      <button
        v-if="!validPosition && !location.isLoading.value && location.permissionState.value !== 'unsupported'"
        type="button"
        class="button-secondary"
        @click="requestLocation"
      >
        {{ t(location.permissionState.value === 'denied' ? "autoDashboard.retry" : "autoDashboard.requestLocation") }}
      </button>
      <button
        v-if="validPosition && !loading && (scanError || (partial && !cards.length))"
        type="button"
        class="button-secondary"
        @click="scheduleScan(true)"
      >{{ t("autoDashboard.retryScan") }}</button>
      <button type="button" class="button-secondary" @click="emit('back')">{{ t("autoDashboard.back") }}</button>
    </div>
    <div v-if="validPosition" class="boards-grid" :class="{ 'boards-grid--list': displayMode === 'list' }">
      <div v-for="card in cards" :key="card.candidate.key" class="board-drag-item">
        <p class="auto-dashboard__distance">{{ t(card.route.fallback || card.route.provider === 'straight-line' ? 'autoDashboard.straightDistance' : 'autoDashboard.walkingDistance', { meters: currentDistance(card), minutes: Math.ceil(card.route.durationSeconds / 60) }) }}</p>
        <TransitBoard :board="card.board" :departures="card.result?.departures ?? []" :direction-groups="filterTerminalOnly(card.result?.directionGroups ?? [], terminalDirectionsOnly)" :collapsed-direction-ids="card.collapsed" :loading="card.loading" :error="card.error" :updated-at="card.updatedAt" :display-mode="displayMode" :closed-summary-mode="closedSummaryMode" :show-actions="false" :show-alarm-action="false" :show-station-change-action="false" @toggle-direction="toggle(card, $event)" @show-pattern="emit('show-pattern', $event)" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.auto-dashboard { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); min-width: 0; }
.auto-dashboard .boards-grid { min-width: 0; width: 100%; }
.auto-dashboard__status { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 1rem; }
.auto-dashboard__status p { margin: .5rem 0; }
.auto-dashboard__status button { margin: .4rem .5rem 0 0; }
.auto-dashboard__distance { margin: 0 0 .35rem; color: var(--ink); font-weight: 600; }
</style>
