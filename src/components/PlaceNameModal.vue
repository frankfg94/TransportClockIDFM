<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check, MapPinPlus } from "lucide-vue-next";
import AppModal from "./AppModal.vue";
import { useI18n } from "../i18n";

const props = withDefaults(
  defineProps<{
    open: boolean;
    mode?: "create" | "rename";
    initialName?: string;
    error?: string;
  }>(),
  {
    mode: "create",
    initialName: "",
    error: "",
  },
);

const emit = defineEmits<{
  close: [];
  submit: [name: string];
  submitNearby: [name: string];
}>();

const name = ref("");
const { t } = useI18n();

const title = computed(() =>
  props.mode === "rename" ? t("placeName.titleRename") : t("placeName.titleCreate"),
);
const eyebrow = computed(() =>
  props.mode === "rename" ? t("placeName.eyebrowRename") : t("placeName.eyebrowCreate"),
);
const submitLabel = computed(() =>
  props.mode === "rename" ? t("common.actions.rename") : t("common.actions.create"),
);
const canSubmit = computed(() => name.value.trim().length > 0);

watch(
  () => props.open,
  (open) => {
    if (open) {
      name.value = props.initialName;
    }
  },
  { immediate: true },
);

function submit(): void {
  if (canSubmit.value) {
    emit("submit", name.value.trim());
  }
}

function submitNearby(): void {
  if (canSubmit.value) emit("submitNearby", name.value.trim());
}
</script>

<template>
  <AppModal
    :open="open"
    :eyebrow="eyebrow"
    :title="title"
    panel-class="place-name-modal"
    @close="emit('close')"
  >
    <form class="place-name-form" @submit.prevent="submit">
      <label>
        <span>{{ t("placeName.nameLabel") }}</span>
        <input
          v-model="name"
          autocomplete="off"
          class="form-input"
          maxlength="20"
          :placeholder="t('placeName.placeholder')"
          type="text"
        />
      </label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <button class="button-secondary" type="button" @click="emit('close')">
        {{ t("common.actions.cancel") }}
      </button>
      <button
        v-if="mode === 'create'"
        class="button-secondary place-name-modal__nearby"
        type="button"
        :disabled="!canSubmit"
        @click="submitNearby"
      >
        <MapPinPlus :size="18" aria-hidden="true" />
        {{ t("nearbyStations.createAndAdd") }}
      </button>
      <button type="button" :disabled="!canSubmit" @click="submit">
        <Check :size="18" aria-hidden="true" />
        {{ submitLabel }}
      </button>
    </template>
  </AppModal>
</template>
<style lang="css" scoped>
.place-name-form {
  box-sizing: border-box;
  display: grid;
  gap: 12px;
  min-width: 0;
  width: 100%;
}
.place-name-form label {
  min-width: 0;
}
.form-input {
  box-sizing: border-box;
  max-width: 100%;
  width: 100%;
}

:global(.place-name-modal .modal-panel__footer) {
  align-items: stretch;
  flex-wrap: wrap;
  gap: 8px;
}

:global(.place-name-modal .app-modal__body) {
  min-width: 0;
  overflow-x: hidden;
}

@media (max-width: 560px) {
  :global(.place-name-modal .modal-panel__footer) > button {
    flex: 1 1 auto;
    min-width: 0;
  }

  :global(.place-name-modal .place-name-modal__nearby) {
    flex-basis: 100%;
    order: -1;
  }
}

@media (max-width: 360px) {
  :global(.place-name-modal .modal-panel__footer) > button {
    flex-basis: 100%;
  }
}
</style>
