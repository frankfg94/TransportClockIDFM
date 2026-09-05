import { computed, nextTick, ref } from "vue";
import { useI18n } from "../../i18n";
import type { TrafficDisruption } from "../traffic/types";
import type { GlobalMapLine, GlobalMapStation } from "../transport-map/contracts/manifest";
import type { TransportMapNetwork } from "../transport-map/contracts/network";
import type { CameraState } from "../transport-map/geo/camera";
import { worldToScreen, type ScreenPoint } from "../transport-map/geo/coordinateKernel";
import type {
  HitTestResult,
  LineHitCandidate,
  TransportMapHitCandidates,
} from "../transport-map/spatial/hitTest";

export interface UseGlobalTransportHoverOptions {
  getNetwork: () => TransportMapNetwork | undefined;
  getCamera: () => CameraState;
  hitTest: (point: ScreenPoint) => TransportMapHitCandidates;
  isWheelScrolling: () => boolean;
  hasActivePointers: () => boolean;
  draw: () => void;
  setSidebarPreviewLineId: (lineId?: string) => void;
  selectFeature: (feature: TransportMapHitCandidates, event?: MouseEvent) => void;
  selectLine?: (line: GlobalMapLine, disruption?: TrafficDisruption) => void | Promise<void>;
  resolveCandidateTrafficDisruption?: (
    candidate: LineHitCandidate,
  ) => TrafficDisruption | undefined;
  getFocusableStations: () => readonly GlobalMapStation[];
  getActiveStationId: () => string | undefined;
  selectStation: (stationId: string) => void;
  focusTooltipChoice?: () => void | Promise<void>;
  isStationHitVisible?: (stationId: string) => boolean;
}

export function useGlobalTransportHover(options: UseGlobalTransportHoverOptions) {
  const { t } = useI18n();
  const hoveredFeature = ref<HitTestResult>();
  const hoveredLineCandidates = ref<LineHitCandidate[]>([]);
  const hoveredPointer = ref<ScreenPoint>();
  const lineChoiceOpen = ref(false);

  const hoveredFeatureLabel = computed(() => {
    const feature = hoveredFeature.value;
    const network = options.getNetwork();
    if (!feature || !network) return "";
    if (feature.type === "station") {
      return network.stationsById.get(feature.id)?.name ?? t("common.labels.station");
    }
    if (feature.type === "isochrone") {
      return feature.surfaces
        .map((surface) => `${surface.mode} ${surface.minutes} min`)
        .join(" · ");
    }
    return network.linesById.get(feature.id)?.label ?? t("common.labels.line");
  });

  const hoveredTooltipLines = computed<GlobalMapLine[]>(() => {
    const feature = hoveredFeature.value;
    const network = options.getNetwork();
    if (!feature || feature.type !== "line" || !network) return [];
    if (hoveredLineCandidates.value.length) {
      return hoveredLineCandidates.value
        .map((candidate) => network.linesById.get(candidate.id))
        .filter((line): line is GlobalMapLine => Boolean(line));
    }
    const line = network.linesById.get(feature.id);
    return line ? [line] : [];
  });

  const tooltipStyle = computed<Record<string, string>>(() => {
    const feature = hoveredFeature.value;
    const network = options.getNetwork();
    if (!feature || !network) return {} as Record<string, string>;
    const camera = options.getCamera();
    const point = feature.type === "station" ? network.stationsById.get(feature.id) : undefined;
    const screen = point
      ? worldToScreen({ x: point.worldX, y: point.worldY }, camera)
      : hoveredPointer.value;
    if (!screen) return {} as Record<string, string>;
    const tooltipWidth = 300;
    return {
      left: `${Math.max(8, Math.min(camera.viewportWidthCssPx - tooltipWidth, screen.x + 12))}px`,
      top: `${Math.max(8, screen.y - 40)}px`,
    };
  });

  function setHoveredFeature(
    feature: HitTestResult | undefined,
    pointer?: ScreenPoint,
    lineCandidates: LineHitCandidate[] = [],
  ): void {
    hoveredFeature.value = feature;
    hoveredLineCandidates.value = lineCandidates;
    options.setSidebarPreviewLineId(feature?.type === "line" ? feature.id : undefined);
    if (!lineCandidates.length) lineChoiceOpen.value = false;
    hoveredPointer.value = feature && pointer ? pointer : undefined;
    options.draw();
  }

  function clearHoverState(): void {
    hoveredFeature.value = undefined;
    hoveredLineCandidates.value = [];
    hoveredPointer.value = undefined;
    lineChoiceOpen.value = false;
    options.setSidebarPreviewLineId(undefined);
  }

  function clear(): void {
    clearHoverState();
    options.draw();
  }

  function closeLineChoice(): void {
    clearHoverState();
  }

  function clearLineChoiceState(): void {
    lineChoiceOpen.value = false;
    hoveredLineCandidates.value = [];
    options.setSidebarPreviewLineId(undefined);
  }

  function clearInvalidStationHover(): boolean {
    const feature = hoveredFeature.value;
    if (
      feature?.type !== "station" ||
      !options.isStationHitVisible ||
      options.isStationHitVisible(feature.id)
    ) {
      return false;
    }
    clearHoverState();
    return true;
  }

  function shouldClearOnWheel(): boolean {
    return (
      hoveredFeature.value?.type === "line" ||
      hoveredFeature.value?.type === "isochrone" ||
      hoveredLineCandidates.value.length > 0 ||
      lineChoiceOpen.value
    );
  }

  function openLineChoice(lineCandidates: LineHitCandidate[], event?: MouseEvent): void {
    if (lineCandidates.length < 2) return;
    lineChoiceOpen.value = true;
    hoveredLineCandidates.value = lineCandidates;
    const first = lineCandidates[0]!;
    hoveredFeature.value = {
      type: "line",
      id: first.id,
      distanceCssPx: first.distanceCssPx,
    };
    options.setSidebarPreviewLineId(first.id);
    options.draw();
    if (!event) void focusTooltipChoice();
  }

  function hoveredHitCandidates(): TransportMapHitCandidates | undefined {
    const feature = hoveredFeature.value;
    if (!feature) return undefined;
    if (feature.type === "station") {
      return {
        station: {
          type: "station",
          id: feature.id,
          distanceCssPx: feature.distanceCssPx,
        },
        lines: [],
      };
    }
    if (feature.type === "isochrone") return { lines: [], isochrone: feature };
    const candidate = hoveredLineCandidates.value.find(
      (lineCandidate) => lineCandidate.id === feature.id,
    );
    return {
      lines: hoveredLineCandidates.value.length
        ? hoveredLineCandidates.value
        : [
            {
              type: "line",
              id: feature.id,
              pathId: candidate?.pathId ?? "",
              vertexSegmentIndex: candidate?.vertexSegmentIndex,
              distanceCssPx: feature.distanceCssPx,
              distanceMeters: candidate?.distanceMeters ?? 0,
            },
          ],
    };
  }

  function selectHoveredFeature(): void {
    const hit = hoveredHitCandidates();
    if (hit) options.selectFeature(hit);
  }

  function focusTooltipChoice(): Promise<void> {
    return nextTick(() => {
      void options.focusTooltipChoice?.();
    });
  }

  function focusFeature(direction: 1 | -1): void {
    const stations = options.getFocusableStations();
    if (!stations.length) return;
    const current = options.getActiveStationId();
    const currentIndex = current ? stations.findIndex((station) => station.id === current) : -1;
    const next = stations[(currentIndex + direction + stations.length) % stations.length];
    if (!next) return;
    options.selectStation(next.id);
    setHoveredFeature({ type: "station", id: next.id, distanceCssPx: 0 });
  }

  function leave(event: PointerEvent): void {
    if (options.hasActivePointers()) return;

    const relatedTarget = event.relatedTarget;
    const enteringTooltip =
      relatedTarget instanceof Element &&
      Boolean(relatedTarget.closest(".global-transport-plan__tooltip"));
    if (enteringTooltip || lineChoiceOpen.value) {
      restoreHoveredTooltipLine();
      return;
    }

    clear();
  }

  function setHoveredLine(lineId?: string): void {
    if (!lineId && lineChoiceOpen.value) {
      restoreHoveredTooltipLine();
      return;
    }

    // A sidebar transfer hover is an ephemeral map highlight. Keep the pinned
    // station/line context intact; only tooltip hovers may populate the sidebar
    // preview state.
    hoveredFeature.value = lineId ? { type: "line", id: lineId, distanceCssPx: 0 } : undefined;
    hoveredLineCandidates.value = [];
    lineChoiceOpen.value = false;
    hoveredPointer.value = undefined;
    if (!lineId) options.setSidebarPreviewLineId(undefined);
    options.draw();
  }

  function setHoveredTooltipLine(lineId: string): void {
    const candidate = hoveredLineCandidates.value.find((line) => line.id === lineId);
    if (!candidate) return;
    hoveredFeature.value = {
      type: "line",
      id: candidate.id,
      distanceCssPx: candidate.distanceCssPx,
    };
    options.setSidebarPreviewLineId(candidate.id);
    options.draw();
  }

  function restoreHoveredTooltipLine(): void {
    options.setSidebarPreviewLineId(undefined);
    const candidate = hoveredLineCandidates.value[0];
    if (!candidate) {
      options.draw();
      return;
    }
    hoveredFeature.value = {
      type: "line",
      id: candidate.id,
      distanceCssPx: candidate.distanceCssPx,
    };
    options.draw();
  }

  function handleTooltipLeave(): void {
    if (lineChoiceOpen.value) {
      restoreHoveredTooltipLine();
      return;
    }
    clear();
  }

  function selectTooltipLine(lineId: string): void {
    const line = options.getNetwork()?.linesById.get(lineId);
    if (!line) return;
    const candidate = hoveredLineCandidates.value.find((item) => item.id === lineId);
    const disruption = candidate
      ? options.resolveCandidateTrafficDisruption?.(candidate)
      : undefined;
    clearHoverState();
    options.draw();
    void options.selectLine?.(line, disruption);
  }

  function update(point: ScreenPoint): void {
    if (options.isWheelScrolling() || lineChoiceOpen.value) return;
    const hit = options.hitTest(point);
    if (hit.station) {
      setHoveredFeature(hit.station, point);
    } else if (hit.lines.length) {
      const primary = hit.lines[0]!;
      setHoveredFeature(
        { type: "line", id: primary.id, distanceCssPx: primary.distanceCssPx },
        point,
        hit.lines,
      );
    } else if (hit.isochrone) {
      setHoveredFeature(hit.isochrone, point);
    } else {
      setHoveredFeature(undefined);
    }
  }

  return {
    hoveredFeature,
    hoveredLineCandidates,
    hoveredPointer,
    lineChoiceOpen,
    hoveredFeatureLabel,
    hoveredTooltipLines,
    tooltipStyle,
    update,
    hitTest: options.hitTest,
    clear,
    closeLineChoice,
    clearLineChoiceState,
    clearInvalidStationHover,
    shouldClearOnWheel,
    openLineChoice,
    selectHoveredFeature,
    focusFeature,
    focusTooltipChoice,
    leave,
    setHoveredLine,
    setHoveredTooltipLine,
    restoreHoveredTooltipLine,
    handleTooltipLeave,
    selectTooltipLine,
  };
}
