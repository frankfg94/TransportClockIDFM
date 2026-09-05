export type NearbyAddressPresetId = "chateaubriand" | "simoneDeBeauvoir" | "divisionLeclerc" | "parisIntramuros";

export type NearbyAddressPreset = {
  id: NearbyAddressPresetId;
  labelKey: `nearbyStations.presets.${NearbyAddressPresetId}`;
};

export const NEARBY_ADDRESS_PRESETS: NearbyAddressPreset[] = [
  { id: "chateaubriand", labelKey: "nearbyStations.presets.chateaubriand" },
  { id: "simoneDeBeauvoir", labelKey: "nearbyStations.presets.simoneDeBeauvoir" },
  { id: "divisionLeclerc", labelKey: "nearbyStations.presets.divisionLeclerc" },
  { id: "parisIntramuros", labelKey: "nearbyStations.presets.parisIntramuros" },
];
