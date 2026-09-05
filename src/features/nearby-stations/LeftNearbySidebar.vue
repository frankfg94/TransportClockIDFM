<script setup lang="ts">
import { Route, X } from "lucide-vue-next";
import { useI18n } from "../../i18n";
defineEmits<{ close: [] }>();
const { t } = useI18n();
</script>

<template>
  <section class="left-nearby-sidebar" :aria-label="t('nearbyStations.travel.title')">
    <header>
      <span><Route :size="18" aria-hidden="true" />{{ t("nearbyStations.travel.title") }}</span>
      <div class="left-nearby-sidebar__actions">
        <slot name="actions" />
        <button type="button" :aria-label="t('common.actions.close')" @click="$emit('close')"><X :size="18" /></button>
      </div>
    </header>
    <div class="left-nearby-sidebar__body"><slot /></div>
  </section>
</template>

<style scoped>
.left-nearby-sidebar { background: rgba(255,255,255,.98); border: 1px solid rgba(81,70,255,.16); border-radius: 14px; box-shadow: 0 14px 40px rgba(15,23,42,.22); display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.left-nearby-sidebar > header { align-items: center; border-bottom: 1px solid rgba(15,23,42,.1); display: flex; justify-content: space-between; min-height: 52px; padding: 8px 12px 8px 16px; }
.left-nearby-sidebar > header span { align-items: center; color: #18233f; display: inline-flex; font-size: .9rem; font-weight: 900; gap: 8px; }
.left-nearby-sidebar > header svg { color: #5146ff; }
.left-nearby-sidebar > header button { align-items: center; background: #f1f2f8; border: 1px solid rgba(24,35,63,.12); border-radius: 8px; color: #18233f; display: flex; height: 34px; justify-content: center; width: 34px; }
.left-nearby-sidebar > header button svg { flex: 0 0 18px; height: 18px; min-width: 18px; width: 18px; }
.left-nearby-sidebar > header button:hover { background: #efeeff; }
.left-nearby-sidebar__actions { align-items: center; display: inline-flex; gap: 6px; }
.left-nearby-sidebar__body { display: flex; flex: 1 1 auto; min-height: 0; overflow: hidden; }
</style>
