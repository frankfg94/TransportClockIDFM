<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from "vue";
import { useAppSettings } from "./appSettings";
import { requestScreenWakeLock } from "./screenWakeLock";

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
}

const { settings } = useAppSettings();

let wakeLock: WakeLockSentinelLike | undefined;
let wakeLockTimer: number | undefined;

onMounted(() => {
  document.addEventListener("visibilitychange", handleVisibilityChange);
  void syncWakeLock();
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  void releaseWakeLock();
});

watch(
  () => settings.value.wakeLockDuration,
  () => {
    void syncWakeLock();
  },
);

async function handleVisibilityChange(): Promise<void> {
  if (document.visibilityState === "visible") {
    await syncWakeLock();
  }
}

async function syncWakeLock(): Promise<void> {
  await releaseWakeLock();

  const duration = settings.value.wakeLockDuration;

  if (duration === "none" || document.visibilityState !== "visible") {
    return;
  }

  wakeLock = await requestScreenWakeLock();

  if (!wakeLock || duration === "unlimited") {
    return;
  }

  const durationMsBySetting = {
    "1m": 60_000,
    "30m": 30 * 60_000,
    "1h": 60 * 60_000,
    "3h": 3 * 60 * 60_000,
    "24h": 24 * 60 * 60_000,
  } as const;

  wakeLockTimer = window.setTimeout(() => {
    void releaseWakeLock();
  }, durationMsBySetting[duration]);
}

async function releaseWakeLock(): Promise<void> {
  if (wakeLockTimer) {
    window.clearTimeout(wakeLockTimer);
    wakeLockTimer = undefined;
  }

  if (wakeLock && !wakeLock.released) {
    await wakeLock.release().catch(() => undefined);
  }

  wakeLock = undefined;
}
</script>

<template>
  <span class="app-settings-runtime" aria-hidden="true"></span>
</template>
