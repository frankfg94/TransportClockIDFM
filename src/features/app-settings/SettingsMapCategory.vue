<script setup lang="ts">
import MaterialCombobox, {
  type MaterialComboboxOption,
} from "../../components/MaterialCombobox.vue";
import { useI18n } from "../../i18n";
import type { AppSettings } from "./appSettings";
import {
  PATTERN_COMPACT_BRANCH_GAP_MAX,
  PATTERN_COMPACT_BRANCH_GAP_MIN,
  PATTERN_COMPACT_FORK_GAP_MAX,
  PATTERN_COMPACT_FORK_GAP_MIN,
  PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_MAX,
  PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_MIN,
  PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_MAX,
  PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_MIN,
} from "./appSettings";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../transport-map/config/globalTransportPlanConfig";
import SettingsCategoryPanel from "./SettingsCategoryPanel.vue";
import type { SettingsCategoryEmits, SettingsCategoryProps } from "./settingsCategoryContract";

interface Props extends SettingsCategoryProps<AppSettings> {
  globalMapBasemapStyleLocalizedOptions: MaterialComboboxOption[];
  compactLinePlanLocalizedOptions: MaterialComboboxOption[];
}
const {
  compactLinePlanLocalizedOptions,
  isSettingVisible,
  panelOpen,
  settings,
  globalMapBasemapStyleLocalizedOptions,
} = defineProps<Props>();
const emit = defineEmits<
  SettingsCategoryEmits & {
    "update-basemap-contrast": [value: string];
    "update-basemap-style": [value: string];
    "update-compact-mode": [value: string];
    "update-compact-branch-gap": [value: string];
    "update-compact-fork-gap": [value: string];
    "update-realistic-min-gap": [value: string];
    "update-realistic-max-gap": [value: string];
  }
>();
const { n, t } = useI18n();

function formatPixels(value: number): string {
  return `${Math.round(value)} px`;
}

function formatMapContrast(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatCoefficient(value: number): string {
  return `${n(value, { maximumFractionDigits: 2, minimumFractionDigits: 0 })}x`;
}
</script>
<template>
  <SettingsCategoryPanel
    title-id="settings-map-title"
    :eyebrow="t('settings.display.mapEyebrow')"
    :title="t('settings.display.mapTitle')"
    :panel-open="panelOpen"
    @toggle="emit('toggle')"
  >
    <div v-if="isSettingVisible('map.contrast', 'map')" class="settings-row settings-row--range">
      <div>
        <strong>{{ t("settings.display.mapContrast") }}</strong>
        <span>{{ t("settings.display.mapContrastDescription") }}</span>
      </div>
      <label class="settings-range">
        <span>{{ formatMapContrast(settings.globalMapBasemapContrast) }}</span>
        <input
          data-settings-map-contrast
          :max="GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.contrast.max"
          :min="GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.contrast.min"
          :value="settings.globalMapBasemapContrast"
          :aria-label="t('settings.display.mapContrastAria')"
          :step="GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.contrast.step"
          type="range"
          @input="emit('update-basemap-contrast', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <div v-if="isSettingVisible('map.basemap-style', 'map')" class="settings-row">
      <div>
        <strong>{{ t("settings.display.mapBasemapStyle") }}</strong>
        <span>{{ t("settings.display.mapBasemapStyleDescription") }}</span>
      </div>
      <MaterialCombobox
        data-settings-map-basemap-style
        :model-value="settings.globalMapBasemapStyle"
        :options="globalMapBasemapStyleLocalizedOptions"
        :aria-label="t('settings.display.mapBasemapStyleAria')"
        @update:model-value="emit('update-basemap-style', $event)"
      />
    </div>

    <label
      v-if="isSettingVisible('map.antialiasing', 'map')"
      class="settings-toggle"
      data-settings-map-antialiasing
    >
      <input
        type="checkbox"
        role="switch"
        :checked="settings.deckAntialiasing"
        :aria-checked="settings.deckAntialiasing"
        :aria-label="t('settings.display.deckAntialiasingAria')"
        @change="
          emit('update-settings', {
            deckAntialiasing: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.deckAntialiasing") }}</strong>
        <small>{{ t("settings.display.deckAntialiasingDescription") }}</small>
      </div>
    </label>

    <div v-if="isSettingVisible('map.nearby-controls', 'map')" class="settings-subheading">
      <strong>{{ t("settings.display.nearbyMapControlsTitle") }}</strong>
      <span>{{ t("settings.display.nearbyMapControlsDescription") }}</span>
    </div>

    <label
      v-if="isSettingVisible('map.nearby-isochrone', 'map', 'map.nearby-controls')"
      class="settings-toggle"
      data-settings-nearby-control="isochrone"
    >
      <input
        type="checkbox"
        :checked="settings.nearbyMapShowIsochroneControl"
        @change="
          emit('update-settings', {
            nearbyMapShowIsochroneControl: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.nearbyMapShowIsochroneControl") }}</strong>
        <small>{{ t("settings.display.nearbyMapShowIsochroneControlDescription") }}</small>
      </div>
    </label>

    <label
      v-if="isSettingVisible('map.nearby-directory', 'map', 'map.nearby-controls')"
      class="settings-toggle"
      data-settings-nearby-control="directory"
    >
      <input
        type="checkbox"
        :checked="settings.nearbyMapShowDirectoryControl"
        @change="
          emit('update-settings', {
            nearbyMapShowDirectoryControl: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.nearbyMapShowDirectoryControl") }}</strong>
        <small>{{ t("settings.display.nearbyMapShowDirectoryControlDescription") }}</small>
      </div>
    </label>

    <label
      v-if="isSettingVisible('map.nearby-basemap', 'map', 'map.nearby-controls')"
      class="settings-toggle"
      data-settings-nearby-control="basemap"
    >
      <input
        type="checkbox"
        :checked="settings.nearbyMapShowBasemapControl"
        @change="
          emit('update-settings', {
            nearbyMapShowBasemapControl: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.nearbyMapShowBasemapControl") }}</strong>
        <small>{{ t("settings.display.nearbyMapShowBasemapControlDescription") }}</small>
      </div>
    </label>

    <label
      v-if="isSettingVisible('map.nearby-display', 'map', 'map.nearby-controls')"
      class="settings-toggle"
      data-settings-nearby-control="display"
    >
      <input
        type="checkbox"
        :checked="settings.nearbyMapShowDisplayControl"
        @change="
          emit('update-settings', {
            nearbyMapShowDisplayControl: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.nearbyMapShowDisplayControl") }}</strong>
        <small>{{ t("settings.display.nearbyMapShowDisplayControlDescription") }}</small>
      </div>
    </label>

    <label
      v-if="isSettingVisible('map.nearby-fullscreen', 'map', 'map.nearby-controls')"
      class="settings-toggle"
      data-settings-nearby-control="fullscreen"
    >
      <input
        type="checkbox"
        :checked="settings.nearbyMapShowFullscreenControl"
        @change="
          emit('update-settings', {
            nearbyMapShowFullscreenControl: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.nearbyMapShowFullscreenControl") }}</strong>
        <small>{{ t("settings.display.nearbyMapShowFullscreenControlDescription") }}</small>
      </div>
    </label>

    <label v-if="isSettingVisible('map.minimap', 'map')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="settings.showPatternMiniMap"
        @change="
          emit('update-settings', {
            showPatternMiniMap: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.showMiniMap") }}</strong>
        <small>{{ t("settings.display.showMiniMapDescription") }}</small>
      </div>
    </label>

    <label
      v-if="isSettingVisible('map.line-icons', 'map')"
      class="settings-toggle"
      data-settings-travel-route-line-icons
    >
      <input
        type="checkbox"
        role="switch"
        :checked="settings.showTravelRouteLineIcons"
        :aria-checked="settings.showTravelRouteLineIcons"
        :aria-label="t('settings.display.showTravelRouteLineIconsAria')"
        @change="
          emit('update-settings', {
            showTravelRouteLineIcons: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.showTravelRouteLineIcons") }}</strong>
        <small>{{ t("settings.display.showTravelRouteLineIconsDescription") }}</small>
      </div>
    </label>

    <label v-if="isSettingVisible('map.city-zones', 'map')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="settings.showPatternCityZones"
        @change="
          emit('update-settings', {
            showPatternCityZones: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.showCityZones") }}</strong>
        <small>{{ t("settings.display.showCityZonesDescription") }}</small>
      </div>
    </label>

    <div v-if="isSettingVisible('map.compact-mode', 'map')" class="settings-row">
      <div>
        <strong>{{ t("settings.display.compactMode") }}</strong>
        <span>{{ t("settings.display.compactModeDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.compactLinePlanMode"
        :options="compactLinePlanLocalizedOptions"
        :aria-label="t('settings.display.compactModeAria')"
        @update:model-value="emit('update-compact-mode', $event)"
      />
    </div>

    <div
      v-if="isSettingVisible('map.compact-vertical-spacing', 'map')"
      class="settings-row settings-row--range"
    >
      <div>
        <strong>{{ t("settings.display.compactVerticalSpacing") }}</strong>
        <span>{{ t("settings.display.compactVerticalSpacingDescription") }}</span>
      </div>
      <label class="settings-range">
        <span>{{ formatPixels(settings.patternCompactBranchGap) }}</span>
        <input
          :max="PATTERN_COMPACT_BRANCH_GAP_MAX"
          :min="PATTERN_COMPACT_BRANCH_GAP_MIN"
          :value="settings.patternCompactBranchGap"
          :aria-label="t('settings.display.compactVerticalSpacingAria')"
          step="4"
          type="range"
          @input="emit('update-compact-branch-gap', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <label v-if="isSettingVisible('map.rounded-curves', 'map')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="settings.patternRoundedCurves"
        @change="
          emit('update-settings', {
            patternRoundedCurves: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.roundedCurves") }}</strong>
        <small>{{ t("settings.display.roundedCurvesDescription") }}</small>
      </div>
    </label>

    <label v-if="isSettingVisible('map.interruption-walking-times', 'map')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="settings.showInterruptionWalkingTimes"
        @change="
          emit('update-settings', {
            showInterruptionWalkingTimes: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.interruptionWalkingTimes") }}</strong>
        <small>{{ t("settings.display.interruptionWalkingTimesDescription") }}</small>
      </div>
    </label>

    <div
      v-if="isSettingVisible('map.compact-fork-gap', 'map')"
      class="settings-row settings-row--range"
    >
      <div>
        <strong>{{ t("settings.display.compactForkGap") }}</strong>
        <span>{{ t("settings.display.compactForkGapDescription") }}</span>
      </div>
      <label class="settings-range">
        <span>{{ formatPixels(settings.patternCompactForkGap) }}</span>
        <input
          :max="PATTERN_COMPACT_FORK_GAP_MAX"
          :min="PATTERN_COMPACT_FORK_GAP_MIN"
          :value="settings.patternCompactForkGap"
          :aria-label="t('settings.display.compactForkGapAria')"
          step="2"
          type="range"
          @input="emit('update-compact-fork-gap', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <div v-if="isSettingVisible('map.realistic-spacing', 'map')" class="settings-range-pair">
      <div>
        <strong>{{ t("settings.display.realisticSpacing") }}</strong>
        <span>{{ t("settings.display.realisticSpacingDescription") }}</span>
      </div>
      <div class="settings-range-pair__controls">
        <label class="settings-range">
          <small>{{ t("settings.display.minCoefficient") }}</small>
          <span>
            {{ formatCoefficient(settings.patternRealisticMinGapCoefficient) }}
          </span>
          <input
            :max="PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_MAX"
            :min="PATTERN_REALISTIC_MIN_GAP_COEFFICIENT_MIN"
            :value="settings.patternRealisticMinGapCoefficient"
            :aria-label="t('settings.display.minCoefficientAria')"
            step="0.05"
            type="range"
            @input="emit('update-realistic-min-gap', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="settings-range">
          <small>{{ t("settings.display.maxCoefficient") }}</small>
          <span>
            {{ formatCoefficient(settings.patternRealisticMaxGapCoefficient) }}
          </span>
          <input
            :max="PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_MAX"
            :min="PATTERN_REALISTIC_MAX_GAP_COEFFICIENT_MIN"
            :value="settings.patternRealisticMaxGapCoefficient"
            :aria-label="t('settings.display.maxCoefficientAria')"
            step="0.25"
            type="range"
            @input="emit('update-realistic-max-gap', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </div>

    <label v-if="isSettingVisible('map.rich-transfer-tooltips', 'map')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="settings.richTransferTooltips"
        @change="
          emit('update-settings', {
            richTransferTooltips: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.richTransferTooltips") }}</strong>
        <small>{{ t("settings.display.richTransferTooltipsDescription") }}</small>
      </div>
    </label>

    <label v-if="isSettingVisible('map.reduce-motion', 'map')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="settings.reduceMotion"
        @change="
          emit('update-settings', {
            reduceMotion: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.reduceMotion") }}</strong>
        <small>{{ t("settings.display.reduceMotionDescription") }}</small>
      </div>
    </label>
  </SettingsCategoryPanel>
</template>
