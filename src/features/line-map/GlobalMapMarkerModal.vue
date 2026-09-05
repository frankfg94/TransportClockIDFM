<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppModal from "../../components/AppModal.vue";
import { useI18n } from "../../i18n";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import { resolveGlobalMapMarkerIcon } from "./globalMapMarkerIcons";
import {
  DEFAULT_GLOBAL_MAP_MARKER_COLOR,
  GLOBAL_MAP_MARKER_ICONS,
  type GlobalMapMarker,
  type GlobalMapMarkerIcon,
} from "./globalMapMarkers";
import GlobalMapMarkerAddressField from "./GlobalMapMarkerAddressField.vue";

const props = withDefaults(defineProps<{
  open: boolean;
  initial?: Pick<GlobalMapMarker, "lon" | "lat"> & Partial<Pick<GlobalMapMarker, "id" | "name" | "address" | "icon" | "color">>;
  editing?: boolean;
}>(), {
  editing: false,
});

const emit = defineEmits<{
  close: [];
  save: [marker: GlobalMapMarker];
  remove: [id: string];
}>();

const { t } = useI18n();
const name = ref("");
const address = ref("");
const icon = ref<GlobalMapMarkerIcon>("pin");
const color = ref(DEFAULT_GLOBAL_MAP_MARKER_COLOR);
const originalAddress = ref("");
const resolvedAddressPoint = ref<GeocoderPoint>();
const addressField = ref<{ resolveAddress: () => Promise<GeocoderPoint | undefined> }>();
const confirmingDelete = ref(false);

const markerCoordinates = computed(() => resolvedAddressPoint.value ?? props.initial);

watch(
  () => [props.open, props.initial] as const,
  () => {
    if (!props.open) return;
    name.value = props.initial?.name ?? "";
    address.value = props.initial?.address ?? "";
    originalAddress.value = props.initial?.address?.trim() ?? "";
    resolvedAddressPoint.value = undefined;
    icon.value = props.initial?.icon ?? "pin";
    color.value = props.initial?.color ?? DEFAULT_GLOBAL_MAP_MARKER_COLOR;
    confirmingDelete.value = false;
  },
  { immediate: true, deep: true },
);

async function save(): Promise<void> {
  const markerName = name.value.trim();
  const initialLon = props.initial?.lon;
  const initialLat = props.initial?.lat;
  if (!markerName || initialLon === undefined || initialLat === undefined) return;

  let lon = initialLon;
  let lat = initialLat;
  const nextAddress = address.value.trim();
  if (nextAddress && normalizeAddress(nextAddress) !== normalizeAddress(originalAddress.value)) {
    const point = resolvedAddressPoint.value ?? await addressField.value?.resolveAddress();
    if (!point) return;
    lon = point.lon;
    lat = point.lat;
  }

  emit("save", {
    id: props.initial?.id ?? "",
    name: markerName,
    ...(nextAddress ? { address: nextAddress } : {}),
    lon,
    lat,
    icon: icon.value,
    color: color.value,
  });
}

function normalizeAddress(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

function handleResolvedAddress(value: string): void {
  // Reverse geocoding only gives the clicked point a readable label. It is
  // therefore the new baseline and must not move the marker on save.
  originalAddress.value = value.trim();
}

function handleAddressPoint(point: GeocoderPoint | undefined): void {
  resolvedAddressPoint.value = point;
}

function requestDelete(): void {
  if (!props.initial?.id) return;
  if (!confirmingDelete.value) {
    confirmingDelete.value = true;
    return;
  }
  emit("remove", props.initial.id);
}
</script>

<template>
  <AppModal
    :open="open"
    :title="editing ? t('globalMap.markers.editTitle') : t('globalMap.markers.addTitle')"
    :close-label="t('common.actions.close')"
    panel-class="global-map-marker-modal"
    @close="emit('close')"
  >
    <form id="global-map-marker-form" class="global-map-marker-form" @submit.prevent="save">
      <label>
        <span>{{ t("globalMap.markers.nameLabel") }}</span>
        <input v-model="name" required maxlength="120" :placeholder="t('globalMap.markers.namePlaceholder')" />
      </label>
      <GlobalMapMarkerAddressField
        ref="addressField"
        :open="open"
        :point="initial"
        :address="address"
        :label="t('globalMap.markers.addressLabel')"
        :placeholder="t('globalMap.markers.addressPlaceholder')"
        @update:address="address = $event"
        @update:point="handleAddressPoint"
        @resolved-address="handleResolvedAddress"
      />
      <fieldset>
        <legend>{{ t("globalMap.markers.iconLabel") }}</legend>
        <div class="global-map-marker-form__icons" role="radiogroup" :aria-label="t('globalMap.markers.iconLabel')">
          <label v-for="markerIcon in GLOBAL_MAP_MARKER_ICONS" :key="markerIcon" class="global-map-marker-form__icon-option">
            <input v-model="icon" type="radio" :value="markerIcon" />
            <component :is="resolveGlobalMapMarkerIcon(markerIcon)" :size="18" aria-hidden="true" />
            <span>{{ t(`globalMap.markers.icons.${markerIcon}` as never) }}</span>
          </label>
        </div>
      </fieldset>
      <label class="global-map-marker-form__color">
        <span>{{ t("globalMap.markers.colorLabel") }}</span>
        <span class="global-map-marker-form__color-control">
          <input v-model="color" type="color" :aria-label="t('globalMap.markers.colorLabel')" />
          <code>{{ color }}</code>
        </span>
      </label>
      <p v-if="initial" class="global-map-marker-form__coordinates">
        {{ t("globalMap.markers.coordinates", { lat: markerCoordinates?.lat.toFixed(5), lon: markerCoordinates?.lon.toFixed(5) }) }}
      </p>
      <div v-if="confirmingDelete" class="global-map-marker-form__confirm" role="alert">
        <strong>{{ t("globalMap.markers.deleteConfirmTitle") }}</strong>
        <span>{{ t("globalMap.markers.deleteConfirmBody") }}</span>
      </div>
    </form>

    <template #footer>
      <button
        v-if="editing"
        class="button-secondary global-map-marker-form__delete"
        type="button"
        @click="requestDelete"
      >
        {{ confirmingDelete ? t("globalMap.markers.deleteConfirm") : t("globalMap.markers.delete") }}
      </button>
      <button v-if="confirmingDelete" class="button-secondary" type="button" @click="confirmingDelete = false">
        {{ t("common.actions.cancel") }}
      </button>
      <button class="button-secondary" type="button" @click="emit('close')">
        {{ t("common.actions.cancel") }}
      </button>
      <button type="submit" form="global-map-marker-form">
        {{ t("common.actions.confirm") }}
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.global-map-marker-modal { min-width: 0; }
.global-map-marker-form { box-sizing: border-box; display: grid; gap: 16px; min-width: 0; width: 100%; }
.global-map-marker-form > label { display: grid; gap: 6px; }
.global-map-marker-form label > span, .global-map-marker-form legend { color: #475569; font-size: .76rem; font-weight: 850; }
.global-map-marker-form fieldset { min-width: 0; }
.global-map-marker-form input:not([type="radio"]) { box-sizing: border-box; border: 1px solid rgba(15,23,42,.16); border-radius: 9px; font: inherit; min-height: 42px; max-width: 100%; padding: 8px 10px; width: 100%; }
.global-map-marker-form input:not([type="radio"]):focus { border-color: #5146ff; box-shadow: 0 0 0 3px rgba(81,70,255,.12); outline: 0; }
.global-map-marker-form fieldset { border: 0; display: grid; gap: 8px; margin: 0; padding: 0; }
.global-map-marker-form__icons { display: grid; gap: 7px; grid-template-columns: repeat(auto-fit, minmax(min(88px, 100%), 1fr)); min-width: 0; }
.global-map-marker-form__icon-option { align-items: center; background: #f8f8ff; border: 1px solid rgba(81,70,255,.14); border-radius: 9px; color: #475569; cursor: pointer; display: grid; gap: 5px; justify-items: center; min-height: 66px; min-width: 0; padding: 6px; text-align: center; transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease, transform 140ms ease; }
.global-map-marker-form__icon-option:has(input:checked) { background: #eceaff; border-color: #5146ff; color: #4034df; }
.global-map-marker-form__icon-option:hover, .global-map-marker-form__icon-option:focus-within { background: #efeeff; border-color: #5146ff; box-shadow: 0 5px 14px rgba(81,70,255,.16); color: #4034df; transform: translateY(-1px); }
.global-map-marker-form__icon-option input { position: absolute; opacity: 0; }
.global-map-marker-form__color { display: grid; gap: 6px; }
.global-map-marker-form__color-control { align-items: center; display: flex; gap: 8px; }
.global-map-marker-form__color-control input[type="color"] { background: #fff; border: 1px solid rgba(15,23,42,.16); border-radius: 8px; cursor: pointer; height: 36px; min-height: 36px; padding: 3px; width: 54px; }
.global-map-marker-form__color-control code { color: #64748b; font-size: .72rem; }
.global-map-marker-form__icon-option span { font-size: .62rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
.global-map-marker-form__coordinates { color: #64748b; font-size: .74rem; margin: 0; overflow-wrap: anywhere; }
.global-map-marker-form__confirm { background: #fff5f4; border: 1px solid rgba(180,35,24,.18); border-radius: 9px; color: #8f1c14; display: grid; gap: 4px; min-width: 0; padding: 10px; }
.global-map-marker-form__confirm span { font-size: .78rem; }
.global-map-marker-form__delete { color: #b42318; margin-right: auto; }
:global(.global-map-marker-modal .app-modal__body) { min-width: 0; overflow-x: hidden; }
:global(.global-map-marker-modal .modal-panel__header) { min-width: 0; }
:global(.global-map-marker-modal .modal-panel__header > div) { min-width: 0; }
:global(.global-map-marker-modal .modal-panel__header h2) { overflow-wrap: anywhere; }
@media (max-width: 560px) {
  :global(.global-map-marker-modal .modal-panel__footer) { align-items: stretch; flex-wrap: wrap; gap: 8px; justify-content: flex-start; }
  :global(.global-map-marker-modal .modal-panel__footer) > button { flex: 1 1 auto; min-width: 0; }
  :global(.global-map-marker-modal .modal-panel__footer) > .global-map-marker-form__delete { flex-basis: 100%; margin-right: 0; }
}
@media (max-width: 360px) {
  .global-map-marker-form__icons { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  :global(.global-map-marker-modal .modal-panel__footer) > button { flex-basis: 100%; }
}
</style>
