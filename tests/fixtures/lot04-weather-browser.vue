<script setup lang="ts">
// Controlled browser scenarios use the production normalizer and weather UI.
import { ref, onBeforeUnmount } from "vue";
import WeatherExperience from "../../src/features/weather/WeatherExperience.vue";
import { normalizeOpenMeteoWeather } from "../../src/features/weather/openMeteo";
import { useAppSettings } from "../../src/features/app-settings";
const scenario = ref("light");
const generation = ref(0);
const { settings, updateSettings } = useAppSettings();
const saved = { language: settings.value.language, weatherMode: settings.value.weatherMode, weatherTestMode: settings.value.weatherTestMode, weatherShowApparentTemperature: settings.value.weatherShowApparentTemperature };
// Restore these test preferences when leaving the fixture.
updateSettings({ language: "fr", weatherMode: "alerts_only", weatherTestMode: "off", weatherShowApparentTemperature: true });
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (!String(input).startsWith("/api/weather?")) return originalFetch(input, init);
  const now = new Date();
  const delay = scenario.value === "future" ? 18 * 60_000 : scenario.value === "transition" ? 12_000 : 0;
  const amount = scenario.value === "heavy" ? 5 : scenario.value === "moderate" ? 1.5 : 0.3;
  const start = new Date(now.getTime() + delay);
  const end = new Date(now.getTime() + delay + 57 * 60_000);
  const response = normalizeOpenMeteoWeather({
    current: { time: now.toISOString(), temperature_2m: 12, apparent_temperature: 11, weather_code: delay ? 0 : 61 },
    minutely_15: {
      time: [start.toISOString(), end.toISOString()],
      precipitation: [amount, 0], rain: [amount, 0], weather_code: [61, 0],
      temperature_2m: [12, 12], apparent_temperature: [11, 11],
    },
  }, { now, lookaheadMinutes: 120, location: { label: "Paris", latitude: 48.85, longitude: 2.35 } });
  return new Response(JSON.stringify(response), { status: 200, headers: { "Content-Type": "application/json" } });
};
onBeforeUnmount(() => { globalThis.fetch = originalFetch; updateSettings(saved); });
</script>
<template>
  <main style="max-width:960px;margin:32px auto;padding:16px">
    <h1>Lot 04 — scénarios contrôlés, données météo simulées</h1>
    <label>Scénario météo
      <select v-model="scenario" aria-label="Scénario météo" @change="generation++">
        <option value="light">Pluie légère en cours</option>
        <option value="moderate">Pluie moyenne en cours</option>
        <option value="heavy">Pluie forte en cours</option>
        <option value="future">Pluie future, 18 minutes</option>
        <option value="transition">Transition dans 12 secondes</option>
      </select>
    </label>
    <WeatherExperience :key="generation" />
    <NuxtLink to="/">Retour Home et restauration des réglages</NuxtLink>
  </main>
</template>
