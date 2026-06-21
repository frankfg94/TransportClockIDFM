<script setup lang="ts">
import {
  AppNavigationMenu,
  AppSettingsRuntime,
} from "../src/features/app-settings";
</script>

<template>
  <AppSettingsRuntime />
  <slot />
  <AppNavigationMenu />
</template>
