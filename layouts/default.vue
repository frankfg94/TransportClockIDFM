<script setup lang="ts">
import {
  AppNavigation,
  AppSettingsRuntime,
} from "../src/features/app-settings";
</script>

<template>
  <AppSettingsRuntime />
  <slot />
  <AppNavigation />
</template>
