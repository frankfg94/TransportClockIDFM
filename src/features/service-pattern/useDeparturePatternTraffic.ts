import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
} from "vue";
import { toServerApiUrl } from "../../services/serverApi";
import type { TransitBoardConfig } from "../../types/transit";
import {
  getCurrentTrafficDisruptions,
  normalizeTrafficLineRef,
  type TrafficLineReport,
  type TrafficResponse,
} from "../traffic";
import {
  analyzeTrafficImpacts,
  type PatternTrafficEdge,
  type PatternTrafficImpact,
  type PatternTrafficImpactAnalysis,
  type PatternTrafficStation,
} from "./trafficImpactAnalysis";

export type DeparturePatternTrafficAnalyzer = (
  stations: PatternTrafficStation[],
  edges: PatternTrafficEdge[],
) => PatternTrafficImpactAnalysis;

interface UseDeparturePatternTrafficOptions {
  open: ComputedRef<boolean>;
  board: ComputedRef<TransitBoardConfig | undefined>;
  smartTrafficDetection: ComputedRef<boolean>;
  trafficReport: ComputedRef<TrafficLineReport | undefined>;
}

export function useDeparturePatternTraffic({
  open,
  board,
  smartTrafficDetection,
  trafficReport,
}: UseDeparturePatternTrafficOptions) {
  const fetchedTrafficReport = ref<TrafficLineReport>();
  const activeTrafficImpact = ref<PatternTrafficImpact>();
  let trafficReportRequest = 0;

  const patternTrafficLineRef = computed(() => {
    const currentBoard = board.value;

    return currentBoard && currentBoard.line.mode !== "bus"
      ? normalizeTrafficLineRef(
          currentBoard.schedule?.lineRef ?? currentBoard.line.ref,
        )
      : undefined;
  });

  const resolvedTrafficReport = computed(
    () => trafficReport.value ?? fetchedTrafficReport.value,
  );

  const currentTrafficDisruptions = computed(() =>
    smartTrafficDetection.value && patternTrafficLineRef.value
      ? getCurrentTrafficDisruptions(
          resolvedTrafficReport.value?.disruptions ?? [],
        )
      : [],
  );

  const trafficImpactKey = computed(() =>
    [patternTrafficLineRef.value ?? "none"]
      .concat(currentTrafficDisruptions.value.map((disruption) => disruption.id))
      .join("|"),
  );

  const analyzeCurrentTrafficImpacts: DeparturePatternTrafficAnalyzer = (
    stations,
    edges,
  ) =>
    currentTrafficDisruptions.value.length > 0
      ? analyzeTrafficImpacts(currentTrafficDisruptions.value, stations, edges)
      : createEmptyDeparturePatternTrafficAnalysis();

  watch(
    [open, patternTrafficLineRef, smartTrafficDetection, trafficReport],
    () => {
      void refreshPatternTrafficReport();
    },
    { immediate: true },
  );

  watch([open, patternTrafficLineRef, trafficImpactKey], () => {
    activeTrafficImpact.value = undefined;
  });

  onBeforeUnmount(() => {
    trafficReportRequest += 1;
  });

  function showTrafficImpactPopup(impact?: PatternTrafficImpact): void {
    if (!impact) {
      return;
    }

    activeTrafficImpact.value = impact;
  }

  function closeTrafficImpactPopup(): void {
    activeTrafficImpact.value = undefined;
  }

  async function refreshPatternTrafficReport(): Promise<void> {
    const requestId = ++trafficReportRequest;
    const lineRef = patternTrafficLineRef.value;

    if (
      !open.value ||
      !smartTrafficDetection.value ||
      trafficReport.value ||
      !lineRef ||
      typeof window === "undefined"
    ) {
      fetchedTrafficReport.value = undefined;
      return;
    }

    try {
      const params = new URLSearchParams({ lineRefs: lineRef });
      const response = await fetch(toServerApiUrl(`/api/traffic?${params}`));

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const payload = (await response.json()) as TrafficResponse;
      const report =
        payload.lines.find(
          (line) => normalizeTrafficLineRef(line.lineRef) === lineRef,
        ) ?? payload.lines[0];

      if (requestId === trafficReportRequest) {
        fetchedTrafficReport.value = report;
      }
    } catch {
      if (requestId === trafficReportRequest) {
        fetchedTrafficReport.value = undefined;
      }
    }
  }

  return {
    activeTrafficImpact,
    analyzeCurrentTrafficImpacts,
    closeTrafficImpactPopup,
    currentTrafficDisruptions,
    patternTrafficLineRef,
    refreshPatternTrafficReport,
    resolvedTrafficReport,
    showTrafficImpactPopup,
    trafficImpactKey,
  };
}

function createEmptyDeparturePatternTrafficAnalysis(): PatternTrafficImpactAnalysis {
  return {
    segments: [],
    stationImpacts: {},
    edgeImpacts: {},
  };
}
