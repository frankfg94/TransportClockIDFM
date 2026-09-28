<script setup lang="ts">
import MaterialCombobox, {
  type MaterialComboboxOption,
} from "../../components/MaterialCombobox.vue";
import { useI18n } from "../../i18n";
import type { AppSettings } from "./appSettings";
import SettingsCategoryPanel from "./SettingsCategoryPanel.vue";
import type { SettingsCategoryEmits, SettingsCategoryProps } from "./settingsCategoryContract";

interface Props extends SettingsCategoryProps<AppSettings> {
  weatherModeLocalizedOptions: MaterialComboboxOption[];
  weatherTestModeLocalizedOptions: MaterialComboboxOption[];
  weatherLookaheadLocalizedOptions: MaterialComboboxOption[];
  weatherLocationLocalizedOptions: MaterialComboboxOption[];
}
const {
  isSettingVisible,
  panelOpen,
  settings,
  weatherLocationLocalizedOptions,
  weatherLookaheadLocalizedOptions,
  weatherModeLocalizedOptions,
  weatherTestModeLocalizedOptions,
} = defineProps<Props>();
const emit = defineEmits<
  SettingsCategoryEmits & {
    "update-weather-mode": [value: string];
    "update-weather-test-mode": [value: string];
    "update-weather-lookahead": [value: string];
    "update-weather-location-preset": [value: string];
    "update-weather-custom-location": [key: "label" | "latitude" | "longitude", value: string];
  }
>();
const { t } = useI18n();
</script>
<template>
  <SettingsCategoryPanel
    title-id="settings-weather-title"
    :eyebrow="t('weather.title')"
    :title="t('settings.display.weather')"
    :panel-open="panelOpen"
    @toggle="emit('toggle')"
  >
    <div v-if="isSettingVisible('weather.mode', 'weather')" class="settings-row">
      <div>
        <strong>{{ t("settings.display.weather") }}</strong>
        <span>{{ t("settings.display.weatherDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.weatherMode"
        :options="weatherModeLocalizedOptions"
        :aria-label="t('settings.display.weatherModeAria')"
        @update:model-value="emit('update-weather-mode', $event)"
      />
    </div>

    <div v-if="isSettingVisible('weather.test-mode', 'weather')" class="settings-row">
      <div>
        <strong>{{ t("settings.display.weatherTestMode") }}</strong>
        <span>{{ t("settings.display.weatherTestDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.weatherTestMode"
        :options="weatherTestModeLocalizedOptions"
        :aria-label="t('settings.display.weatherTestAria')"
        @update:model-value="emit('update-weather-test-mode', $event)"
      />
    </div>

    <div v-if="isSettingVisible('weather.lookahead', 'weather')" class="settings-row">
      <div>
        <strong>{{ t("settings.display.weatherLookahead") }}</strong>
        <span>{{ t("settings.display.weatherLookaheadDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="String(settings.weatherLookaheadMinutes)"
        :options="weatherLookaheadLocalizedOptions"
        :aria-label="t('settings.display.weatherLookaheadAria')"
        @update:model-value="emit('update-weather-lookahead', $event)"
      />
    </div>

    <label
      v-if="isSettingVisible('weather.apparent-temperature', 'weather')"
      class="settings-toggle"
    >
      <input
        type="checkbox"
        :checked="settings.weatherShowApparentTemperature"
        @change="
          emit('update-settings', {
            weatherShowApparentTemperature: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.weatherApparent") }}</strong>
        <small>{{ t("settings.display.weatherApparentDescription") }}</small>
      </div>
    </label>

    <div
      v-if="isSettingVisible('weather.location', 'weather', 'weather.custom-location')"
      class="settings-row"
    >
      <div>
        <strong>{{ t("settings.display.weatherLocation") }}</strong>
        <span>{{ t("settings.display.weatherLocationDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.weatherLocationPreset"
        :options="weatherLocationLocalizedOptions"
        :aria-label="t('settings.display.weatherLocationAria')"
        @update:model-value="emit('update-weather-location-preset', $event)"
      />
    </div>

    <div
      v-if="
        settings.weatherLocationPreset === 'custom' &&
        isSettingVisible('weather.custom-location', 'weather')
      "
      class="settings-custom-location"
    >
      <label>
        <span>{{ t("settings.display.weatherCustomName") }}</span>
        <input
          class="settings-input"
          :value="settings.weatherCustomLocation.label"
          type="text"
          @input="
            emit(
              'update-weather-custom-location',
              'label',
              ($event.target as HTMLInputElement).value,
            )
          "
        />
      </label>
      <label>
        <span>{{ t("settings.display.weatherCustomLatitude") }}</span>
        <input
          class="settings-input"
          :value="settings.weatherCustomLocation.latitude"
          inputmode="decimal"
          type="number"
          step="0.0001"
          @input="
            emit(
              'update-weather-custom-location',
              'latitude',
              ($event.target as HTMLInputElement).value,
            )
          "
        />
      </label>
      <label>
        <span>{{ t("settings.display.weatherCustomLongitude") }}</span>
        <input
          class="settings-input"
          :value="settings.weatherCustomLocation.longitude"
          inputmode="decimal"
          type="number"
          step="0.0001"
          @input="
            emit(
              'update-weather-custom-location',
              'longitude',
              ($event.target as HTMLInputElement).value,
            )
          "
        />
      </label>
    </div>
  </SettingsCategoryPanel>
</template>
