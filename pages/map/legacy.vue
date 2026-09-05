<template>
  <GlobalTransportPlan
    experience="legacy"
    :basemap-contrast="settings.globalMapBasemapContrast"
    :basemap-style="settings.globalMapBasemapStyle"
  />
</template>

<script setup lang="ts">
import GlobalTransportPlan from "../../src/features/line-map/GlobalTransportPlan.vue";
import { useAppSettings } from "../../src/features/app-settings";

const { settings } = useAppSettings();
</script>
