<script setup lang="ts">
import MaterialCombobox, {
  type MaterialComboboxOption,
} from "../../components/MaterialCombobox.vue";
import { useI18n } from "../../i18n";
import type { AppSettings } from "./appSettings";
import { TRAVEL_ALARM_SAFETY_MINUTES_MAX } from "./appSettings";
import SettingsCategoryPanel from "./SettingsCategoryPanel.vue";
import type { SettingsCategoryEmits, SettingsCategoryProps } from "./settingsCategoryContract";

type Settings = Pick<
  AppSettings,
  | "networkConcurrencyMode"
  | "wakeLockDuration"
  | "wakeDeviceOnAlarm"
  | "travelAlarmSafetyMinutes"
  | "navigationAutoHide"
>;

interface Props extends SettingsCategoryProps<Settings> {
  networkConcurrencyOptions: MaterialComboboxOption[];
  wakeLockLocalizedOptions: MaterialComboboxOption[];
  navigationAutoHideLocalizedOptions: MaterialComboboxOption[];
}

const {
  isSettingVisible,
  navigationAutoHideLocalizedOptions,
  networkConcurrencyOptions,
  panelOpen,
  settings,
  wakeLockLocalizedOptions,
} = defineProps<Props>();
const emit = defineEmits<
  SettingsCategoryEmits & {
    "update-auto-hide": [value: string];
    "update-network-concurrency-mode": [value: string];
    "update-travel-alarm-safety-minutes": [value: string];
    "update-wake-lock": [value: string];
  }
>();
const { t } = useI18n();
</script>

<template>
  <SettingsCategoryPanel
    title-id="settings-device-title"
    :eyebrow="t('settings.device.eyebrow')"
    :title="t('settings.device.title')"
    :panel-open="panelOpen"
    @toggle="emit('toggle')"
  >
    <div
      v-if="isSettingVisible('device.network', 'device')"
      class="settings-row"
      data-network-concurrency-setting
    >
      <div>
        <strong>{{ t("settings.network.title") }}</strong>
        <span>{{ t("settings.network.description") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.networkConcurrencyMode"
        :options="networkConcurrencyOptions"
        :aria-label="t('settings.network.title')"
        @update:model-value="emit('update-network-concurrency-mode', $event)"
      />
    </div>

    <div v-if="isSettingVisible('device.wake-lock', 'device')" class="settings-row">
      <div>
        <strong>{{ t("settings.device.wakeLock") }}</strong>
        <span>{{ t("settings.device.wakeLockDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.wakeLockDuration"
        :options="wakeLockLocalizedOptions"
        :aria-label="t('settings.device.wakeLockAria')"
        @update:model-value="emit('update-wake-lock', $event)"
      />
    </div>

    <label v-if="isSettingVisible('device.wake-alarm', 'device')" class="settings-toggle">
      <input
        type="checkbox"
        :checked="settings.wakeDeviceOnAlarm"
        @change="
          emit('update-settings', {
            wakeDeviceOnAlarm: ($event.target as HTMLInputElement).checked,
          })
        "
      />
      <span></span>
      <div>
        <strong>{{ t("settings.device.wakeDeviceOnAlarm") }}</strong>
        <small>{{ t("settings.device.wakeDeviceOnAlarmDescription") }}</small>
      </div>
    </label>

    <div v-if="isSettingVisible('device.travel-margin', 'device')" class="settings-row">
      <div>
        <strong>{{ t("settings.device.travelAlarmSafetyMinutes") }}</strong>
        <span>{{ t("settings.device.travelAlarmSafetyMinutesDescription") }}</span>
      </div>
      <label class="settings-number-control">
        <input
          class="settings-input"
          type="number"
          min="0"
          :max="TRAVEL_ALARM_SAFETY_MINUTES_MAX"
          step="1"
          :value="settings.travelAlarmSafetyMinutes"
          :aria-label="t('settings.device.travelAlarmSafetyMinutesAria')"
          @change="
            emit('update-travel-alarm-safety-minutes', ($event.target as HTMLInputElement).value)
          "
        />
        <span>{{ t("settings.device.minutesUnit") }}</span>
      </label>
    </div>

    <div v-if="isSettingVisible('device.auto-hide', 'device')" class="settings-row">
      <div>
        <strong>{{ t("settings.device.navigationAutoHide") }}</strong>
        <span>{{ t("settings.device.navigationAutoHideDescription") }}</span>
      </div>
      <MaterialCombobox
        :model-value="settings.navigationAutoHide"
        :options="navigationAutoHideLocalizedOptions"
        :aria-label="t('settings.device.navigationAutoHideAria')"
        @update:model-value="emit('update-auto-hide', $event)"
      />
    </div>
  </SettingsCategoryPanel>
</template>
