<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  Check,
  Eye,
  EyeOff,
  Map as MapIcon,
  MapPin,
  Pencil,
  Plus,
  Route,
  Star,
  Trash2,
} from "lucide-vue-next";
import AppModal from "../../components/AppModal.vue";
import { useI18n } from "../../i18n";
import type { GeocoderPoint } from "../transport-map/contracts/geocoder";
import GlobalMapMarkerAddressField from "../line-map/GlobalMapMarkerAddressField.vue";
import IconSelectorModal from "./IconSelectorModal.vue";
import {
  humanizeGlobalMapMarkerIconName,
  resolveGlobalMapMarkerIcon,
} from "../line-map/globalMapMarkerIcons";
import {
  ADDRESS_BOOK_MARKER_ICONS,
  DEFAULT_ADDRESS_BOOK_MARKER_COLOR,
  createAddressBookEntryId,
  normalizeAddressBookColor,
  normalizeAddressBookMarkerIcon,
  useAddressBook,
  type AddressBookEntry,
  type AddressBookEntryKind,
  type AddressBookMarkerIcon,
} from "./addressBook";

export interface AddressBookInitialEntry {
  id?: string;
  kind?: AddressBookEntryKind;
  name?: string;
  address?: string;
  city?: string;
  postcode?: string;
  lon?: number;
  lat?: number;
  icon?: AddressBookMarkerIcon;
  color?: string;
  isPrimary?: boolean;
  isHidden?: boolean;
}

const props = withDefaults(defineProps<{
  open: boolean;
  initial?: AddressBookInitialEntry;
  selectionMode?: boolean;
}>(), {
  initial: undefined,
  selectionMode: false,
});

const emit = defineEmits<{
  close: [];
  select: [entry: AddressBookEntry];
  "view-location": [entry: AddressBookEntry];
  "view-neighborhood": [entry: AddressBookEntry];
}>();

const { t } = useI18n();
// The component owns only presentation/form draft state. Storage, migration,
// normalization and mutations stay in the shared composable below.
const addressBook = useAddressBook();
const entries = computed(() => [...addressBook.entries.value].sort(compareEntries));
const editorOpen = ref(false);
const draftId = ref<string>();
const draftKind = ref<AddressBookEntryKind>("address");
const draftName = ref("");
const draftAddress = ref("");
const draftCity = ref("");
const draftPostcode = ref("");
const draftLon = ref<number>();
const draftLat = ref<number>();
const draftIcon = ref<AddressBookMarkerIcon>("pin");
const draftColor = ref(DEFAULT_ADDRESS_BOOK_MARKER_COLOR);
const draftPrimary = ref(false);
const draftHidden = ref(false);
const iconSelectorOpen = ref(false);
const originalAddress = ref("");
const resolvedPoint = ref<GeocoderPoint>();
const formError = ref("");
const confirmingDeleteId = ref<string>();
const addressField = ref<{ resolveAddress: () => Promise<GeocoderPoint | undefined> }>();

const draftPoint = computed(() => {
  if (draftLon.value === undefined || draftLat.value === undefined) return undefined;
  return { lon: draftLon.value, lat: draftLat.value };
});
const editorTitle = computed(() => draftId.value
  ? t("addressBook.editTitle")
  : t("addressBook.addTitle"));
const selectedExtendedIcon = computed(() => isQuickIcon(draftIcon.value) ? undefined : draftIcon.value);
const selectedExtendedIconLabel = computed(() => selectedExtendedIcon.value
  ? humanizeGlobalMapMarkerIconName(selectedExtendedIcon.value)
  : "");

watch(
  () => [props.open, props.initial] as const,
  ([open, initial]) => {
    if (!open) return;
    confirmingDeleteId.value = undefined;
    if (initial) {
      openEditor(initial);
    } else {
      editorOpen.value = false;
    }
  },
  { immediate: true, deep: true },
);

function compareEntries(left: AddressBookEntry, right: AddressBookEntry): number {
  return Number(Boolean(right.isPrimary)) - Number(Boolean(left.isPrimary))
    || left.name.localeCompare(right.name, "fr-FR", { numeric: true })
    || left.id.localeCompare(right.id, "fr-FR");
}

function entrySubtitle(entry: AddressBookEntry): string {
  return entry.address
    || [entry.city, entry.postcode].filter(Boolean).join(" ")
    || `${entry.lat.toFixed(5)}, ${entry.lon.toFixed(5)}`;
}

function entryKindLabel(entry: AddressBookEntry): string {
  return entry.kind === "address"
    ? t("addressBook.addressType")
    : t("addressBook.markerType");
}

function isQuickIcon(icon: AddressBookMarkerIcon): boolean {
  return (ADDRESS_BOOK_MARKER_ICONS as readonly string[]).includes(icon);
}

function openCreate(): void {
  openEditor({ kind: "address", icon: "pin" });
}

function openEdit(entry: AddressBookEntry): void {
  openEditor(entry);
}

function openEditor(initial: AddressBookInitialEntry): void {
  draftId.value = initial.id;
  draftKind.value = initial.kind === "marker" ? "marker" : "address";
  draftName.value = initial.name?.trim() ?? "";
  draftAddress.value = initial.address?.trim() ?? "";
  draftCity.value = initial.city?.trim() ?? "";
  draftPostcode.value = initial.postcode?.trim() ?? "";
  draftLon.value = Number.isFinite(initial.lon) ? initial.lon : undefined;
  draftLat.value = Number.isFinite(initial.lat) ? initial.lat : undefined;
  draftIcon.value = normalizeAddressBookMarkerIcon(initial.icon);
  draftColor.value = normalizeAddressBookColor(initial.color) ?? DEFAULT_ADDRESS_BOOK_MARKER_COLOR;
  draftPrimary.value = initial.kind !== "marker" && initial.isPrimary === true;
  draftHidden.value = initial.isHidden === true;
  iconSelectorOpen.value = false;
  originalAddress.value = draftAddress.value;
  resolvedPoint.value = draftPoint.value
    ? {
        lon: draftPoint.value.lon,
        lat: draftPoint.value.lat,
        label: draftAddress.value || draftName.value,
        address: draftAddress.value || undefined,
        city: draftCity.value || undefined,
        postcode: draftPostcode.value || undefined,
        provider: "address-book",
        type: "address",
      }
    : undefined;
  formError.value = "";
  confirmingDeleteId.value = undefined;
  editorOpen.value = true;
}

function closeEditor(): void {
  editorOpen.value = false;
  iconSelectorOpen.value = false;
  formError.value = "";
  confirmingDeleteId.value = undefined;
}

function handleAddressPoint(point: GeocoderPoint | undefined): void {
  resolvedPoint.value = point;
  if (!point) return;
  draftLon.value = point.lon;
  draftLat.value = point.lat;
  draftCity.value = point.city ?? draftCity.value;
  draftPostcode.value = point.postcode ?? draftPostcode.value;
}

function handleResolvedAddress(value: string): void {
  originalAddress.value = value.trim();
}

function normalizedAddress(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

async function saveDraft(): Promise<void> {
  formError.value = "";
  const name = draftName.value.trim();
  if (!name) {
    formError.value = t("addressBook.nameRequired");
    return;
  }

  let point = resolvedPoint.value;
  if (
    !point &&
    draftLon.value !== undefined &&
    draftLat.value !== undefined &&
    normalizedAddress(draftAddress.value) === normalizedAddress(originalAddress.value)
  ) {
    point = { lon: draftLon.value, lat: draftLat.value };
  }
  if (!point) point = await addressField.value?.resolveAddress();
  if (!point) {
    formError.value = t("addressBook.locationRequired");
    return;
  }

  const address = draftAddress.value.trim() || point.address?.trim() || point.label?.trim();
  const entry: AddressBookEntry = {
    id: draftId.value ?? createAddressBookEntryId(),
    kind: draftKind.value,
    name,
    ...(address ? { address } : {}),
    ...(draftCity.value.trim() ? { city: draftCity.value.trim() } : point.city ? { city: point.city } : {}),
    ...(draftPostcode.value.trim() ? { postcode: draftPostcode.value.trim() } : point.postcode ? { postcode: point.postcode } : {}),
    lon: point.lon,
    lat: point.lat,
    icon: draftIcon.value,
    color: draftColor.value,
    ...(draftKind.value === "address" && draftPrimary.value ? { isPrimary: true } : {}),
    ...(draftHidden.value ? { isHidden: true } : {}),
  };

  const saved = draftId.value
    ? addressBook.updateEntry(entry)
    : Boolean(addressBook.addEntry(entry));
  if (!saved) {
    formError.value = t("addressBook.saveFailed");
    return;
  }
  closeEditor();
}

function requestDelete(entry: AddressBookEntry): void {
  if (confirmingDeleteId.value !== entry.id) {
    confirmingDeleteId.value = entry.id;
    return;
  }
  addressBook.removeEntry(entry.id);
  confirmingDeleteId.value = undefined;
  if (draftId.value === entry.id) closeEditor();
}

function setPrimary(entry: AddressBookEntry): void {
  if (entry.kind === "address") addressBook.setPrimary(entry.id);
}

function selectIcon(icon: AddressBookMarkerIcon): void {
  draftIcon.value = icon;
  iconSelectorOpen.value = false;
}

function viewLocation(entry: AddressBookEntry): void {
  emit("view-location", entry);
  emit("close");
}

function selectEntry(entry: AddressBookEntry): void {
  if (!props.selectionMode || entry.kind !== "address") return;
  emit("select", entry);
  emit("close");
}

function viewNeighborhood(entry: AddressBookEntry): void {
  emit("view-neighborhood", entry);
  emit("close");
}

</script>

<template>
  <AppModal
    :open="open"
    :title="editorOpen ? editorTitle : selectionMode ? t('addressBook.selectionTitle') : t('addressBook.title')"
    :eyebrow="t('addressBook.eyebrow')"
    panel-class="address-book-modal"
    :close-label="t('common.actions.close')"
    @close="emit('close')"
  >
    <template v-if="!editorOpen">
      <div class="address-book-modal__intro">
        <p>{{ selectionMode ? t("addressBook.selectionDescription") : t("addressBook.description") }}</p>
        <button type="button" @click="openCreate">
          <Plus :size="17" aria-hidden="true" />
          {{ t("addressBook.add") }}
        </button>
      </div>

      <p v-if="entries.length === 0" class="address-book-modal__empty">
        {{ t("addressBook.empty") }}
      </p>
      <div v-else class="address-book-modal__list" role="list" :aria-label="t('addressBook.title')">
        <article v-for="entry in entries" :key="entry.id" class="address-book-entry" role="listitem">
          <div
            class="address-book-entry__icon"
            :class="{ 'address-book-entry__icon--primary': entry.isPrimary }"
            :style="{ '--address-book-entry-color': entry.color ?? DEFAULT_ADDRESS_BOOK_MARKER_COLOR }"
          >
            <component :is="resolveGlobalMapMarkerIcon(entry.icon)" :size="19" aria-hidden="true" />
          </div>
          <div class="address-book-entry__content">
            <div class="address-book-entry__title">
              <strong>{{ entry.name }}</strong>
              <span v-if="entry.isPrimary" class="address-book-entry__primary">
                <Star :size="12" fill="currentColor" aria-hidden="true" />
                {{ t("addressBook.primary") }}
              </span>
              <span v-if="entry.isHidden" class="address-book-entry__hidden">
                <EyeOff :size="12" aria-hidden="true" />
                {{ t("addressBook.hidden") }}
              </span>
            </div>
            <span class="address-book-entry__subtitle">{{ entrySubtitle(entry) }}</span>
            <small>{{ entryKindLabel(entry) }}</small>
          </div>
          <div class="address-book-entry__actions">
            <button
              v-if="selectionMode && entry.kind === 'address'"
              class="address-book-entry__select"
              type="button"
              :aria-label="t('addressBook.selectForUseAria', { name: entry.name })"
              @click="selectEntry(entry)"
            >
              <Check :size="16" aria-hidden="true" />
              <span>{{ t("addressBook.selectForUse") }}</span>
            </button>
            <button
              type="button"
              :aria-label="t('addressBook.viewLocationAria', { name: entry.name })"
              :title="t('addressBook.viewLocation')"
              @click="viewLocation(entry)"
            >
              <Eye :size="16" aria-hidden="true" />
            </button>
            <button
              type="button"
              :aria-label="t('addressBook.viewNeighborhoodAria', { name: entry.name })"
              :title="t('addressBook.viewNeighborhood')"
              @click="viewNeighborhood(entry)"
            >
              <MapIcon :size="16" aria-hidden="true" />
            </button>
            <button
              v-if="entry.kind === 'address' && !entry.isPrimary"
              type="button"
              :aria-label="t('addressBook.setPrimaryAria', { name: entry.name })"
              :title="t('addressBook.setPrimary')"
              @click="setPrimary(entry)"
            >
              <Star :size="16" aria-hidden="true" />
            </button>
            <button
              type="button"
              :aria-label="t('addressBook.editAria', { name: entry.name })"
              :title="t('common.actions.edit')"
              @click="openEdit(entry)"
            >
              <Pencil :size="16" aria-hidden="true" />
            </button>
            <button
              class="address-book-entry__delete"
              type="button"
              :aria-label="t('addressBook.deleteAria', { name: entry.name })"
              :title="confirmingDeleteId === entry.id ? t('addressBook.deleteConfirm') : t('common.actions.delete')"
              @click="requestDelete(entry)"
            >
              <Trash2 :size="16" aria-hidden="true" />
            </button>
          </div>
          <div v-if="confirmingDeleteId === entry.id" class="address-book-entry__confirm" role="alert">
            <span>{{ t("addressBook.deleteConfirmBody") }}</span>
            <button type="button" @click="requestDelete(entry)">{{ t("addressBook.deleteConfirm") }}</button>
            <button type="button" @click="confirmingDeleteId = undefined">{{ t("common.actions.cancel") }}</button>
          </div>
        </article>
      </div>
    </template>

    <form v-else id="address-book-form" class="address-book-form" @submit.prevent="void saveDraft()">
      <div class="address-book-form__kind" role="group" :aria-label="t('addressBook.kindLabel')">
        <label>
          <input v-model="draftKind" type="radio" value="address" />
          <MapPin :size="16" aria-hidden="true" />
          {{ t("addressBook.addressType") }}
        </label>
        <label>
          <input v-model="draftKind" type="radio" value="marker" />
          <Route :size="16" aria-hidden="true" />
          {{ t("addressBook.markerType") }}
        </label>
      </div>

      <label>
        <span>{{ t("addressBook.nameLabel") }}</span>
        <input v-model="draftName" required maxlength="120" :placeholder="t('addressBook.namePlaceholder')" />
      </label>

      <GlobalMapMarkerAddressField
        ref="addressField"
        :open="open && editorOpen"
        :point="draftPoint"
        :address="draftAddress"
        :label="t('addressBook.addressLabel')"
        :placeholder="t('addressBook.addressPlaceholder')"
        @update:address="draftAddress = $event"
        @update:point="handleAddressPoint"
        @resolved-address="handleResolvedAddress"
      />

      <fieldset>
        <legend>{{ t("addressBook.iconLabel") }}</legend>
        <div class="address-book-form__icons" role="radiogroup" :aria-label="t('addressBook.iconLabel')">
          <label v-for="markerIcon in ADDRESS_BOOK_MARKER_ICONS" :key="markerIcon">
            <input v-model="draftIcon" type="radio" :value="markerIcon" />
            <component :is="resolveGlobalMapMarkerIcon(markerIcon)" :size="17" aria-hidden="true" />
            <span>{{ t(`globalMap.markers.icons.${markerIcon}` as never) }}</span>
          </label>
          <label v-if="selectedExtendedIcon" class="address-book-form__icon-option--extended">
            <input v-model="draftIcon" type="radio" :value="selectedExtendedIcon" />
            <component :is="resolveGlobalMapMarkerIcon(selectedExtendedIcon)" :size="17" aria-hidden="true" />
            <span>{{ selectedExtendedIconLabel }}</span>
          </label>
        </div>
        <button class="address-book-form__show-more" type="button" @click="iconSelectorOpen = true">
          <Plus :size="16" aria-hidden="true" />
          {{ t("addressBook.showMoreIcons") }}
        </button>
      </fieldset>

      <label class="address-book-form__color">
        <span>{{ t("addressBook.colorLabel") }}</span>
        <span class="address-book-form__color-control">
          <input v-model="draftColor" type="color" :aria-label="t('addressBook.colorLabel')" />
          <code>{{ draftColor }}</code>
        </span>
      </label>

      <label v-if="draftKind === 'address'" class="address-book-form__primary">
        <input v-model="draftPrimary" type="checkbox" />
        <span>{{ t("addressBook.makePrimary") }}</span>
      </label>

      <button
        class="address-book-form__visibility"
        :class="{ 'address-book-form__visibility--hidden': draftHidden }"
        type="button"
        role="switch"
        :aria-checked="draftHidden"
        :aria-label="draftHidden ? t('addressBook.showOnMapAria') : t('addressBook.hideOnMapAria')"
        @click="draftHidden = !draftHidden"
      >
        <span class="address-book-form__visibility-track" aria-hidden="true"><span /></span>
        <Eye v-if="draftHidden" :size="16" aria-hidden="true" />
        <EyeOff v-else :size="16" aria-hidden="true" />
        <span>{{ draftHidden ? t("addressBook.showOnMap") : t("addressBook.hideOnMap") }}</span>
      </button>

      <p v-if="draftPoint" class="address-book-form__coordinates">
        {{ t("addressBook.coordinates", { lat: draftPoint.lat.toFixed(5), lon: draftPoint.lon.toFixed(5) }) }}
      </p>
      <p v-if="formError" class="address-book-form__error" role="alert">{{ formError }}</p>
    </form>

    <template #footer>
      <template v-if="editorOpen">
        <button class="button-secondary" type="button" @click="closeEditor">{{ t("common.actions.cancel") }}</button>
        <button type="submit" form="address-book-form">{{ t("common.actions.confirm") }}</button>
      </template>
      <button v-else class="button-secondary" type="button" @click="emit('close')">{{ t("common.actions.close") }}</button>
    </template>
  </AppModal>

  <IconSelectorModal
    :open="iconSelectorOpen"
    :selected-icon="draftIcon"
    @close="iconSelectorOpen = false"
    @select="selectIcon"
  />
</template>

<style scoped>
:global(.address-book-modal) { max-width: 760px; min-width: 0; width: min(100%, 760px); }
.address-book-modal__intro { align-items: flex-start; display: flex; gap: 14px; justify-content: space-between; margin-bottom: 14px; }
.address-book-modal__intro p { color: #64748b; font-size: .82rem; line-height: 1.4; margin: 0; }
.address-book-modal__intro button, .address-book-entry__confirm button { align-items: center; background: #5146ff; border: 0; border-radius: 9px; color: #fff; display: inline-flex; flex: 0 0 auto; font: inherit; font-size: .76rem; font-weight: 850; gap: 6px; min-height: 36px; padding: 8px 11px; }
.address-book-modal__empty { background: #f7f7ff; border: 1px dashed rgba(81,70,255,.25); border-radius: 10px; color: #64748b; margin: 0; padding: 18px; text-align: center; }
.address-book-modal__list { display: grid; gap: 8px; max-height: min(58vh, 560px); overflow: auto; padding: 2px; }
.address-book-entry { align-items: center; background: #fafaff; border: 1px solid rgba(81,70,255,.13); border-radius: 11px; display: grid; gap: 10px; grid-template-columns: auto minmax(0, 1fr) auto; min-width: 0; padding: 10px; position: relative; }
.address-book-entry__icon { align-items: center; background: color-mix(in srgb, var(--address-book-entry-color, #5146ff) 12%, #fff); border-radius: 9px; color: var(--address-book-entry-color, #5146ff); display: flex; height: 36px; justify-content: center; width: 36px; }
.address-book-entry__icon--primary { background: #fff1c2; color: #a15c00; }
.address-book-entry__content { display: grid; gap: 2px; min-width: 0; }
.address-book-entry__title { align-items: center; display: flex; flex-wrap: wrap; gap: 7px; min-width: 0; }
.address-book-entry__title strong, .address-book-entry__subtitle { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.address-book-entry__title strong { color: #18233f; font-size: .82rem; }
.address-book-entry__subtitle { color: #475569; font-size: .74rem; }
.address-book-entry__content small { color: #64748b; font-size: .64rem; font-weight: 750; }
.address-book-entry__primary { align-items: center; background: #fff1c2; border-radius: 999px; color: #8a5100; display: inline-flex; font-size: .62rem; font-weight: 850; gap: 3px; padding: 3px 6px; }
.address-book-entry__hidden { align-items: center; background: #eef2ff; border-radius: 999px; color: #4f46e5; display: inline-flex; font-size: .62rem; font-weight: 850; gap: 3px; padding: 3px 6px; }
.address-book-entry__actions { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
.address-book-entry__actions button { align-items: center; background: #fff; border: 1px solid rgba(24,35,63,.12); border-radius: 7px; color: #475569; display: flex; flex: 0 0 31px; height: 31px; justify-content: center; line-height: 0; min-height: 31px; min-width: 31px; padding: 0; width: 31px; }
.address-book-entry__actions button :deep(svg) { display: block; flex: 0 0 auto; height: 16px; width: 16px; }
.address-book-entry__actions button:hover, .address-book-entry__actions button:focus-visible { background: #efeeff; color: #4034df; }
.address-book-entry__actions .address-book-entry__select { background: #5146ff; border-color: #5146ff; color: #fff; flex: 0 0 auto; font-size: .68rem; font-weight: 850; gap: 5px; padding: 0 9px; width: auto; }
.address-book-entry__actions .address-book-entry__select:hover, .address-book-entry__actions .address-book-entry__select:focus-visible { background: #4034df; border-color: #4034df; color: #fff; }
.address-book-entry__select span { white-space: nowrap; }
.address-book-entry__actions .address-book-entry__delete { color: #b42318; }
.address-book-entry__confirm { align-items: center; background: #fff5f4; border-top: 1px solid rgba(180,35,24,.15); color: #8f1c14; display: flex; flex-wrap: wrap; font-size: .72rem; gap: 7px; grid-column: 1 / -1; margin: 2px -10px -10px; padding: 9px 10px; }
.address-book-entry__confirm button { background: transparent; border: 1px solid rgba(180,35,24,.25); color: #8f1c14; min-height: 29px; }
.address-book-entry__confirm button:first-of-type { background: #b42318; color: #fff; }
.address-book-form { display: grid; gap: 15px; min-width: 0; }
.address-book-form > label { display: grid; gap: 6px; }
.address-book-form > label > span, .address-book-form legend { color: #475569; font-size: .75rem; font-weight: 850; }
.address-book-form input:not([type="radio"]):not([type="checkbox"]) { border: 1px solid rgba(15,23,42,.16); border-radius: 9px; box-sizing: border-box; font: inherit; min-height: 42px; padding: 8px 10px; width: 100%; }
.address-book-form input:focus { border-color: #5146ff; box-shadow: 0 0 0 3px rgba(81,70,255,.12); outline: 0; }
.address-book-form__kind { display: grid; gap: 8px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.address-book-form__kind label { align-items: center; background: #f8f8ff; border: 1px solid rgba(81,70,255,.13); border-radius: 9px; color: #475569; display: flex; font-size: .76rem; font-weight: 800; gap: 7px; padding: 10px; }
.address-book-form__kind label:has(input:checked) { background: #eceaff; border-color: #5146ff; color: #4034df; }
.address-book-form fieldset { border: 0; display: grid; gap: 8px; margin: 0; padding: 0; }
.address-book-form__icons { display: grid; gap: 7px; grid-template-columns: repeat(auto-fit, minmax(82px, 1fr)); }
.address-book-form__icons label { align-items: center; background: #f8f8ff; border: 1px solid rgba(81,70,255,.13); border-radius: 9px; color: #475569; cursor: pointer; display: grid; gap: 4px; justify-items: center; min-height: 60px; padding: 6px; text-align: center; transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease, color 140ms ease, transform 140ms ease; }
.address-book-form__icons label:has(input:checked) { background: #eceaff; border-color: #5146ff; color: #4034df; }
.address-book-form__icons label:hover, .address-book-form__icons label:focus-within { background: #efeeff; border-color: #5146ff; box-shadow: 0 5px 14px rgba(81,70,255,.16); color: #4034df; transform: translateY(-1px); }
.address-book-form__icons label.address-book-form__icon-option--extended { background: #f1f0ff; border-color: rgba(81,70,255,.35); }
.address-book-form__icons input { opacity: 0; position: absolute; }
.address-book-form__icons span { font-size: .62rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%; }
.address-book-form__show-more { align-items: center; background: #fff; border: 1px dashed rgba(81,70,255,.38); border-radius: 9px; color: #4034df; display: inline-flex; font: inherit; font-size: .74rem; font-weight: 800; gap: 6px; justify-content: center; min-height: 36px; padding: 8px 11px; }
.address-book-form__show-more:hover, .address-book-form__show-more:focus-visible { background: #efeeff; border-style: solid; outline: 0; }
.address-book-form__color { display: grid !important; gap: 6px; }
.address-book-form__color-control { align-items: center; display: flex !important; gap: 8px; }
.address-book-form__color-control input[type="color"] { background: #fff; border: 1px solid rgba(15,23,42,.16); border-radius: 8px; cursor: pointer; height: 36px; min-height: 36px; padding: 3px; width: 54px; }
.address-book-form__color-control code { color: #64748b; font-size: .72rem; }
.address-book-form__primary { align-items: center; display: flex !important; gap: 8px; grid-template-columns: none !important; }
.address-book-form__primary input { accent-color: #5146ff; }
.address-book-form__visibility { align-items: center; background: #f8f8ff; border: 1px solid rgba(81,70,255,.16); border-radius: 10px; color: #475569; display: inline-flex; font: inherit; font-size: .74rem; font-weight: 800; gap: 8px; justify-content: flex-start; min-height: 42px; padding: 7px 10px; text-align: left; }
.address-book-form__visibility:hover, .address-book-form__visibility:focus-visible, .address-book-form__visibility--hidden { background: #efeeff; border-color: #5146ff; color: #4034df; outline: 0; }
.address-book-form__visibility-track { background: #cbd5e1; border-radius: 999px; display: inline-flex; flex: 0 0 auto; height: 20px; padding: 2px; transition: background 140ms ease; width: 36px; }
.address-book-form__visibility-track span { background: #fff; border-radius: 50%; box-shadow: 0 1px 3px rgba(15,23,42,.22); display: block; height: 16px; transform: translateX(0); transition: transform 140ms ease; width: 16px; }
.address-book-form__visibility--hidden .address-book-form__visibility-track { background: #5146ff; }
.address-book-form__visibility--hidden .address-book-form__visibility-track span { transform: translateX(16px); }
.address-book-form__coordinates { color: #64748b; font-size: .72rem; margin: 0; }
.address-book-form__error { color: #b42318; font-size: .76rem; font-weight: 750; margin: 0; }
@media (max-width: 560px) {
  .address-book-entry { grid-template-columns: auto minmax(0, 1fr); }
  .address-book-entry__actions { grid-column: 1 / -1; justify-content: flex-start; }
  .address-book-modal__intro { align-items: stretch; flex-direction: column; }
}
</style>
