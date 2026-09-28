<script setup lang="ts">
import { CircleAlert } from "lucide-vue-next";
import type { Component } from "vue";
import { useI18n } from "../../i18n";
import type { GlobalMapManifest } from "../transport-map/contracts/manifest";
import { GLOBAL_TRANSPORT_PLAN_CONFIG } from "../transport-map/config/globalTransportPlanConfig";
import SettingsCategoryPanel from "./SettingsCategoryPanel.vue";
import type { SettingsCategoryBaseProps } from "./settingsCategoryContract";

type GlobalMapQualityLevel = "good" | "attention" | "limited" | "online";

interface GlobalMapQualityCard {
  id: string;
  icon: Component;
  level: GlobalMapQualityLevel;
  levelLabel: string;
  title: string;
  description: string;
  detail: string;
}

interface Props extends SettingsCategoryBaseProps {
  globalMapManifest?: GlobalMapManifest;
  globalMapManifestLoading: boolean;
  globalMapManifestError: string;
  dataQualityCards: GlobalMapQualityCard[];
  globalMapQualityStatusIcons: Record<GlobalMapQualityLevel, Component>;
  globalMapPackSummaryJson: string;
  globalMapPackFilesJson: string;
  globalMapPackWarningsJson: string;
  globalMapManifestJson: string;
  globalMapConfigJson: string;
  globalMapGeneratedAtLabel: string;
  globalMapPackBytesLabel: string;
}

const {
  dataQualityCards,
  globalMapConfigJson,
  globalMapGeneratedAtLabel,
  globalMapManifest,
  globalMapManifestError,
  globalMapManifestJson,
  globalMapManifestLoading,
  globalMapPackFilesJson,
  globalMapPackSummaryJson,
  globalMapPackWarningsJson,
  globalMapQualityStatusIcons,
  globalMapPackBytesLabel,
  panelOpen,
} = defineProps<Props>();
const emit = defineEmits<{ toggle: [] }>();
const { n, t } = useI18n();
</script>

<template>
  <SettingsCategoryPanel
    title-id="settings-global-map-data-title"
    panel-class="settings-panel--data"
    :eyebrow="t('settings.globalMapData.eyebrow')"
    :title="t('settings.globalMapData.title')"
    :panel-open="panelOpen"
    data-global-map-pack-settings
    @toggle="emit('toggle')"
  >
    <p class="settings-panel__description">{{ t("settings.globalMapData.description") }}</p>
    <article
      class="settings-data-overview"
      data-global-map-pack-overview
      aria-labelledby="settings-global-map-pack-overview-title"
    >
      <div class="settings-data-overview__header">
        <div>
          <p class="eyebrow">{{ t("settings.globalMapData.pack.eyebrow") }}</p>
          <h3 id="settings-global-map-pack-overview-title">
            {{ t("settings.globalMapData.pack.title") }}
          </h3>
          <p>{{ t("settings.globalMapData.pack.description") }}</p>
        </div>
        <span class="settings-data-overview__badge">
          {{ t("settings.globalMapData.quality.badge") }}
        </span>
      </div>

      <dl v-if="globalMapManifest?.counts" class="settings-data-facts">
        <div>
          <dt>{{ t("settings.globalMapData.pack.lines") }}</dt>
          <dd>{{ n(globalMapManifest.counts.lines) }}</dd>
        </div>
        <div>
          <dt>{{ t("settings.globalMapData.pack.stations") }}</dt>
          <dd>{{ n(globalMapManifest.counts.stations) }}</dd>
        </div>
        <div>
          <dt>{{ t("settings.globalMapData.pack.paths") }}</dt>
          <dd>{{ n(globalMapManifest.counts.paths) }}</dd>
        </div>
        <div>
          <dt>{{ t("settings.globalMapData.pack.chunks") }}</dt>
          <dd>{{ n(globalMapManifest.counts.chunks) }}</dd>
        </div>
      </dl>

      <div v-if="globalMapManifest" class="settings-data-overview__meta" data-global-map-pack-meta>
        <span>{{
          t("settings.globalMapData.pack.generated", {
            date: globalMapGeneratedAtLabel,
          })
        }}</span>
        <span>{{
          t("settings.globalMapData.pack.version", { version: globalMapManifest.dataVersion })
        }}</span>
        <span>{{
          t("settings.globalMapData.pack.size", {
            size: globalMapPackBytesLabel,
          })
        }}</span>
      </div>

      <section class="settings-data-quality" aria-labelledby="settings-global-map-quality-title">
        <div>
          <p class="eyebrow">{{ t("settings.globalMapData.quality.eyebrow") }}</p>
          <h3 id="settings-global-map-quality-title">
            {{ t("settings.globalMapData.quality.title") }}
          </h3>
          <p>{{ t("settings.globalMapData.quality.description") }}</p>
        </div>
        <div class="settings-data-quality__levels">
          <div class="settings-data-quality__level">
            <strong>{{ t("settings.globalMapData.quality.regional") }}</strong>
            <span>
              {{
                t("settings.globalMapData.quality.regionalDescription", {
                  tiles: n(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.maxTiles),
                })
              }}
            </span>
          </div>
          <div class="settings-data-quality__level settings-data-quality__level--detailed">
            <strong>{{ t("settings.globalMapData.quality.detailed") }}</strong>
            <span>
              {{
                t("settings.globalMapData.quality.detailedDescription", {
                  zoom: n(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.highZoomMin),
                  tiles: n(GLOBAL_TRANSPORT_PLAN_CONFIG.basemap.highZoomMaxTiles),
                })
              }}
            </span>
          </div>
        </div>
        <p class="settings-data-quality__note">
          {{ t("settings.globalMapData.quality.note") }}
        </p>
      </section>

      <div
        v-if="dataQualityCards.length"
        class="settings-data-quality-cards"
        data-global-map-quality-cards
      >
        <article
          v-for="card in dataQualityCards"
          :key="card.id"
          class="settings-data-quality-card"
          :class="`settings-data-quality-card--${card.level}`"
          :data-quality-card-id="card.id"
        >
          <div class="settings-data-quality-card__icon" aria-hidden="true">
            <component :is="card.icon" :size="20" />
          </div>
          <div>
            <div class="settings-data-quality-card__status">
              <component
                :is="globalMapQualityStatusIcons[card.level]"
                :size="15"
                aria-hidden="true"
              />
              <span>{{ card.levelLabel }}</span>
            </div>
            <h4>{{ card.title }}</h4>
            <p>{{ card.description }}</p>
            <small>{{ card.detail }}</small>
          </div>
        </article>
      </div>
    </article>
    <p v-if="globalMapManifestLoading" role="status">{{ t("settings.globalMapData.loading") }}</p>
    <p v-else-if="globalMapManifestError" class="settings-panel__error" role="alert">
      <CircleAlert :size="18" aria-hidden="true" />
      <span>{{ t("settings.globalMapData.loadFailed") }}: {{ globalMapManifestError }}</span>
    </p>
    <details class="settings-data-accordion" data-global-map-pack-summary>
      <summary>{{ t("settings.globalMapData.summaryAccordion") }}</summary>
      <pre v-if="globalMapPackSummaryJson">{{ globalMapPackSummaryJson }}</pre>
    </details>
    <details class="settings-data-accordion" data-global-map-pack-files>
      <summary>{{ t("settings.globalMapData.filesAccordion") }}</summary>
      <pre v-if="globalMapPackFilesJson">{{ globalMapPackFilesJson }}</pre>
    </details>
    <details class="settings-data-accordion" data-global-map-pack-warnings>
      <summary>{{ t("settings.globalMapData.warningsAccordion") }}</summary>
      <pre v-if="globalMapPackWarningsJson">{{ globalMapPackWarningsJson }}</pre>
    </details>
    <details class="settings-data-accordion" data-global-map-pack-manifest>
      <summary>{{ t("settings.globalMapData.rawManifestAccordion") }}</summary>
      <pre v-if="globalMapManifestJson">{{ globalMapManifestJson }}</pre>
    </details>
    <details class="settings-data-accordion" data-global-map-pack-config>
      <summary>{{ t("settings.globalMapData.configAccordion") }}</summary>
      <pre>{{ globalMapConfigJson }}</pre>
    </details>
  </SettingsCategoryPanel>
</template>
