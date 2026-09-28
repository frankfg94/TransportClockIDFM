<script setup lang="ts">
import MaterialCombobox, {
  type MaterialComboboxOption,
} from "../../components/MaterialCombobox.vue";
import { useI18n } from "../../i18n";
import type { AppSettings } from "./appSettings";
import SettingsCategoryPanel from "./SettingsCategoryPanel.vue";
import type { SettingsCategoryEmits, SettingsCategoryProps } from "./settingsCategoryContract";

type Settings = Pick<AppSettings, "placePresetNavigationMode">;

interface Props extends SettingsCategoryProps<Settings> {
  defaultPlaceId: string;
  placeOptions: MaterialComboboxOption[];
  placePresetNavigationModeLocalizedOptions: MaterialComboboxOption[];
}

const {
  defaultPlaceId,
  isSettingVisible,
  panelOpen,
  placeOptions,
  placePresetNavigationModeLocalizedOptions,
  settings,
} = defineProps<Props>();
const emit = defineEmits<
  SettingsCategoryEmits & {
    "manage-places": [];
    "update-default-place": [placeId: string];
    "update-place-navigation": [value: string];
  }
>();
const { t } = useI18n();
</script>

<template>
  <SettingsCategoryPanel
    title-id="settings-places-title"
    :eyebrow="t('settings.places.eyebrow')"
    :title="t('settings.places.title')"
    :panel-open="panelOpen"
    @toggle="emit('toggle')"
  >
    <template #heading-actions>
      <button class="button-secondary" type="button" @click="emit('manage-places')">
        {{ t("settings.places.manage") }}
      </button>
    </template>

    <div v-if="isSettingVisible('places.default', 'places')" class="settings-row">
      <div>
        <strong>{{ t("settings.places.defaultLabel") }}</strong>
        <span>{{ t("settings.places.defaultDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="defaultPlaceId"
        :options="placeOptions"
        :aria-label="t('settings.places.defaultAria')"
        @update:model-value="emit('update-default-place', $event)"
      />
    </div>

    <div v-if="isSettingVisible('places.navigation', 'places')" class="settings-row">
      <div>
        <strong>{{ t("settings.places.navigationLabel") }}</strong>
        <span>{{ t("settings.places.navigationDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.placePresetNavigationMode"
        :options="placePresetNavigationModeLocalizedOptions"
        :aria-label="t('settings.places.navigationAria')"
        @update:model-value="emit('update-place-navigation', $event)"
      />
    </div>
  </SettingsCategoryPanel>
</template>
