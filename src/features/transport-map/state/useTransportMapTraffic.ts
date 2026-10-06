import { computed, ref, shallowRef, watch } from "vue";
import { toServerApiUrl } from "../../../services/serverApi";
import { useI18n } from "../../../i18n";
import { getCurrentDeparturePatternTrafficDisruptions } from "../../service-pattern/useDeparturePatternTraffic";
import { normalizeTrafficLineRef } from "../../traffic/trafficNormalization";
import { getDisruptionTone } from "../../traffic/trafficPresentation";
import type {
  TrafficCacheMetadata,
  TrafficDisruption,
  TrafficLineReport,
} from "../../traffic/types";
import type { TransportMapTrafficImpactKind } from "../contracts/renderer";

export type TransportMapTrafficStatus = "disabled" | "loading" | "ready" | "stale" | "offline" | "error";

export interface TransportMapTrafficLineImpact {
  lineId: string;
  kind: TransportMapTrafficImpactKind;
  disruptions: TrafficDisruption[];
}

export interface TransportMapTrafficSnapshot {
  fetchedAt: string;
  lineImpacts: TransportMapTrafficLineImpact[];
  cache?: TrafficCacheMetadata;
}

interface TrafficSnapshotPayload {
  configured?: boolean;
  generatedAt?: string;
  lines?: TrafficLineReport[];
  cache?: TrafficCacheMetadata;
}

const SNAPSHOT_REUSE_MS = 60_000;
const TRAFFIC_PROCESSING_SLICE_MS = 4;

export function useTransportMapTraffic() {
  const enabled = ref(false);
  const status = ref<TransportMapTrafficStatus>("disabled");
  // Snapshots are replaced atomically, never edited in place. Avoid creating
  // deep proxies for every disruption as the scene reads the same snapshot.
  const snapshot = shallowRef<TransportMapTrafficSnapshot>();
  const { locale } = useI18n();
  let requestToken = 0;
  let requestController: AbortController | undefined;
  let snapshotLocale: string | undefined;
  let snapshotReceivedAt = Number.NEGATIVE_INFINITY;
  let snapshotStatus: TransportMapTrafficStatus | undefined;

  watch(locale, (nextLocale, previousLocale) => {
    if (nextLocale === previousLocale || !enabled.value) return;
    void refresh();
  });

  async function enable(): Promise<void> {
    enabled.value = true;
    if (
      snapshot.value &&
      snapshotLocale === locale.value &&
      snapshotStatus === "ready" &&
      Date.now() - snapshotReceivedAt < SNAPSHOT_REUSE_MS
    ) {
      status.value = typeof navigator !== "undefined" && !navigator.onLine ? "stale" : "ready";
      return;
    }
    await refresh();
  }

  async function refresh(lineRefs: string[] = []): Promise<void> {
    const currentRequestToken = ++requestToken;
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    const requestLocale = locale.value;
    enabled.value = true;
    status.value = "loading";
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (isCurrentRequest(currentRequestToken)) {
          status.value = snapshot.value ? "stale" : "offline";
          snapshotStatus = status.value;
        }
        return;
      }

      void lineRefs;
      const params = new URLSearchParams({ locale: requestLocale });
      const response = await fetch(toServerApiUrl(`/api/traffic?${params}`), {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!isCurrentRequest(currentRequestToken)) return;
      if (!response.ok) throw new Error(`Traffic request failed (${response.status})`);
      const payload = await response.json() as TrafficSnapshotPayload;
      if (!isCurrentRequest(currentRequestToken)) return;
      if (payload.configured === false) {
        status.value = snapshot.value ? "stale" : "error";
        snapshotStatus = status.value;
        return;
      }

      const reports = payload.lines ?? [];
      if (reports.length > 0 && reports.every((report) => report.status === "error")) {
        status.value = snapshot.value ? "stale" : "error";
        snapshotStatus = status.value;
        return;
      }
      const lineImpacts = await createLineImpacts(reports, () => isCurrentRequest(currentRequestToken));
      if (!lineImpacts || !isCurrentRequest(currentRequestToken)) return;
      snapshot.value = {
        fetchedAt: payload.generatedAt ?? new Date().toISOString(),
        lineImpacts,
        cache: payload.cache,
      };
      status.value = getStatusFromPayload(payload, "ready");
      snapshotLocale = requestLocale;
      snapshotReceivedAt = Date.now();
      snapshotStatus = status.value;
    } catch {
      if (isCurrentRequest(currentRequestToken)) {
        status.value = snapshot.value ? "stale" : "error";
        snapshotStatus = status.value;
      }
    } finally {
      if (requestController === controller) requestController = undefined;
    }
  }

  async function refreshLine(lineRef: string): Promise<void> {
    const currentRequestToken = ++requestToken;
    requestController?.abort();
    const controller = new AbortController();
    requestController = controller;
    const requestLocale = locale.value;
    enabled.value = true;
    status.value = snapshot.value ? status.value : "loading";
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (isCurrentRequest(currentRequestToken)) {
          status.value = snapshot.value ? "stale" : "offline";
          snapshotStatus = status.value;
        }
        return;
      }

      const normalizedLineRef = normalizeTrafficLineRef(lineRef);
      const params = new URLSearchParams({
        lineRefs: normalizedLineRef,
        detail: "1",
        locale: requestLocale,
      });
      const response = await fetch(toServerApiUrl(`/api/traffic?${params}`), {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!isCurrentRequest(currentRequestToken)) return;
      if (!response.ok) throw new Error(`Traffic detail request failed (${response.status})`);
      const payload = await response.json() as TrafficSnapshotPayload;
      if (!isCurrentRequest(currentRequestToken)) return;

      const reports = payload.lines ?? [];
      if (reports.length === 0 || reports.every((report) => report.status === "error")) {
        status.value = snapshot.value ? "stale" : "error";
        snapshotStatus = status.value;
        return;
      }

      const updatedReports = await createLineImpacts(reports, () => isCurrentRequest(currentRequestToken));
      if (!updatedReports || !isCurrentRequest(currentRequestToken)) return;
      const currentSnapshot = snapshotLocale === requestLocale ? snapshot.value : undefined;
      const currentImpacts = currentSnapshot?.lineImpacts ?? [];
      const updatedLineIds = new Set(reports.map((report) => normalizeTrafficLineRef(report.lineRef)));
      snapshot.value = {
        fetchedAt: currentSnapshot?.fetchedAt ?? payload.generatedAt ?? new Date().toISOString(),
        lineImpacts: [
          ...currentImpacts.filter((impact) => !updatedLineIds.has(impact.lineId)),
          ...updatedReports,
        ],
        cache: payload.cache ?? currentSnapshot?.cache,
      };
      status.value = getStatusFromPayload(payload, snapshot.value ? "ready" : "error");
      snapshotLocale = requestLocale;
      snapshotStatus = status.value;
    } catch {
      if (isCurrentRequest(currentRequestToken)) {
        status.value = snapshot.value ? "stale" : "error";
        snapshotStatus = status.value;
      }
    } finally {
      if (requestController === controller) requestController = undefined;
    }
  }

  function disable(): void {
    requestToken += 1;
    requestController?.abort();
    requestController = undefined;
    enabled.value = false;
    status.value = "disabled";
  }

  function isCurrentRequest(token: number): boolean {
    return enabled.value && token === requestToken;
  }

  const snapshotIsStale = computed(() => {
    const fetchedAt = snapshot.value?.fetchedAt;
    return !fetchedAt || Date.now() - Date.parse(fetchedAt) > 60_000;
  });

  return { enabled, status, snapshot, snapshotIsStale, enable, refresh, refreshLine, disable };
}

function getStatusFromPayload(
  payload: TrafficSnapshotPayload,
  successStatus: TransportMapTrafficStatus,
): TransportMapTrafficStatus {
  if (
    payload.cache?.state === "stale" ||
    payload.cache?.state === "rate-limited" ||
    payload.cache?.state === "error"
  ) {
    return "stale";
  }

  return successStatus;
}

async function createLineImpacts(
  reports: TrafficLineReport[],
  isCurrent: () => boolean,
): Promise<TransportMapTrafficLineImpact[] | undefined> {
  const disruptionsByLineId = new Map<string, Map<string, TrafficDisruption>>();
  let sliceStartedAt = performance.now();
  const now = Date.now();
  async function yieldIfNeeded(): Promise<void> {
    if (performance.now() - sliceStartedAt < TRAFFIC_PROCESSING_SLICE_MS) return;
    // A macrotask gives the browser a chance to draw the camera flight. A
    // resolved Promise alone would keep draining work before the next frame.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    sliceStartedAt = performance.now();
  }
  for (const report of reports) {
    if (!isCurrent()) return undefined;
    await yieldIfNeeded();
    if (!isCurrent()) return undefined;
    if (report.status === "normal" || report.status === "error") continue;
    const currentDisruptions = getCurrentDeparturePatternTrafficDisruptions(report.disruptions ?? [], now);
    if (currentDisruptions.length === 0) continue;

    const lineId = normalizeTrafficLineRef(report.lineRef);
    const disruptions = disruptionsByLineId.get(lineId) ?? new Map<string, TrafficDisruption>();
    for (const disruption of currentDisruptions) disruptions.set(disruption.id, disruption);
    disruptionsByLineId.set(lineId, disruptions);
  }

  const lineImpacts: TransportMapTrafficLineImpact[] = [];
  for (const [lineId, disruptionMap] of disruptionsByLineId) {
    await yieldIfNeeded();
    if (!isCurrent()) return undefined;
    const prioritized = [...disruptionMap.values()].map((disruption) => ({
      disruption,
      priority: impactPriority(disruption),
    })).sort((left, right) => right.priority - left.priority);
    lineImpacts.push({
      lineId,
      kind: prioritized.some(({ priority }) => priority === 2)
        ? "interruption"
        : "disturbance",
      disruptions: prioritized.map(({ disruption }) => disruption),
    });
  }
  return lineImpacts;
}

function impactPriority(disruption: TrafficDisruption): number {
  return getDisruptionTone(disruption) === "red" ? 2 : 1;
}
