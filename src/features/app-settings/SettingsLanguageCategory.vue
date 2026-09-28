<script setup lang="ts">
import MaterialCombobox, {
  type MaterialComboboxOption,
} from "../../components/MaterialCombobox.vue";
import { useI18n, type LanguagePreference } from "../../i18n";
import type { AppSettings } from "./appSettings";
import SettingsCategoryPanel from "./SettingsCategoryPanel.vue";
import type { SettingsCategoryEmits, SettingsCategoryProps } from "./settingsCategoryContract";

interface Props extends SettingsCategoryProps<Pick<AppSettings, "language">> {
  languageOptions: MaterialComboboxOption[];
}

const { settings, panelOpen, isSettingVisible, languageOptions } = defineProps<Props>();
const emit = defineEmits<SettingsCategoryEmits>();
const { t } = useI18n();
</script>

<template>
  <SettingsCategoryPanel
    title-id="settings-language-title"
    :eyebrow="t('settings.language.eyebrow')"
    :title="t('settings.language.title')"
    :panel-open="panelOpen"
    @toggle="emit('toggle')"
  >
    <div v-if="isSettingVisible('language', 'language')" class="settings-row">
      <div>
        <strong>{{ t("settings.language.label") }}</strong>
        <span>{{ t("settings.language.description") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.language"
        :options="languageOptions"
        :aria-label="t('settings.language.aria')"
        @update:model-value="emit('update-settings', { language: $event as LanguagePreference })"
      />
    </div>
  </SettingsCategoryPanel>
</template>
