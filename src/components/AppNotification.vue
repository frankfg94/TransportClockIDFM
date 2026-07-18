<script setup lang="ts">
export type AppNotificationTone = "success" | "info" | "error";

withDefaults(
  defineProps<{
    message: string;
    tone?: AppNotificationTone;
  }>(),
  {
    tone: "info",
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="app-notification">
      <aside
        v-if="message"
        class="app-notification"
        :class="'app-notification--' + tone"
        :role="tone === 'error' ? 'alert' : 'status'"
        :aria-live="tone === 'error' ? 'assertive' : 'polite'"
      >
        {{ message }}
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-notification {
  --notification-accent: #2563eb;
  background: #ffffff;
  border: 1px solid color-mix(in srgb, var(--notification-accent) 24%, transparent);
  border-left: 4px solid var(--notification-accent);
  border-radius: 10px;
  bottom: 24px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.24);
  color: #0f172a;
  font-weight: 850;
  max-width: min(420px, calc(100vw - 32px));
  padding: 14px 16px;
  position: fixed;
  right: 24px;
  z-index: 11000;
}
.app-notification--success { --notification-accent: #15803d; }
.app-notification--error { --notification-accent: #dc2626; }
.app-notification-enter-active,
.app-notification-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}
.app-notification-enter-from,
.app-notification-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
@media (max-width: 640px) {
  .app-notification { bottom: 16px; left: 16px; right: 16px; }
}
</style>
