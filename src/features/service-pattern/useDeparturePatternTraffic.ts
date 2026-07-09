import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
} from "vue";
import { toServerApiUrl } from "../../services/serverApi";
import type { LineSearchOption, TransitBoardConfig } from "../../types/transit";
import { normalizeTrafficLineRef } from "../traffic/trafficNormalization";
import {
  getCurrentAndUpcomingTrafficWarningDisruptions,
  getCurrentTrafficDisruptions,
  getUpcomingTrafficWarningStart,
} from "../traffic/trafficTiming";
import type { TrafficLineReport, TrafficResponse } from "../traffic/types";
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
  board?: ComputedRef<TransitBoardConfig | undefined>;
  line?: ComputedRef<LineSearchOption | undefined>;
  smartTrafficDetection: ComputedRef<boolean>;
  trafficReport: ComputedRef<TrafficLineReport | undefined>;
  includeUpcomingWarnings?: ComputedRef<boolean>;
  selectedTrafficDisruptionIds?: ComputedRef<string[] | undefined>;
  trafficEvaluationTimestamp?: ComputedRef<number | undefined>;
  warningLookaheadDays?: ComputedRef<number>;
}

export function useDeparturePatternTraffic({
  open,
  board,
  line,
  smartTrafficDetection,
  trafficReport,
  includeUpcomingWarnings,
  selectedTrafficDisruptionIds,
  trafficEvaluationTimestamp,
  warningLookaheadDays,
}: UseDeparturePatternTrafficOptions) {
  const fetchedTrafficReport = ref<TrafficLineReport>();
  const activeTrafficImpact = ref<PatternTrafficImpact>();
  const trafficTimingNow = ref(Date.now());
  let trafficReportRequest = 0;
  let trafficTimingTimer: number | undefined;

  const patternTrafficLineRef = computed(() => {
    const currentBoard = board?.value;
    const currentLine = line?.value;

    if (currentBoard) {
      return currentBoard.line.mode !== "bus"
        ? normalizeTrafficLineRef(
            currentBoard.schedule?.lineRef ?? currentBoard.line.ref,
          )
        : undefined;
    }

    if (!currentLine || isBusLikeTrafficLine(currentLine)) {
      return undefined;
    }

    return normalizeTrafficLineRef(
      currentLine.ref || currentLine.navitiaId || currentLine.id,
    );
  });

  const resolvedTrafficReport = computed(
    () => trafficReport.value ?? fetchedTrafficReport.value,
  );
  const includeUpcomingTrafficWarnings = computed(
    () => includeUpcomingWarnings?.value ?? false,
  );
  const upcomingWarningLookaheadDays = computed(
    () => warningLookaheadDays?.value ?? 10,
  );
  const selectedTrafficEvaluationTimestamp = computed(
    () => trafficEvaluationTimestamp?.value,
  );
  const forcedTrafficDisruptionIds = computed(
    () => selectedTrafficDisruptionIds?.value ?? [],
  );

  const currentTrafficDisruptions = computed(() => {
    const selectedNow = selectedTrafficEvaluationTimestamp.value;
    const now =
      typeof selectedNow === "number" && Number.isFinite(selectedNow)
        ? selectedNow
        : trafficTimingNow.value;
    const disruptions = resolvedTrafficReport.value?.disruptions ?? [];

    if (!smartTrafficDetection.value || !patternTrafficLineRef.value) {
      return [];
    }

    if (forcedTrafficDisruptionIds.value.length > 0) {
      const forcedIds = new Set(forcedTrafficDisruptionIds.value);

      return disruptions.filter((disruption) => forcedIds.has(disruption.id));
    }

    if (typeof selectedNow === "number" && Number.isFinite(selectedNow)) {
      return getCurrentTrafficDisruptions(disruptions, now);
    }

    return includeUpcomingTrafficWarnings.value
      ? getCurrentAndUpcomingTrafficWarningDisruptions(
          disruptions,
          now,
          upcomingWarningLookaheadDays.value,
        )
      : getCurrentTrafficDisruptions(disruptions, now);
  });

  const trafficImpactKey = computed(() =>
    [
      patternTrafficLineRef.value ?? "none",
      selectedTrafficEvaluationTimestamp.value === undefined
        ? "today"
        : `at:${selectedTrafficEvaluationTimestamp.value}`,
      forcedTrafficDisruptionIds.value.join(","),
    ]
      .concat(
        currentTrafficDisruptions.value.map((disruption) => {
          const warningStart = getUpcomingTrafficWarningStart(
            disruption,
            trafficTimingNow.value,
            upcomingWarningLookaheadDays.value,
          );

          return warningStart
            ? `${disruption.id}:${warningStart.toISOString()}`
            : `${disruption.id}:current`;
        }),
      )
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

  watch(
    [
      open,
      smartTrafficDetection,
      includeUpcomingTrafficWarnings,
      upcomingWarningLookaheadDays,
    ],
    syncTrafficTimingTimer,
    { immediate: true },
  );

  watch([open, patternTrafficLineRef, trafficImpactKey], () => {
    activeTrafficImpact.value = undefined;
  });

  onBeforeUnmount(() => {
    trafficReportRequest += 1;
    stopTrafficTimingTimer();
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

  function syncTrafficTimingTimer(): void {
    stopTrafficTimingTimer();
    trafficTimingNow.value = Date.now();

    if (
      !open.value ||
      !smartTrafficDetection.value ||
      !includeUpcomingTrafficWarnings.value ||
      upcomingWarningLookaheadDays.value <= 0 ||
      typeof window === "undefined"
    ) {
      return;
    }

    trafficTimingTimer = window.setInterval(() => {
      trafficTimingNow.value = Date.now();
    }, 60_000);
  }

  function stopTrafficTimingTimer(): void {
    if (trafficTimingTimer !== undefined) {
      window.clearInterval(trafficTimingTimer);
      trafficTimingTimer = undefined;
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
    trafficTimingNow,
    trafficImpactKey,
  };
}

function isBusLikeTrafficLine(line: LineSearchOption): boolean {
  return line.family === "BUS" || line.family === "NOCTILIEN";
}

function createEmptyDeparturePatternTrafficAnalysis(): PatternTrafficImpactAnalysis {
  return {
    segments: [],
    stationImpacts: {},
    edgeImpacts: {},
  };
}
