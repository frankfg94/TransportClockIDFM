import { describe, expect, it } from "vitest";
import type { GlobalMapMode } from "../src/features/transport-map/contracts/manifest";
import {
  deriveGlobalTransportPlanPreset,
  GLOBAL_TRANSPORT_PLAN_PRESET_MODES,
} from "../src/features/line-map/globalTransportPlanModes";

describe("global transport plan preset derivation", () => {
  it("keeps the requested quick preset order and includes Bike", () => {
    expect(GLOBAL_TRANSPORT_PLAN_PRESET_MODES).toEqual([
      "METRO",
      "RER",
      "TRAIN",
      "TRANSILIEN",
      "TRAM",
      "CABLE",
      "BUS",
      "NOCTILIEN",
      "BIKE",
    ]);
  });

  it("derives Tout afficher from the complete available selection", () => {
    const available: GlobalMapMode[] = ["BUS", "METRO", "NOCTILIEN"];

    expect(deriveGlobalTransportPlanPreset(available, ["NOCTILIEN", "BUS", "METRO"])).toBe("ALL");
  });

  it("derives an exclusive preset only for one quick mode", () => {
    const available: GlobalMapMode[] = ["BUS", "METRO", "BIKE"];

    expect(deriveGlobalTransportPlanPreset(available, ["METRO"])).toBe("METRO");
    expect(deriveGlobalTransportPlanPreset(available, ["BIKE"])).toBe("BIKE");
    expect(deriveGlobalTransportPlanPreset(available, ["METRO", "BUS"])).toBeUndefined();
  });
});
