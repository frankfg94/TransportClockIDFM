<script setup lang="ts">
import MaterialCombobox, {
  type MaterialComboboxOption,
} from "../../components/MaterialCombobox.vue";
import { useI18n } from "../../i18n";
import type { AppSettings } from "./appSettings";
import {
  TRAFFIC_WARNING_LOOKAHEAD_DAYS_MAX,
  TRAFFIC_WARNING_LOOKAHEAD_DAYS_MIN,
} from "./appSettings";
import type { TrafficCacheMetadata } from "../traffic/types";
import { TRAFFIC_IMPACT_SEVERITY_MODEL } from "../traffic/trafficImpactSeverity";
import SettingsCategoryPanel from "./SettingsCategoryPanel.vue";
import type { SettingsCategoryEmits, SettingsCategoryProps } from "./settingsCategoryContract";

type Settings = AppSettings;
interface Props extends SettingsCategoryProps<Settings> {
  trafficInfoDefaultScopeLocalizedOptions: MaterialComboboxOption[];
  trafficCalendarImpactScopeLocalizedOptions: MaterialComboboxOption[];
  transferBundleRetentionLocalizedOptions: MaterialComboboxOption[];
  transferResolverModeLocalizedOptions: MaterialComboboxOption[];
  transferBundleRequestConcurrencyLocalizedOptions: MaterialComboboxOption[];
  transferBundleRequestSpacingLocalizedOptions: MaterialComboboxOption[];
  trafficCache?: TrafficCacheMetadata;
  trafficCacheStateLabel: string;
  trafficCacheCountdown: string;
  trafficCacheRefreshIntervalLabel: string;
  trafficCacheLastUpdateLabel: string;
  trafficCacheError: string;
  trafficCacheLoading: boolean;
  trafficImpactTransferRows: Array<{ id: string; label: string; weight: number }>;
  trafficImpactTopologyRows: Array<{ id: string; label: string; multiplier: number }>;
  trafficImpactEveningExample: { multiplier: number };
  trafficImpactExampleScore: number;
  trafficImpactEveningExampleStartLabel: string;
  trafficImpactEveningExampleEndLabel: string;
  trafficOffPeakStartLabel: string;
  trafficOffPeakEndLabel: string;
  trafficWarningLookaheadLabel: string;
}
const {
  isSettingVisible,
  panelOpen,
  settings,
  trafficCache,
  trafficCacheCountdown,
  trafficCacheError,
  trafficCacheLoading,
  trafficCacheLastUpdateLabel,
  trafficCacheRefreshIntervalLabel,
  trafficCacheStateLabel,
  trafficCalendarImpactScopeLocalizedOptions,
  trafficImpactEveningExample,
  trafficImpactExampleScore,
  trafficImpactEveningExampleStartLabel,
  trafficImpactEveningExampleEndLabel,
  trafficImpactTopologyRows,
  trafficImpactTransferRows,
  trafficOffPeakEndLabel,
  trafficOffPeakStartLabel,
  trafficInfoDefaultScopeLocalizedOptions,
  transferBundleRequestConcurrencyLocalizedOptions,
  transferBundleRequestSpacingLocalizedOptions,
  transferBundleRetentionLocalizedOptions,
  transferResolverModeLocalizedOptions,
  trafficWarningLookaheadLabel,
} = defineProps<Props>();
const emit = defineEmits<
  SettingsCategoryEmits & {
    "clear-bundles": [];
    "clear-walking-cache": [];
    "open-bundles": [];
    "refresh-traffic-cache": [];
    "update-calendar-impact-scope": [value: string];
    "update-default-scope": [value: string];
    "update-transfer-concurrency": [value: string];
    "update-transfer-resolver-mode": [value: string];
    "update-transfer-retention": [value: string];
    "update-transfer-spacing": [value: string];
    "update-warning-lookahead-days": [value: string];
  }
>();
const { n, t } = useI18n();
</script>
<template>
  <SettingsCategoryPanel
    title-id="settings-traffic-title"
    :eyebrow="t('common.labels.traffic')"
    :title="t('settings.display.trafficScope')"
    :panel-open="panelOpen"
    @toggle="emit('toggle')"
  >
    <div v-if="isSettingVisible('traffic.scope', 'traffic')" class="settings-row">
      <div>
        <strong>{{ t("settings.display.trafficScope") }}</strong>
        <span>{{ t("settings.display.trafficScopeDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.trafficInfoDefaultScope"
        :options="trafficInfoDefaultScopeLocalizedOptions"
        :aria-label="t('settings.display.trafficScopeAria')"
        @update:model-value="emit('update-default-scope', $event)"
      />
    </div>
    <article
      v-if="isSettingVisible('traffic.cache', 'traffic')"
      class="traffic-cache-settings"
      data-traffic-cache-settings
    >
      <header class="traffic-cache-settings__header">
        <div>
          <p class="eyebrow">{{ t("settings.trafficCache.eyebrow") }}</p>
          <h3>{{ t("settings.trafficCache.title") }}</h3>
          <p>{{ t("settings.trafficCache.description") }}</p>
        </div>
        <span
          class="traffic-cache-settings__state"
          :data-state="trafficCache?.state ?? 'miss'"
          data-traffic-cache-state
        >
          {{ trafficCacheStateLabel }}
        </span>
      </header>
      <dl class="traffic-cache-settings__facts">
        <div>
          <dt>{{ t("settings.trafficCache.frequency") }}</dt>
          <dd>{{ trafficCacheRefreshIntervalLabel }}</dd>
        </div>
        <div>
          <dt>{{ t("settings.trafficCache.lastUpdate") }}</dt>
          <dd>{{ trafficCacheLastUpdateLabel }}</dd>
        </div>
        <div>
          <dt>{{ t("settings.trafficCache.nextUpdate") }}</dt>
          <dd data-traffic-cache-countdown>{{ trafficCacheCountdown }}</dd>
        </div>
      </dl>
      <p v-if="trafficCacheError" class="settings-inline-warning" role="alert">
        {{ trafficCacheError }}
      </p>
      <p v-else-if="trafficCache?.lastError" class="settings-inline-warning" role="status">
        {{ trafficCache.lastError }}
      </p>
      <button
        class="button-secondary"
        type="button"
        data-traffic-cache-refresh
        :disabled="trafficCacheLoading"
        @click="emit('refresh-traffic-cache')"
      >
        {{
          trafficCacheLoading
            ? t("settings.trafficCache.refreshing")
            : t("settings.trafficCache.forceRefresh")
        }}
      </button>
    </article>
    <div v-if="isSettingVisible('traffic.calendar-scope', 'traffic')" class="settings-row">
      <div>
        <strong>{{ t("settings.display.trafficCalendarScope") }}</strong>
        <span>{{ t("settings.display.trafficCalendarScopeDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.trafficCalendarImpactScope"
        :options="trafficCalendarImpactScopeLocalizedOptions"
        :aria-label="t('settings.display.trafficCalendarScopeAria')"
        @update:model-value="emit('update-calendar-impact-scope', $event)"
      />
    </div>

    <article
      v-if="isSettingVisible('traffic.equation', 'traffic')"
      class="traffic-impact-equation"
      aria-labelledby="traffic-impact-equation-title"
      data-testid="traffic-impact-equation"
    >
      <header>
        <p class="eyebrow">{{ t("settings.trafficCalendarEquation.eyebrow") }}</p>
        <h3 id="traffic-impact-equation-title">
          {{ t("settings.trafficCalendarEquation.title") }}
        </h3>
        <p>{{ t("settings.trafficCalendarEquation.description") }}</p>
      </header>

      <code>{{ t("settings.trafficCalendarEquation.formula") }}</code>

      <div class="traffic-impact-equation__tables">
        <section>
          <h4>{{ t("settings.trafficCalendarEquation.transferWeights") }}</h4>
          <table>
            <tbody>
              <tr v-for="row in trafficImpactTransferRows" :key="row.id">
                <th scope="row">{{ row.label }}</th>
                <td>+{{ n(row.weight) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h4>{{ t("settings.trafficCalendarEquation.topology") }}</h4>
          <table>
            <tbody>
              <tr v-for="row in trafficImpactTopologyRows" :key="row.id">
                <th scope="row">{{ row.label }}</th>
                <td>? {{ n(row.multiplier) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h4>{{ t("settings.trafficCalendarEquation.temporal") }}</h4>
          <table>
            <tbody>
              <tr>
                <th scope="row">
                  {{ t("settings.trafficCalendarEquation.temporalCoverage") }}
                </th>
                <td>
                  {{
                    t("settings.trafficCalendarEquation.temporalCoverageValue", {
                      minutes: n(TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.minutesPerDay),
                    })
                  }}
                </td>
              </tr>
              <tr>
                <th scope="row">
                  {{ t("settings.trafficCalendarEquation.offPeak") }}
                </th>
                <td>
                  {{
                    t("settings.trafficCalendarEquation.offPeakValue", {
                      start: trafficOffPeakStartLabel,
                      end: trafficOffPeakEndLabel,
                      coefficient: n(TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.offPeakMultiplier),
                    })
                  }}
                </td>
              </tr>
              <tr>
                <th scope="row">
                  {{ t("settings.trafficCalendarEquation.unspecifiedTime") }}
                </th>
                <td>
                  &times;
                  {{ n(TRAFFIC_IMPACT_SEVERITY_MODEL.temporal.unspecifiedMultiplier) }}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        <section>
          <h4>{{ t("settings.trafficCalendarEquation.thresholds") }}</h4>
          <table>
            <tbody>
              <tr>
                <th scope="row">{{ t("pattern.trafficCalendarSeverity.low") }}</th>
                <td>&lt; {{ n(TRAFFIC_IMPACT_SEVERITY_MODEL.thresholds.medium) }}</td>
              </tr>
              <tr>
                <th scope="row">
                  {{ t("pattern.trafficCalendarSeverity.medium") }}
                </th>
                <td>
                  {{ n(TRAFFIC_IMPACT_SEVERITY_MODEL.thresholds.medium) }}
                  ? score &lt;
                  {{ n(TRAFFIC_IMPACT_SEVERITY_MODEL.thresholds.high) }}
                </td>
              </tr>
              <tr>
                <th scope="row">{{ t("pattern.trafficCalendarSeverity.high") }}</th>
                <td>? {{ n(TRAFFIC_IMPACT_SEVERITY_MODEL.thresholds.high) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      <p class="traffic-impact-equation__topology-note">
        {{
          t("settings.trafficCalendarEquation.topologyDeduction", {
            ratio: n(TRAFFIC_IMPACT_SEVERITY_MODEL.smallBranchRatio * 100),
          })
        }}
      </p>
      <p class="traffic-impact-equation__example">
        {{
          t("settings.trafficCalendarEquation.example", {
            base: n(TRAFFIC_IMPACT_SEVERITY_MODEL.baseStationScore),
            transfer: n(TRAFFIC_IMPACT_SEVERITY_MODEL.transferWeights.RER),
            coefficient: n(TRAFFIC_IMPACT_SEVERITY_MODEL.topologyMultipliers["trunk-core"]),
            temporal: n(trafficImpactEveningExample.multiplier),
            start: trafficImpactEveningExampleStartLabel,
            end: trafficImpactEveningExampleEndLabel,
            score: n(trafficImpactExampleScore),
          })
        }}
      </p>
      <p class="traffic-impact-equation__note">
        {{ t("settings.trafficCalendarEquation.exclusions") }}
      </p>
    </article>

    <label
      v-if="isSettingVisible('traffic.modal-formatting', 'traffic')"
      class="settings-toggle"
      :title="t('settings.display.trafficModalSmartFormattingDescription')"
    >
      <input
        type="checkbox"
        :checked="settings.smartTrafficModalFormatting"
        @change="
          emit('update-settings', {
            smartTrafficModalFormatting: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>
          {{ t("settings.display.trafficModalSmartFormatting") }}
        </strong>
        <small>
          {{ t("settings.display.trafficModalSmartFormattingDescription") }}
        </small>
      </div>
    </label>

    <label v-if="isSettingVisible('traffic.smart-detection', 'traffic')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="settings.smartTrafficDetection"
        @change="
          emit('update-settings', {
            smartTrafficDetection: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.smartTraffic") }}</strong>
        <small>{{ t("settings.display.smartTrafficDescription") }}</small>
      </div>
    </label>

    <label
      v-if="isSettingVisible('traffic.replacement-buses', 'traffic')"
      class="settings-toggle"
      :title="t('settings.display.unifyReplacementBusMarkersDescription')"
    >
      <input
        type="checkbox"
        :checked="settings.unifyReplacementBusMarkers"
        @change="
          emit('update-settings', {
            unifyReplacementBusMarkers: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.unifyReplacementBusMarkers") }}</strong>
        <small>{{ t("settings.display.unifyReplacementBusMarkersDescription") }}</small>
      </div>
    </label>

    <div
      v-if="isSettingVisible('traffic.warning-lookahead', 'traffic')"
      class="settings-row settings-row--range"
    >
      <div>
        <strong>{{ t("settings.display.trafficWarningLookahead") }}</strong>
        <span>{{ t("settings.display.trafficWarningLookaheadDescription") }}</span>
      </div>
      <label class="settings-range">
        <span>{{ trafficWarningLookaheadLabel }}</span>
        <input
          :max="TRAFFIC_WARNING_LOOKAHEAD_DAYS_MAX"
          :min="TRAFFIC_WARNING_LOOKAHEAD_DAYS_MIN"
          :value="settings.trafficWarningLookaheadDays"
          :aria-label="t('settings.display.trafficWarningLookaheadAria')"
          step="1"
          type="range"
          @input="emit('update-warning-lookahead-days', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <label
      v-if="isSettingVisible('traffic.user-location', 'traffic')"
      class="settings-toggle"
      data-settings-user-location
    >
      <input
        type="checkbox"
        :checked="settings.showUserLocation"
        @change="
          emit('update-settings', {
            showUserLocation: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.display.showUserLocation") }}</strong>
        <small>{{ t("settings.display.showUserLocationDescription") }}</small>
      </div>
    </label>

    <label v-if="isSettingVisible('traffic.local-cache', 'traffic')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="settings.transferBundleLocalCacheEnabled"
        @change="
          emit('update-settings', {
            transferBundleLocalCacheEnabled: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.bundles.enableLocalCache") }}</strong>
        <small>{{ t("settings.display.transferLocalCacheDescription") }}</small>
      </div>
    </label>

    <label v-if="isSettingVisible('traffic.backend-cache', 'traffic')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="settings.transferBundleBackendCacheEnabled"
        @change="
          emit('update-settings', {
            transferBundleBackendCacheEnabled: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.bundles.enableBackendCache") }}</strong>
        <small>{{ t("settings.display.transferBackendCacheDescription") }}</small>
        <small
          v-if="!settings.transferBundleBackendCacheEnabled"
          class="settings-inline-warning"
          role="alert"
        >
          {{ t("settings.bundles.slowWarning") }}
        </small>
      </div>
    </label>

    <div v-if="isSettingVisible('traffic.expiration', 'traffic')" class="settings-row">
      <div>
        <strong>{{ t("settings.bundles.expiration") }}</strong>
        <span>{{ t("settings.display.transferExpirationDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="String(settings.transferBundleRetentionDays)"
        :options="transferBundleRetentionLocalizedOptions"
        :aria-label="t('settings.display.transferExpirationAria')"
        @update:model-value="emit('update-transfer-retention', $event)"
      />
    </div>

    <div v-if="isSettingVisible('traffic.loading', 'traffic')" class="settings-row">
      <div>
        <strong>{{ t("settings.bundles.loading") }}</strong>
        <span>{{ t("settings.display.transferLoadingDescription") }}</span>
      </div>
    </div>

    <div
      v-if="isSettingVisible('traffic.resolver', 'traffic')"
      class="settings-row"
      data-settings-transfer-resolver
    >
      <div>
        <strong>{{ t("settings.bundles.resolver") }}</strong>
        <span>{{ t("settings.display.transferResolverDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.transferResolverMode"
        :options="transferResolverModeLocalizedOptions"
        :aria-label="t('settings.display.transferResolverAria')"
        @update:model-value="emit('update-transfer-resolver-mode', $event)"
      />
    </div>

    <div v-if="isSettingVisible('traffic.concurrency', 'traffic')" class="settings-row">
      <div>
        <strong>{{ t("settings.bundles.concurrency") }}</strong>
        <span>{{ t("settings.display.transferConcurrencyDescription") }}</span>
        <small v-if="settings.transferBundleRequestConcurrency > 1" class="settings-inline-warning">
          {{ t("settings.display.transferConcurrencyWarning") }}
        </small>
      </div>
      <MaterialCombobox
        :model-value="String(settings.transferBundleRequestConcurrency)"
        :options="transferBundleRequestConcurrencyLocalizedOptions"
        :aria-label="t('settings.display.transferConcurrencyAria')"
        @update:model-value="emit('update-transfer-concurrency', $event)"
      />
    </div>

    <div v-if="isSettingVisible('traffic.spacing', 'traffic')" class="settings-row">
      <div>
        <strong>{{ t("settings.bundles.spacing") }}</strong>
        <span>{{ t("settings.display.transferSpacingDescription") }}</span>
        <small v-if="settings.transferBundleRequestSpacingMs > 0" class="settings-inline-warning">
          {{ t("settings.display.transferSpacingWarning") }}
        </small>
      </div>
      <MaterialCombobox
        :model-value="String(settings.transferBundleRequestSpacingMs)"
        :options="transferBundleRequestSpacingLocalizedOptions"
        :aria-label="t('settings.display.transferSpacingAria')"
        @update:model-value="emit('update-transfer-spacing', $event)"
      />
    </div>

    <div v-if="isSettingVisible('traffic.bundles', 'traffic')" class="settings-bundle-actions">
      <div>
        <strong>{{ t("settings.bundles.title") }}</strong>
        <span>{{ t("settings.display.transferCacheDescription") }}</span>
      </div>
      <div class="settings-bundle-actions__buttons">
        <button class="button-secondary" type="button" @click="emit('open-bundles')">
          {{ t("settings.bundles.view") }}
        </button>
        <button class="button-secondary" type="button" @click="emit('clear-bundles')">
          {{ t("settings.bundles.clear") }}
        </button>
      </div>
    </div>

    <div
      v-if="isSettingVisible('traffic.walking-cache', 'traffic')"
      class="settings-bundle-actions settings-walking-cache-actions"
    >
      <div>
        <strong>{{ t("settings.walkingCache.title") }}</strong>
        <span>{{ t("settings.walkingCache.description") }}</span>
      </div>
      <div class="settings-bundle-actions__buttons">
        <button
          data-settings-walking-cache-clear
          class="button-secondary"
          type="button"
          @click="emit('clear-walking-cache')"
        >
          {{ t("settings.walkingCache.clear") }}
        </button>
      </div>
    </div>
  </SettingsCategoryPanel>
</template>
