import type { TransportClockClientPlugin } from "@transport-clock/nuxt-plugin-host/types";
import realtimeVehiclesPlugin from "../packages/realtime-vehicles/src/runtime/client";
import {
  createDefaultTransportPositionParameterSettings,
  normalizeTransportPositionParameterSettings,
} from "../packages/realtime-vehicles/src/runtime/client/transportPositionParameters";

export const transportClockPlugins: TransportClockClientPlugin[] = [
  {
    apiVersion: 1,
    defaultEnabled: true,
    id: "idfm-realtime-vehicles",
    version: "1.0.0",
    metadata: realtimeVehiclesPlugin.metadata,
    presentation: realtimeVehiclesPlugin.presentation,
    messages: realtimeVehiclesPlugin.messages,
    servicePattern: realtimeVehiclesPlugin.servicePattern,
    settings: {
      component: realtimeVehiclesPlugin.settings?.component,
      defaultValue: createDefaultTransportPositionParameterSettings(),
      version: 1,
      normalize: normalizeTransportPositionParameterSettings,
      migrateLegacy(raw) {
        const hasEnabled =
          typeof raw.experimentalRealtimeVehicleVisualization === "boolean";
        const hasValue =
          raw.experimentalRealtimeVehicleParameters !== undefined;
        return hasEnabled || hasValue
          ? {
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
            }
          : undefined;
      },
    },
  },
];
export default transportClockPlugins;
