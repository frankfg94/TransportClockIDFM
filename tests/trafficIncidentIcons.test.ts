import { describe, expect, it } from "vitest";
import {
  BaggageClaim,
  BatteryLow,
  HeartPulse,
  Music,
  PackageSearch,
  PartyPopper,
  PawPrint,
  RadioTower,
  RouteOff,
  Siren,
  TreePine,
} from "lucide-vue-next";
import { trafficIncidentIcons } from "../src/features/service-pattern/trafficIncidentIcons";

describe("traffic incident icons", () => {
  it("maps precise traffic causes to their dedicated icons", () => {
    expect(trafficIncidentIcons).toMatchObject({
      concert: Music,
      celebration: PartyPopper,
      animal: PawPrint,
      "fallen-tree": TreePine,
      luggage: BaggageClaim,
      signalling: RadioTower,
      diversion: RouteOff,
      "suspicious-package": PackageSearch,
      medical: HeartPulse,
      "train-breakdown": BatteryLow,
      police: Siren,
    });
  });
});
