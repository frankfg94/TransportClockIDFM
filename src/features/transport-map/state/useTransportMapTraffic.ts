import { computed, ref, watch } from "vue";
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

export function useTransportMapTraffic() {
  const enabled = ref(false);
  const status = ref<TransportMapTrafficStatus>("disabled");
  const snapshot = ref<TransportMapTrafficSnapshot>();
  const { locale } = useI18n();
  let requestToken = 0;

  watch(locale, (nextLocale, previousLocale) => {
    if (nextLocale === previousLocale || !enabled.value) return;
    void refresh();
  });

  async function refresh(lineRefs: string[] = []): Promise<void> {
    const currentRequestToken = ++requestToken;
    enabled.value = true;
    status.value = "loading";
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (isCurrentRequest(currentRequestToken)) {
          status.value = snapshot.value ? "stale" : "offline";
        }
        return;
      }

      void lineRefs;
      const params = new URLSearchParams({ locale: locale.value });
      const response = await fetch(toServerApiUrl(`/api/traffic?${params}`), {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Traffic request failed (${response.status})`);
      const payload = await response.json() as TrafficSnapshotPayload;
      if (!isCurrentRequest(currentRequestToken)) return;
      if (payload.configured === false) {
        status.value = snapshot.value ? "stale" : "error";
        return;
      }

      const reports = payload.lines ?? [];
      if (reports.length > 0 && reports.every((report) => report.status === "error")) {
        status.value = snapshot.value ? "stale" : "error";
        return;
      }
      const lineImpacts = createLineImpacts(reports);
      snapshot.value = {
        fetchedAt: payload.generatedAt ?? new Date().toISOString(),
        lineImpacts,
        cache: payload.cache,
      };
      status.value = getStatusFromPayload(payload, "ready");
    } catch {
      if (isCurrentRequest(currentRequestToken)) {
        status.value = snapshot.value ? "stale" : "error";
      }
    }
  }

  async function refreshLine(lineRef: string): Promise<void> {
    const currentRequestToken = ++requestToken;
    enabled.value = true;
    status.value = snapshot.value ? status.value : "loading";
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        if (isCurrentRequest(currentRequestToken)) {
          status.value = snapshot.value ? "stale" : "offline";
        }
        return;
      }

      const normalizedLineRef = normalizeTrafficLineRef(lineRef);
      const params = new URLSearchParams({
        lineRefs: normalizedLineRef,
        detail: "1",
        locale: locale.value,
      });
      const response = await fetch(toServerApiUrl(`/api/traffic?${params}`), {
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error(`Traffic detail request failed (${response.status})`);
      const payload = await response.json() as TrafficSnapshotPayload;
      if (!isCurrentRequest(currentRequestToken)) return;

      const reports = payload.lines ?? [];
      if (reports.length === 0 || reports.every((report) => report.status === "error")) {
        status.value = snapshot.value ? "stale" : "error";
        return;
      }

      const currentImpacts = snapshot.value?.lineImpacts ?? [];
      const updatedReports = createLineImpacts(reports);
      const updatedLineIds = new Set(reports.map((report) => normalizeTrafficLineRef(report.lineRef)));
      snapshot.value = {
        fetchedAt: snapshot.value?.fetchedAt ?? payload.generatedAt ?? new Date().toISOString(),
        lineImpacts: [
          ...currentImpacts.filter((impact) => !updatedLineIds.has(impact.lineId)),
          ...updatedReports,
        ],
        cache: payload.cache ?? snapshot.value?.cache,
      };
      status.value = getStatusFromPayload(payload, snapshot.value ? "ready" : "error");
    } catch {
      if (isCurrentRequest(currentRequestToken)) {
        status.value = snapshot.value ? "stale" : "error";
      }
    }
  }

  function disable(): void {
    requestToken += 1;
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

  return { enabled, status, snapshot, snapshotIsStale, refresh, refreshLine, disable };
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

function createLineImpacts(reports: TrafficLineReport[]): TransportMapTrafficLineImpact[] {
  const disruptionsByLineId = new Map<string, Map<string, TrafficDisruption>>();
  for (const report of reports) {
    if (report.status === "normal" || report.status === "error") continue;
    const currentDisruptions = getCurrentDeparturePatternTrafficDisruptions(report.disruptions ?? []);
    if (currentDisruptions.length === 0) continue;

    const lineId = normalizeTrafficLineRef(report.lineRef);
    const disruptions = disruptionsByLineId.get(lineId) ?? new Map<string, TrafficDisruption>();
    for (const disruption of currentDisruptions) disruptions.set(disruption.id, disruption);
    disruptionsByLineId.set(lineId, disruptions);
  }

  return [...disruptionsByLineId].map(([lineId, disruptionMap]) => {
    const disruptions = [...disruptionMap.values()].sort((left, right) =>
      impactPriority(right) - impactPriority(left),
    );
    return {
      lineId,
      kind: disruptions.some((disruption) => getDisruptionTone(disruption) === "red")
        ? "interruption"
        : "disturbance",
      disruptions,
    };
  });
}

function impactPriority(disruption: TrafficDisruption): number {
  return getDisruptionTone(disruption) === "red" ? 2 : 1;
}
