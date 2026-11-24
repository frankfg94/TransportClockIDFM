import { shallowReactive, watch, type Ref } from "vue";
import { fetchLineTopology } from "../../services/lineTopology";
import { runNetworkTask } from "../../services/networkScheduler";
import type { TransitBoardConfig } from "../../types/transit";
import { getTrafficSectionEvidence } from "../service-pattern/trafficImpactAnalysis";
import { createDashboardTrafficBranchFilter, resolveBoardTrafficLineRef } from "./dashboardTrafficBranches";
import type { TrafficLineReport } from "./types";

type BranchFilter = ReturnType<typeof createDashboardTrafficBranchFilter>;
const topologyRequests = new Map<string, {
  expiresAt: number;
  promise: Promise<BranchFilter | undefined>;
}>();

function loadBranchFilter(lineRef: string): Promise<BranchFilter | undefined> {
  const cached = topologyRequests.get(lineRef);
  if (cached && Date.now() < cached.expiresAt) return cached.promise;

  const entry = {
    expiresAt: Number.POSITIVE_INFINITY,
    promise: runNetworkTask((signal) => fetchLineTopology(lineRef, signal))
      .then((topology) => topology && createDashboardTrafficBranchFilter(topology))
      .catch(() => undefined)
      .then((filter) => {
        entry.expiresAt = Date.now() + (filter ? 6 * 60 * 60_000 : 60_000);
        return filter;
      }),
  };
  topologyRequests.set(lineRef, entry);
  return entry.promise;
}

export function useDashboardTrafficBranches(
  enabled: Readonly<Ref<boolean>>,
  boards: Readonly<Ref<readonly TransitBoardConfig[]>>,
  reports: Readonly<Ref<ReadonlyMap<string, TrafficLineReport>>>,
) {
  const filters = shallowReactive(new Map<string, BranchFilter>());

  watch([enabled, boards, reports], ([isEnabled, currentBoards, currentReports], _, onCleanup) => {
    if (!isEnabled) return;
    let current = true;
    onCleanup(() => { current = false; });

    const candidates = new Set(currentBoards
      .filter((board) => board.line.mode !== "bus")
      .map(resolveBoardTrafficLineRef));
    for (const lineRef of candidates) {
      if (!currentReports.get(lineRef)?.disruptions.some((disruption) =>
        disruption.impactedStopNames.length || getTrafficSectionEvidence(disruption).sections.length,
      )) continue;
      void loadBranchFilter(lineRef).then((filter) => {
        if (current && filter) filters.set(lineRef, filter);
      });
    }
  }, { immediate: true });

  return (report: TrafficLineReport, selectedBoards: readonly TransitBoardConfig[]): TrafficLineReport =>
    enabled.value ? filters.get(report.lineRef)?.(report, selectedBoards) ?? report : report;
}
