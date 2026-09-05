<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, Search } from "lucide-vue-next";
import AppModal from "../../components/AppModal.vue";
import { useI18n } from "../../i18n";
import {
  loadGlobalMapMarkerIconOptions,
  type GlobalMapMarkerIconOption,
} from "../line-map/globalMapMarkerIcons";
import type { AddressBookMarkerIcon } from "./addressBook";

const props = defineProps<{
  open: boolean;
  selectedIcon?: AddressBookMarkerIcon;
}>();

const emit = defineEmits<{
  close: [];
  select: [icon: AddressBookMarkerIcon];
}>();

const { t } = useI18n();
const query = ref("");
const options = ref<GlobalMapMarkerIconOption[]>([]);
const loading = ref(false);
const loadError = ref(false);

const normalizedQuery = computed(() => query.value.trim().toLocaleLowerCase("en-US"));
const filteredOptions = computed(() => {
  if (!normalizedQuery.value) return options.value;
  return options.value.filter((option) => `${option.name} ${option.label}`
    .toLocaleLowerCase("en-US")
    .includes(normalizedQuery.value));
});

watch(
  () => props.open,
  (open) => {
    if (!open) {
      query.value = "";
      return;
    }
    void loadOptions();
  },
  { immediate: true },
);

async function loadOptions(): Promise<void> {
  loading.value = true;
  loadError.value = false;
  try {
    options.value = await loadGlobalMapMarkerIconOptions();
  } catch {
    options.value = [];
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

function selectIcon(option: GlobalMapMarkerIconOption): void {
  emit("select", option.name);
  emit("close");
}
</script>

<template>
  <AppModal
    :open="open"
    :title="t('addressBook.iconSelectorTitle')"
    :close-label="t('addressBook.iconSelectorClose')"
    panel-class="address-book-icon-selector-modal"
    @close="emit('close')"
  >
    <div class="address-book-icon-selector" :aria-busy="loading">
      <label class="address-book-icon-selector__search">
        <Search :size="17" aria-hidden="true" />
        <span class="sr-only">{{ t("addressBook.iconSearchLabel") }}</span>
        <input
          v-model="query"
          type="search"
          :placeholder="t('addressBook.iconSearchPlaceholder')"
          :aria-label="t('addressBook.iconSearchLabel')"
        />
      </label>

      <p v-if="loading" class="address-book-icon-selector__status" role="status">
        {{ t("addressBook.iconLoading") }}
      </p>
      <p v-else-if="loadError" class="address-book-icon-selector__status address-book-icon-selector__status--error" role="alert">
        {{ t("addressBook.iconLoadError") }}
      </p>
      <p v-else-if="filteredOptions.length === 0" class="address-book-icon-selector__status">
        {{ t("addressBook.iconNoResults") }}
      </p>
      <div
        v-else
        class="address-book-icon-selector__grid"
        role="radiogroup"
        :aria-label="t('addressBook.iconLabel')"
      >
        <button
          v-for="option in filteredOptions"
          :key="option.name"
          class="address-book-icon-selector__option"
          :class="{ 'address-book-icon-selector__option--selected': selectedIcon === option.name }"
          type="button"
          role="radio"
          :aria-checked="selectedIcon === option.name"
          :aria-label="option.label"
          @click="selectIcon(option)"
        >
          <component :is="option.component" :size="19" aria-hidden="true" />
          <span>{{ option.label }}</span>
          <Check v-if="selectedIcon === option.name" class="address-book-icon-selector__check" :size="14" aria-hidden="true" />
        </button>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
:global(.address-book-icon-selector-modal) { max-width: min(780px, calc(100vw - 28px)); min-width: 0; width: min(780px, calc(100vw - 28px)); }
.address-book-icon-selector { display: grid; gap: 12px; min-width: 0; }
.address-book-icon-selector__search { align-items: center; background: #fff; border: 1px solid rgba(15,23,42,.16); border-radius: 10px; color: #64748b; display: flex; gap: 8px; min-height: 42px; padding: 0 11px; }
.address-book-icon-selector__search:focus-within { border-color: #5146ff; box-shadow: 0 0 0 3px rgba(81,70,255,.12); }
.address-book-icon-selector__search input { border: 0; box-sizing: border-box; font: inherit; min-width: 0; outline: 0; width: 100%; }
.address-book-icon-selector__status { color: #64748b; font-size: .78rem; margin: 0; padding: 18px; text-align: center; }
.address-book-icon-selector__status--error { color: #b42318; }
.sr-only { clip: rect(0,0,0,0); height: 1px; margin: -1px; overflow: hidden; padding: 0; position: absolute; white-space: nowrap; width: 1px; }
.address-book-icon-selector__grid { display: grid; gap: 7px; grid-template-columns: repeat(auto-fit, minmax(92px, 1fr)); max-height: min(62vh, 580px); min-width: 0; overflow: auto; padding: 2px; }
.address-book-icon-selector__option { align-items: center; background: #f8f8ff; border: 1px solid rgba(81,70,255,.13); border-radius: 9px; color: #475569; cursor: pointer; display: grid; gap: 5px; justify-items: center; min-height: 72px; min-width: 0; padding: 7px 5px; position: relative; text-align: center; transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease, transform 140ms ease; }
.address-book-icon-selector__option:hover, .address-book-icon-selector__option:focus-visible, .address-book-icon-selector__option--selected { background: #eceaff; border-color: #5146ff; box-shadow: 0 5px 14px rgba(81,70,255,.16); color: #4034df; outline: 0; transform: translateY(-1px); }
.address-book-icon-selector__option span { font-size: .62rem; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
.address-book-icon-selector__check { position: absolute; right: 5px; top: 5px; }
@media (max-width: 420px) {
  .address-book-icon-selector__grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
</style>
