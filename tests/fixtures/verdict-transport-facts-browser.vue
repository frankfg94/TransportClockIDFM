<script setup lang="ts">
// Browser validation fixture: mount the actual score card and fact builders without external services.
import { computed, ref } from "vue";
import Card from "../../src/features/nearby-stations/NearbyNeighborhoodScoreCard.vue";
import { buildNeighborhoodScore } from "../../src/features/nearby-stations/neighborhood";
import type { GlobalMapLine } from "../../src/features/transport-map/contracts/manifest";
import type { NearbyStationEntry } from "../../src/features/nearby-stations/nearbyStations";
const scenario = ref("complete");
const lines: GlobalMapLine[] = [
  ["C01374", "4", "METRO"], ["C01743", "B", "RER"], ["C01736", "N", "TRANSILIEN"], ["C01794", "T6", "TRAM"], ["C02745", "C1", "CABLE"],
].map(([id, label, mode], index) => ({ id: `IDFM:${id}`, code: id!, label: label!, mode: mode as GlobalMapLine["mode"], index,
  color: "#5146ff", textColor: "#fff", aliases: [], stationIds: [], geometryIds: [] }));
const station = { id: "station", name: "Station de référence", lineIds: lines.map(line => line.id), memberStationIds: [], lon: 2.3, lat: 48.8 };
const entry = { id: station.id, station, lines, memberStations: [], insideRadius: true, distanceMeters: 100 } as unknown as NearbyStationEntry;
const result = computed(() => buildNeighborhoodScore({ places: [], placesLoaded: false, stationsLoaded: true, stations: [entry],
  lastServiceByLine: new Map(lines.map((line, index) => [line.id,
    scenario.value === "absent" || scenario.value === "partial" && index > 1 ? undefined : { seconds: index === 3 ? 20 * 3600 : 90000 + index * 300, stopName: station.name },
  ])),
}));
</script>
<template>
  <main style="max-width: 960px; margin: 24px auto; padding: 16px">
    <h1>Validation locale du lot 02 — données de test</h1>
    <label>État des horaires <select v-model="scenario" aria-label="État des horaires"><option value="complete">Complets</option><option value="partial">Partiels</option><option value="absent">Absents</option></select></label>
    <Card :result="result" directory-url="/nearby-stations" />
  </main>
</template>
