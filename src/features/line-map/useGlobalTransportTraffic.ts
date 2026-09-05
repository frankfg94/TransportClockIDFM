import { computed, onBeforeUnmount, type Ref, watch } from "vue";
import { useI18n } from "../../i18n";
import type { GlobalMapLine, GlobalMapPath } from "../transport-map/contracts/manifest";
import type { GlobalTransportSceneTrafficState } from "./useGlobalTransportScene";
import {
  useTransportMapTraffic,
  type TransportMapTrafficLineImpact,
} from "../transport-map/state/useTransportMapTraffic";
import {
  analyzeActiveTransportMapTraffic,
  findTrafficPathSpan,
} from "../transport-map/state/transportMapTrafficAnalysis";
import { filterPathsForGlobalBusDirection } from "./globalBusDirections";
import { normalizeTrafficLineRef } from "../traffic/trafficNormalization";
import type { TrafficDisruption } from "../traffic/types";
import type { TransportMapTrafficPathSpan } from "../transport-map/contracts/renderer";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import type { LineHitCandidate } from "../transport-map/spatial/hitTest";
import type { TransportMapPerformanceTrace } from "../transport-map/performance/transportMapPerformanceTrace";

const EMPTY_TRAFFIC_IDS: string[] = [];
const EMPTY_TRAFFIC_PATH_SPANS: TransportMapTrafficPathSpan[] = [];
const EMPTY_ACTIVE_TRAFFIC_ANALYSIS = {
  interruptedStationIds: EMPTY_TRAFFIC_IDS,
  disturbedStationIds: EMPTY_TRAFFIC_IDS,
  pathSpans: EMPTY_TRAFFIC_PATH_SPANS,
};
const TRAFFIC_POLL_INTERVAL_MS = 150_000;
const TRAFFIC_DETAIL_REFRESH_AFTER_MS = 60_000;

export interface UseGlobalTransportTrafficOptions {
  activeTrafficDisruption: Ref<TrafficDisruption | undefined>;
  getNetwork: () => TransportMapNetwork | undefined;
  getActiveLine: () => GlobalMapLine | undefined;
  getActiveStationView: () => unknown;
  getLineMetadataPaths: () => GlobalMapPath[];
  getSelectedBusDirectionEdgeKeys: () => ReadonlySet<string> | undefined;
  getSelectedBusDirectionStationSet: () => ReadonlySet<string> | undefined;
  getGhostLineIds: () => readonly string[];
  getCalendarTrafficDisruptions?: () => readonly TrafficDisruption[];
  getCalendarTrafficActive?: () => boolean;
  draw: () => void;
  performanceTrace?: TransportMapPerformanceTrace;
}

export function useGlobalTransportTraffic(options: UseGlobalTransportTrafficOptions) {
  const { t } = useI18n();
  const traffic = useTransportMapTraffic();
  let trafficPollingTimer: number | undefined;

  const trafficStatusLabel = computed(() =>
    t(`globalMap.page.trafficStatus.${traffic.status.value}` as never),
  );

  const trafficImpactByReference = computed(() => {
    const impacts = new Map<string, TransportMapTrafficLineImpact>();
    if (!traffic.enabled.value) return impacts;
    for (const impact of traffic.snapshot.value?.lineImpacts ?? []) {
      for (const reference of expandTrafficIds([normalizeTrafficLineRef(impact.lineId)])) {
        impacts.set(reference, impact);
      }
    }
    return impacts;
  });

  const trafficImpactByLineId = computed(() => {
    const impacts = new Map<string, TransportMapTrafficLineImpact>();
    if (!traffic.enabled.value) return impacts;
    for (const line of options.getNetwork()?.lines ?? []) {
      const impact = lineTrafficReferences(line)
        .map((reference) => trafficImpactByReference.value.get(reference))
        .find((candidate): candidate is TransportMapTrafficLineImpact => Boolean(candidate));
      if (impact) impacts.set(line.id, impact);
    }
    return impacts;
  });

  const activeLineTrafficImpact = computed(() => {
    const lineId = options.getActiveLine()?.id;
    return lineId ? trafficImpactByLineId.value.get(lineId) : undefined;
  });

  const activeLineTrafficTopologyPaths = computed(() => {
    const line = options.getActiveLine();
    const mapNetwork = options.getNetwork();
    if (!line || !mapNetwork) return [];

    const regionalPaths = mapNetwork.regionalPaths.filter((path) => path.lineId === line.id);
    const edgeKeys = options.getSelectedBusDirectionEdgeKeys();
    const stationIds = options.getSelectedBusDirectionStationSet();
    if (!edgeKeys || !stationIds) return regionalPaths;

    return filterPathsForGlobalBusDirection(regionalPaths, edgeKeys, stationIds, {
      allowReversedPathStorage: true,
    });
  });

  const calendarTrafficActive = computed(() => Boolean(
    options.getCalendarTrafficActive?.() && options.getActiveLine(),
  ));
  const calendarTrafficDisruptions = computed(() =>
    calendarTrafficActive.value
      ? [...(options.getCalendarTrafficDisruptions?.() ?? [])]
      : [],
  );

  const activeTrafficAnalysis = computed(() => {
    const network = options.getNetwork();
    const disruptions = calendarTrafficActive.value
      ? calendarTrafficDisruptions.value
      : traffic.enabled.value
        ? activeLineTrafficImpact.value?.disruptions ?? []
        : [];
    if (!network || disruptions.length === 0) return EMPTY_ACTIVE_TRAFFIC_ANALYSIS;
    const topologyPaths = activeLineTrafficTopologyPaths.value;
    const lineMetadataPaths = options.getLineMetadataPaths();
    return analyzeActiveTransportMapTraffic(
      disruptions,
      lineMetadataPaths,
      network.stationsById,
      topologyPaths.length > 0 ? topologyPaths : lineMetadataPaths,
    );
  });

  // A selected station owns the ghost correspondence colours. Do not let a
  // line-level traffic impact recolour those temporary contextual paths.
  const ghostTrafficSuppressedLineIds = computed<ReadonlySet<string>>(() =>
    options.getActiveStationView() ? new Set(options.getGhostLineIds()) : new Set<string>(),
  );
  const interruptionLineIds = computed(() =>
    traffic.enabled.value
      ? [...trafficImpactByLineId.value]
          .filter(
            ([lineId, impact]) =>
              lineId !== options.getActiveLine()?.id &&
              impact.kind === "interruption" &&
              !ghostTrafficSuppressedLineIds.value.has(lineId),
          )
          .map(([lineId]) => lineId)
      : EMPTY_TRAFFIC_IDS,
  );
  const disturbanceLineIds = computed(() =>
    traffic.enabled.value
      ? [...trafficImpactByLineId.value]
          .filter(
            ([lineId, impact]) =>
              lineId !== options.getActiveLine()?.id &&
              impact.kind === "disturbance" &&
              !ghostTrafficSuppressedLineIds.value.has(lineId),
          )
          .map(([lineId]) => lineId)
      : EMPTY_TRAFFIC_IDS,
  );
  const interruptedStationIds = computed(() =>
    traffic.enabled.value || calendarTrafficActive.value
      ? activeTrafficAnalysis.value.interruptedStationIds
      : EMPTY_TRAFFIC_IDS,
  );
  const disturbedStationIds = computed(() =>
    traffic.enabled.value || calendarTrafficActive.value
      ? activeTrafficAnalysis.value.disturbedStationIds
      : EMPTY_TRAFFIC_IDS,
  );
  const trafficPathSpans = computed(() =>
    traffic.enabled.value || calendarTrafficActive.value
      ? activeTrafficAnalysis.value.pathSpans
      : EMPTY_TRAFFIC_PATH_SPANS,
  );

  const sceneTrafficStateReader = (): GlobalTransportSceneTrafficState => ({
    interruptionLineIds: interruptionLineIds.value,
    disturbanceLineIds: disturbanceLineIds.value,
    interruptedStationIds: interruptedStationIds.value,
    disturbedStationIds: disturbedStationIds.value,
    trafficPathSpans: trafficPathSpans.value,
  });

  function enableTraffic(): void {
    options.activeTrafficDisruption.value = undefined;
    const trace = options.performanceTrace?.isRunning ? options.performanceTrace : undefined;
    const refreshTraceId = trace
      ? trace.begin("traffic_refresh", { scope: "network", enabled: true })
      : undefined;
    const refresh = traffic.refresh();
    startTrafficPolling();
    options.draw();
    void refresh.finally(() => {
      trace?.end(refreshTraceId, { scope: "network" });
      options.draw();
    });
  }

  function disableTraffic(): void {
    traffic.disable();
    stopTrafficPolling();
    options.activeTrafficDisruption.value = undefined;
    options.draw();
  }

  function toggleTraffic(): void {
    if (traffic.enabled.value) {
      disableTraffic();
      return;
    }
    enableTraffic();
  }

  function startTrafficPolling(): void {
    stopTrafficPolling();
    trafficPollingTimer = window.setInterval(() => {
      if (!traffic.enabled.value || document.visibilityState === "hidden") return;
      const trace = options.performanceTrace?.isRunning ? options.performanceTrace : undefined;
      const refreshTraceId = trace
        ? trace.begin("traffic_refresh", { scope: "poll" })
        : undefined;
      void traffic.refresh().finally(() => {
        trace?.end(refreshTraceId, { scope: "poll" });
        options.draw();
      });
    }, TRAFFIC_POLL_INTERVAL_MS);
  }

  function stopTrafficPolling(): void {
    if (trafficPollingTimer === undefined) return;
    window.clearInterval(trafficPollingTimer);
    trafficPollingTimer = undefined;
  }

  function isTrafficSnapshotOlderThan(ageMs: number): boolean {
    const fetchedAt = traffic.snapshot.value?.fetchedAt;
    return !fetchedAt || Date.now() - Date.parse(fetchedAt) > ageMs;
  }

  function refreshLineIfStale(lineId: string, previousLineId: string | undefined): void {
    if (
      lineId &&
      lineId !== previousLineId &&
      traffic.enabled.value &&
      traffic.snapshot.value &&
      isTrafficSnapshotOlderThan(TRAFFIC_DETAIL_REFRESH_AFTER_MS)
    ) {
      const trace = options.performanceTrace?.isRunning ? options.performanceTrace : undefined;
      const refreshTraceId = trace
        ? trace.begin("traffic_refresh", { scope: "line", lineId })
        : undefined;
      void traffic.refreshLine(normalizeTrafficLineRef(lineId)).finally(() => {
        trace?.end(refreshTraceId, { scope: "line", lineId });
        options.draw();
      });
    }
  }

  function resolveCandidateTrafficDisruption(
    candidate: LineHitCandidate,
  ): TrafficDisruption | undefined {
    if (calendarTrafficActive.value && candidate.id === options.getActiveLine()?.id) {
      const span = findTrafficPathSpan(
        trafficPathSpans.value,
        candidate.pathId,
        candidate.vertexSegmentIndex,
      );
      return span
        ? calendarTrafficDisruptions.value.find((disruption) => disruption.id === span.disruptionId)
        : undefined;
    }
    if (!traffic.enabled.value) return undefined;
    const impact = trafficImpactByLineId.value.get(candidate.id);
    if (!impact) return undefined;

    if (candidate.id === options.getActiveLine()?.id) {
      const span = findTrafficPathSpan(
        trafficPathSpans.value,
        candidate.pathId,
        candidate.vertexSegmentIndex,
      );
      return span
        ? impact.disruptions.find((disruption) => disruption.id === span.disruptionId)
        : undefined;
    }

    return impact.disruptions[0];
  }

  watch([traffic.snapshot, traffic.status], () => {
    const disruption = options.activeTrafficDisruption.value;
    if (disruption) {
      const remainsCurrent = calendarTrafficActive.value
        ? calendarTrafficDisruptions.value.some((candidate) => candidate.id === disruption.id)
        : activeLineTrafficImpact.value?.disruptions.some(
            (candidate) => candidate.id === disruption.id,
          ) === true;
      if ((!traffic.enabled.value && !calendarTrafficActive.value) || !remainsCurrent) {
        options.activeTrafficDisruption.value = undefined;
      }
    }
    options.draw();
  });
  onBeforeUnmount(stopTrafficPolling);

  return {
    traffic,
    trafficStatusLabel,
    sceneTrafficStateReader,
    enableTraffic,
    disableTraffic,
    toggleTraffic,
    stopTrafficPolling,
    refreshLineIfStale,
    resolveCandidateTrafficDisruption,
  };
}

function expandTrafficIds(ids: string[]): string[] {
  return ids.flatMap((id) => [id, id.startsWith("line:") ? id.slice(5) : `line:${id}`]);
}

function lineTrafficReferences(line: GlobalMapLine): string[] {
  return [
    ...new Set(
      [line.id, line.sourceLineId, ...line.aliases]
        .filter((reference): reference is string => Boolean(reference))
        .flatMap((reference) => expandTrafficIds([normalizeTrafficLineRef(reference)])),
    ),
  ];
}
