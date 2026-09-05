import { computed, ref } from "vue";
import { useI18n } from "../../i18n";
import type { GlobalMapLine, GlobalMapStation } from "../transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import {
  addGlobalMapTargetsToDashboard,
  listGlobalMapDashboardPlaces,
  type GlobalMapDashboardTarget,
} from "../transport-map/adapters/dashboard";

export interface UseGlobalTransportDashboardOptions {
  getNetwork: () => TransportMapNetwork | undefined;
  getActiveStation: () => GlobalMapStation | undefined;
  getActiveLine: () => GlobalMapLine | undefined;
  getSelectedStations: () => readonly GlobalMapStation[];
  selectStationForDashboard: (stationId: string) => void;
}

export function useGlobalTransportDashboard(options: UseGlobalTransportDashboardOptions) {
  const { t } = useI18n();
  const dashboardPlaces = ref(listGlobalMapDashboardPlaces());
  const dashboardPlaceId = ref("");
  const dashboardBusy = ref(false);
  const dashboardMessage = ref("");
  const lastDashboardUndo = ref<(() => void) | undefined>();
  const dashboardHasUndo = computed(() => Boolean(lastDashboardUndo.value));

  function refreshDashboardPlaces(): void {
    dashboardPlaces.value = listGlobalMapDashboardPlaces();
    if (
      !dashboardPlaceId.value ||
      !dashboardPlaces.value.some((place) => place.id === dashboardPlaceId.value)
    ) {
      dashboardPlaceId.value = dashboardPlaces.value[0]?.id ?? "";
    }
  }

  function createDashboardTargets(stations: readonly GlobalMapStation[]): GlobalMapDashboardTarget[] {
    const currentNetwork = options.getNetwork();
    if (!currentNetwork) return [];

    return stations.flatMap((station) => {
      const activeLine = options.getActiveLine();
      const lineIds =
        station.id === options.getActiveStation()?.id && activeLine
          ? [activeLine.id, ...station.lineIds]
          : station.lineIds;
      const lineId = lineIds.find((candidate) => currentNetwork.linesById.has(candidate));
      const line = lineId ? currentNetwork.linesById.get(lineId) : undefined;
      return line ? [{ station, line }] : [];
    });
  }

  async function addStationsToDashboard(stations: readonly GlobalMapStation[]): Promise<void> {
    refreshDashboardPlaces();
    const targets = createDashboardTargets(stations);
    if (!targets.length || !dashboardPlaceId.value) {
      dashboardMessage.value = t("globalMap.page.dashboard.noCompatibleStation");
      return;
    }

    dashboardBusy.value = true;
    dashboardMessage.value = "";
    try {
      const result = await addGlobalMapTargetsToDashboard(targets, dashboardPlaceId.value);
      lastDashboardUndo.value = result.addedBoardIds.length > 0 ? result.undo : undefined;
      refreshDashboardPlaces();
      const fragments: string[] = [];
      if (result.addedBoardIds.length) {
        fragments.push(t("globalMap.page.dashboard.added", { count: result.addedBoardIds.length }));
      }
      if (result.duplicateBoardIds.length) {
        fragments.push(
          t("globalMap.page.dashboard.duplicate", { count: result.duplicateBoardIds.length }),
        );
      }
      if (result.skippedStationIds.length) {
        fragments.push(
          t("globalMap.page.dashboard.skipped", { count: result.skippedStationIds.length }),
        );
      }
      dashboardMessage.value = fragments.join(" - ") || t("globalMap.page.dashboard.unchanged");
    } catch (error) {
      dashboardMessage.value =
        error instanceof Error ? error.message : t("globalMap.page.dashboard.addFailed");
      lastDashboardUndo.value = undefined;
    } finally {
      dashboardBusy.value = false;
    }
  }

  async function addActiveStationToDashboard(): Promise<void> {
    const station = options.getActiveStation();
    if (!station) return;
    options.selectStationForDashboard(station.id);
    await addStationsToDashboard([station]);
  }

  async function addSelectionToDashboard(): Promise<void> {
    await addStationsToDashboard(options.getSelectedStations());
  }

  function undoDashboardAdd(): void {
    if (!lastDashboardUndo.value) return;
    lastDashboardUndo.value();
    lastDashboardUndo.value = undefined;
    refreshDashboardPlaces();
    dashboardMessage.value = t("globalMap.page.dashboard.undo");
  }

  return {
    dashboardPlaces,
    dashboardPlaceId,
    dashboardBusy,
    dashboardMessage,
    dashboardHasUndo,
    refreshDashboardPlaces,
    addActiveStationToDashboard,
    addSelectionToDashboard,
    undoDashboardAdd,
  };
}
