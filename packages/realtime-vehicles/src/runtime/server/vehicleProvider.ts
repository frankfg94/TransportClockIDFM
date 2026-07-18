import type { TransitVehicleSnapshot } from "../client/transportPositions";
import type { NetexLineCache } from "#transport-clock/plugin-server";
import {
  getRealtimeVehicleSnapshot,
  REALTIME_VEHICLE_POLL_AFTER_MS,
} from "./vehicleSnapshot";

export interface RealtimeVehicleProviderContext {
  apiKey: string;
  lineCache: NetexLineCache;
  now?: Date;
}

/**
 * Server-only provider boundary. A paid/private RATP source can implement this
 * contract without exposing its key or changing the browser composable.
 */
export interface RealtimeVehicleProvider {
  id: string;
  label: string;
  minimumPollAfterMs: number;
  capabilities: {
    exactCoordinates: boolean;
    exactVehicleIdentity: boolean;
    estimatedCalls: boolean;
  };
  loadSnapshot(context: RealtimeVehicleProviderContext): Promise<TransitVehicleSnapshot>;
}

export const idfmSiriEstimatedTimetableProvider: RealtimeVehicleProvider = {
  id: "idfm-siri-estimated-timetable",
  label: "IDFM PRIM · SIRI Estimated Timetable",
  minimumPollAfterMs: REALTIME_VEHICLE_POLL_AFTER_MS,
  capabilities: {
    exactCoordinates: false,
    exactVehicleIdentity: false,
    estimatedCalls: true,
  },
  async loadSnapshot(context) {
    const snapshot = await getRealtimeVehicleSnapshot(context);
    const diagnostics = snapshot.diagnostics ?? {
      stage: "upstream" as const,
      missing: [],
    };
    return {
      ...snapshot,
      diagnostics: {
        ...diagnostics,
        providerId: this.id,
        providerExactCoordinates: this.capabilities.exactCoordinates,
      },
    };
  },
};

export function getRealtimeVehicleProvider(): RealtimeVehicleProvider {
  return idfmSiriEstimatedTimetableProvider;
}
