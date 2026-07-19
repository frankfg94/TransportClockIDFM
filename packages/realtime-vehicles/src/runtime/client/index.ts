import { computed, markRaw } from "vue";
import { Clock3 } from "lucide-vue-next";
import type { Node } from "@vue-flow/core";
import type {
  TransportClockClientPlugin,
  TransportClockPatternExtensionContext,
  TransportClockPatternExtensionStatus,
} from "@transport-clock/nuxt-plugin-host/types";
import PatternVehicleNode from "./components/PatternVehicleNode.vue";
import TransportPositionParameterSettings from "./components/TransportPositionParameterSettings.vue";
import vehicleImageUrl from "./assets/rer_mi84.webp";
import { messages } from "./messages";
import { getPatternVehicleLayoutPoint } from "./patternVehicleGeometry";
import {
  createDefaultTransportPositionParameterSettings,
  normalizeTransportPositionParameterSettings,
} from "./transportPositionParameters";
import type {
  TransitVehicleSnapshot,
  TransportPosition,
  TransportPositionsStatus,
} from "./transportPositions";
import { useTransportPositions } from "./useTransportPositions";

const PLUGIN_ID = "idfm-realtime-vehicles";
const NODE_WIDTH = 72;
const NODE_HEIGHT = 28;

const plugin: TransportClockClientPlugin = {
  apiVersion: 1,
  id: PLUGIN_ID,
  version: "1.0.0",
  defaultEnabled: true,
  metadata: {
    author: "Transport Clock",
    name: {
      en: "Realtime vehicle visualization",
      fr: "Visualisation des transports en temps reel",
    },
    description: {
      en: "Animated estimates of guided vehicle positions on line diagrams.",
      fr: "Estimation animee de la position des transports guides sur les schemas de ligne.",
    },
  },
  presentation: {
    accentColor: "#5136ff",
    icon: markRaw(Clock3),
  },
  messages,
  settings: {
    component: markRaw(TransportPositionParameterSettings),
    defaultValue: createDefaultTransportPositionParameterSettings(),
    version: 1,
    normalize: normalizeTransportPositionParameterSettings,
    migrateLegacy(raw) {
      const hasEnabled =
        typeof raw.experimentalRealtimeVehicleVisualization === "boolean";
      const hasParameters =
        raw.experimentalRealtimeVehicleParameters !== undefined;
      if (!hasEnabled && !hasParameters) {
        return undefined;
      }
      return {
        claimedKeys: [
          "experimentalRealtimeVehicleVisualization",
          "experimentalRealtimeVehicleParameters",
        ],
        enabled: hasEnabled
          ? Boolean(raw.experimentalRealtimeVehicleVisualization)
          : true,
        value: normalizeTransportPositionParameterSettings(
          raw.experimentalRealtimeVehicleParameters,
        ),
      };
    },
  },
  servicePattern: {
    setup: createServicePatternExtension,
  },
};

export default plugin;

function createServicePatternExtension(
  context: TransportClockPatternExtensionContext,
) {
  const parameters = computed(() =>
    normalizeTransportPositionParameterSettings(context.settings.value),
  );
  const endpoint = computed(() => {
    const line = context.line.value;
    if (!line || line.mode === "bus") {
      return undefined;
    }
    const transportType =
      line.transportType ?? (line.mode === "train" ? "transilien" : line.mode);
    const lineId = line.id ?? line.shortName ?? line.ref;
    return transportType && lineId
      ? context.resolveServerApiUrl(
        "/api/lines/" +
        encodeURIComponent(transportType) +
        "/" +
        encodeURIComponent(lineId) +
        "/vehicles",
      )
      : undefined;
  });
  const active = computed(
    () =>
      context.active.value &&
      Boolean(endpoint.value) &&
      context.stationPositions.value.size > 0,
  );
  const {
    transportPositions,
    status,
    lastUpdatedAt,
    snapshot,
  } = useTransportPositions({
    active,
    endpoint,
    reduceMotion: context.reduceMotion,
    parameterSettings: parameters,
  });
  const nodes = computed<Node[]>(() =>
    active.value
      ? transportPositions.value.flatMap((position) =>
        createVehicleNode(position, context),
      )
      : [],
  );
  const extensionStatus = computed<TransportClockPatternExtensionStatus | undefined>(
    () => {
      if (!endpoint.value || !context.active.value) {
        return undefined;
      }
      return {
        id: PLUGIN_ID,
        state: status.value,
        label: getStatusLabel(status.value, context),
        detail: lastUpdatedAt.value
          ? context.t("pattern.realtimeVehicles.lastUpdated", {
            time: context.formatClock(lastUpdatedAt.value),
          })
          : undefined,
        tooltip: getStatusTooltip(status.value, snapshot.value, context),
      };
    },
  );

  return {
    nodes,
    nodeTypes: {
      [PLUGIN_ID + ":vehicle"]: markRaw(PatternVehicleNode) as never,
    },
    status: extensionStatus,
  };
}

function createVehicleNode(
  position: TransportPosition,
  context: TransportClockPatternExtensionContext,
): Node[] {
  const sourceId = context.resolveStationKey(position.sourceStationId);
  const targetId = context.resolveStationKey(position.targetStationId);
  if (
    !sourceId ||
    !targetId ||
    !context.isSegmentVisible(sourceId, targetId)
  ) {
    return [];
  }
  const point = getPatternVehicleLayoutPoint({
    sourceId,
    targetId,
    progress: position.progress,
    positions: context.stationPositions.value,
    rounded: context.patternRoundedCurves.value,
  });
  if (!point) {
    return [];
  }
  const mode = context.line.value?.mode?.toLowerCase();
  const transportType = context.line.value?.transportType?.toLowerCase();
  const imageUrl =
    mode === "rer" || transportType === "rer"
      ? vehicleImageUrl
      : ["metro", "tram", "tramway"].includes(mode ?? "") ||
        ["metro", "tram", "tramway"].includes(transportType ?? "")
        ? "/images/mp14_train_top.webp"
        : undefined;

  return [{
    id: PLUGIN_ID + ":" + position.trackId,
    type: PLUGIN_ID + ":vehicle",
    position: { x: point.x - NODE_WIDTH / 2, y: point.y - NODE_HEIGHT / 2 },
    draggable: false,
    selectable: false,
    connectable: false,
    focusable: false,
    class: "pattern-flow-vehicle-node",
    zIndex: 50,
    data: {
      angleDegrees: point.angleDegrees,
      ariaLabel: context.t("pattern.realtimeVehicles.vehicleAria", {
        destination: position.destination ?? context.destinationLabel.value,
      }),
      confidence: position.confidence,
      fallbackLabel: context.fallbackVehicleLabel.value,
      imageUrl,
      layoutX: point.x,
      layoutY: point.y,
      state: position.state,
    },
  }];
}

function getStatusLabel(
  status: TransportPositionsStatus,
  context: TransportClockPatternExtensionContext,
): string {
  const suffix = {
    idle: "estimated",
    loading: "loading",
    live: "live",
    stale: "stale",
    rate_limited: "rateLimited",
    unavailable: "unavailable",
    error: "error",
  }[status];
  return context.t("pattern.realtimeVehicles." + suffix);
}

function getStatusTooltip(
  status: TransportPositionsStatus,
  snapshot: TransitVehicleSnapshot | undefined,
  context: TransportClockPatternExtensionContext,
): string | undefined {
  if (status !== "unavailable") {
    return undefined;
  }
  const reason = snapshot?.reason ?? "unknown";
  return context.t("pattern.realtimeVehicles.unavailableTooltip", {
    reason: context.t(
      "pattern.realtimeVehicles.unavailableReasons." + reason,
    ),
  });
}
