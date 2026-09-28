<script setup lang="ts">
import { useI18n } from "../../i18n";
import type { AppSettings } from "./appSettings";
import SettingsCategoryPanel from "./SettingsCategoryPanel.vue";
import type { SettingsCategoryEmits, SettingsCategoryProps } from "./settingsCategoryContract";

type Settings = Pick<AppSettings, "showPlanInNavigation">;

const { settings, panelOpen, isSettingVisible } = defineProps<SettingsCategoryProps<Settings>>();
const emit = defineEmits<SettingsCategoryEmits>();
const { t } = useI18n();
</script>

<template>
  <SettingsCategoryPanel
    title-id="settings-menu-title"
    :eyebrow="t('settings.menu.eyebrow')"
    :title="t('settings.menu.title')"
    :panel-open="panelOpen"
    @toggle="emit('toggle')"
  >
    <label v-if="isSettingVisible('menu.show-plan', 'menu')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="settings.showPlanInNavigation"
        :aria-label="t('settings.menu.showPlanAria')"
        @change="
          emit('update-settings', {
            showPlanInNavigation: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.menu.showPlan") }}</strong>
        <small>{{ t("settings.menu.showPlanDescription") }}</small>
      </div>
    </label>
  </SettingsCategoryPanel>
</template>
