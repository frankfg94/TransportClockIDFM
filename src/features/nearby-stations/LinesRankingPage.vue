<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";
import { computed } from "vue";
import { useI18n } from "../../i18n";
import { useServiceQuality } from "./useServiceQuality";
import LinesRanking from "./LinesRanking.vue";

const { t } = useI18n();
const serviceQuality = useServiceQuality();
const data = computed(() => serviceQuality.data.value);
const loading = computed(() => serviceQuality.isLoading.value);
const error = computed(() => serviceQuality.error.value);
</script>

<template>
  <main class="lines-ranking-page">
    <div class="lines-ranking-page__shell">
      <NuxtLink class="lines-ranking-page__back" to="/nearby-neighborhood-score">
        <ArrowLeft :size="16" aria-hidden="true" />
        {{ t("nearbyStations.linesRanking.backToNeighborhood") }}
      </NuxtLink>
      <LinesRanking
        :data="data"
        :loading="loading"
        :error="error"
      />
    </div>
  </main>
</template>

<style scoped>
.lines-ranking-page { min-height: 100%; background: linear-gradient(180deg, #f4f6fb 0%, #eef1f7 100%); padding: 28px 18px 56px; }
.lines-ranking-page__shell { margin: 0 auto; max-width: 1440px; }
.lines-ranking-page__back { align-items: center; color: #5146ff; display: inline-flex; font-size: .78rem; font-weight: 850; gap: 6px; margin-bottom: 16px; text-decoration: none; }
.lines-ranking-page__back:hover, .lines-ranking-page__back:focus-visible { text-decoration: underline; text-underline-offset: 3px; }
</style>
