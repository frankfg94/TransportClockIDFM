<script setup lang="ts">
import MaterialCombobox, {
  type MaterialComboboxOption,
} from "../../components/MaterialCombobox.vue";
import { useI18n } from "../../i18n";
import type { TransitBoardPreferences } from "../../types/transit";
import type { AppSettings } from "./appSettings";
import SettingsCategoryPanel from "./SettingsCategoryPanel.vue";
import type { SettingsCategoryEmits, SettingsCategoryProps } from "./settingsCategoryContract";

type Settings = Pick<
  AppSettings,
  | "fullscreenStationPanelDesign"
  | "fullscreenStationPanelDarkTheme"
  | "ghostNetworkStructuralOnly"
  | "trafficInfoDesign"
>;

interface Props extends SettingsCategoryProps<Settings> {
  placeOptions: MaterialComboboxOption[];
  selectedDisplayPlaceId: string;
  selectedDisplayPreferences?: TransitBoardPreferences;
  boardTogglesPlacementLocalizedOptions: MaterialComboboxOption[];
  fullscreenStationPanelDesignLocalizedOptions: MaterialComboboxOption[];
  closedDirectionSummaryLocalizedOptions: MaterialComboboxOption[];
  maxDeparturesLocalizedOptions: MaterialComboboxOption[];
  trafficInfoDesignLocalizedOptions: MaterialComboboxOption[];
}

const {
  boardTogglesPlacementLocalizedOptions,
  closedDirectionSummaryLocalizedOptions,
  fullscreenStationPanelDesignLocalizedOptions,
  isSettingVisible,
  maxDeparturesLocalizedOptions,
  panelOpen,
  placeOptions,
  selectedDisplayPlaceId,
  selectedDisplayPreferences,
  settings,
  trafficInfoDesignLocalizedOptions,
} = defineProps<Props>();
const emit = defineEmits<
  SettingsCategoryEmits & {
    "update-board-toggles-placement": [value: string];
    "update-closed-summary-mode": [value: string];
    "update-display-place": [value: string];
    "update-display-preferences": [patch: Partial<TransitBoardPreferences>];
    "update-max-departures": [value: string];
    "update-panel-design": [value: string];
    "update-traffic-info-design": [value: string];
  }
>();
const { t } = useI18n();
</script>

<template>
  <SettingsCategoryPanel
    title-id="settings-display-title"
    :eyebrow="t('settings.display.eyebrow')"
    :title="t('settings.display.title')"
    :panel-open="panelOpen"
    @toggle="emit('toggle')"
  >
    <div v-if="isSettingVisible('display.place', 'display')" class="settings-row">
      <div>
        <strong>{{ t("settings.places.displayPlaceLabel") }}</strong>
        <span>{{ t("settings.places.displayPlaceDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="selectedDisplayPlaceId"
        :options="placeOptions"
        :aria-label="t('settings.places.displayPlaceAria')"
        @update:model-value="emit('update-display-place', $event)"
      />
    </div>

    <div v-if="isSettingVisible('display.station-buttons', 'display')" class="settings-row">
      <div>
        <strong>{{ t("settings.display.stationButtons") }}</strong>
        <span>{{ t("settings.display.stationButtonsDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="selectedDisplayPreferences?.boardTogglesPlacement ?? 'inline'"
        :options="boardTogglesPlacementLocalizedOptions"
        :aria-label="t('settings.display.stationButtonsAria')"
        @update:model-value="emit('update-board-toggles-placement', $event)"
      />
    </div>

    <div v-if="isSettingVisible('display.panel-design', 'display')" class="settings-row">
      <div>
        <strong>{{ t("settings.display.panelDesign") }}</strong>
        <span>{{ t("settings.display.panelDesignDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.fullscreenStationPanelDesign"
        :options="fullscreenStationPanelDesignLocalizedOptions"
        :aria-label="t('settings.display.panelDesignAria')"
        @update:model-value="emit('update-panel-design', $event)"
      />
    </div>

    <label v-if="isSettingVisible('display.panel-dark-theme', 'display')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="settings.fullscreenStationPanelDarkTheme"
        @change="
          emit('update-settings', {
            fullscreenStationPanelDarkTheme: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.panelDarkTheme") }}</strong>
        <small>{{ t("settings.display.panelDarkThemeDescription") }}</small>
      </div>
    </label>

    <div v-if="isSettingVisible('display.closed-accordion', 'display')" class="settings-row">
      <div>
        <strong>{{ t("settings.display.closedAccordion") }}</strong>
        <span>{{ t("settings.display.closedAccordionDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="selectedDisplayPreferences?.closedDirectionSummaryMode ?? 'next'"
        :options="closedDirectionSummaryLocalizedOptions"
        :aria-label="t('settings.display.closedAccordionAria')"
        @update:model-value="emit('update-closed-summary-mode', $event)"
      />
    </div>

    <div v-if="isSettingVisible('display.max-departures', 'display')" class="settings-row">
      <div>
        <strong>{{ t("settings.display.maxDepartures") }}</strong>
        <span>{{ t("settings.display.maxDeparturesDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="String(selectedDisplayPreferences?.maxDeparturesPerDirection ?? 'default')"
        :options="maxDeparturesLocalizedOptions"
        :aria-label="t('settings.display.maxDeparturesAria')"
        @update:model-value="emit('update-max-departures', $event)"
      />
    </div>

    <label v-if="isSettingVisible('display.terminal-only', 'display')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="selectedDisplayPreferences?.terminalDirectionsOnly ?? false"
        @change="
          emit('update-display-preferences', {
            terminalDirectionsOnly: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.terminalOnly") }}</strong>
        <small>{{ t("settings.display.terminalOnlyDescription") }}</small>
      </div>
    </label>

    <label v-if="isSettingVisible('display.ghost-lines', 'display')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="settings.ghostNetworkStructuralOnly"
        @change="
          emit('update-settings', {
            ghostNetworkStructuralOnly: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.structuralGhostLines") }}</strong>
        <small>{{ t("settings.display.structuralGhostLinesDescription") }}</small>
      </div>
    </label>

    <div v-if="isSettingVisible('display.traffic-design', 'display')" class="settings-row">
      <div>
        <strong>{{ t("settings.display.trafficDesign") }}</strong>
        <span>{{ t("settings.display.trafficDesignDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.trafficInfoDesign"
        :options="trafficInfoDesignLocalizedOptions"
        :aria-label="t('settings.display.trafficDesignAria')"
        @update:model-value="emit('update-traffic-info-design', $event)"
      />
    </div>
  </SettingsCategoryPanel>
</template>
