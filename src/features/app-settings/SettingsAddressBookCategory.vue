<script setup lang="ts">
import { BookOpen } from "lucide-vue-next";
import { useI18n } from "../../i18n";
import SettingsCategoryPanel from "./SettingsCategoryPanel.vue";
import type { SettingsCategoryBaseProps } from "./settingsCategoryContract";

defineProps<SettingsCategoryBaseProps>();
const emit = defineEmits<{
  toggle: [];
  "open-address-book": [];
}>();
const { t } = useI18n();
</script>

<template>
  <SettingsCategoryPanel
    title-id="settings-address-book-title"
    panel-class="settings-panel--address-book"
    :eyebrow="t('addressBook.eyebrow')"
    :title="t('addressBook.title')"
    :panel-open="panelOpen"
    data-settings-address-book
    @toggle="emit('toggle')"
  >
    <template #heading-actions>
      <button class="button-secondary" type="button" @click="emit('open-address-book')">
        <BookOpen :size="17" aria-hidden="true" />
        {{ t("addressBook.add") }}
      </button>
    </template>

    <div v-if="isSettingVisible('address-book.entry', 'address-book')" class="settings-row">
      <div>
        <strong>{{ t("addressBook.title") }}</strong>
        <span>{{ t("addressBook.description") }}</span>
      </div>
      <button class="button-secondary" type="button" @click="emit('open-address-book')">
        <BookOpen :size="17" aria-hidden="true" />
        {{ t("common.actions.showAll") }}
      </button>
    </div>
  </SettingsCategoryPanel>
</template>
