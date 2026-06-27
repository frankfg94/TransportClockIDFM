<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Check } from "lucide-vue-next";
import AppModal from "./AppModal.vue";

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
}>();

const name = ref("");

const title = computed(() =>
  props.mode === "rename" ? "Renommer le lieu" : "Nouveau lieu",
);
const eyebrow = computed(() =>
  props.mode === "rename" ? "Dashboard" : "Configuration",
);
const submitLabel = computed(() =>
  props.mode === "rename" ? "Renommer" : "Créer",
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
        <span>Nom du lieu</span>
        <input
          v-model="name"
          autocomplete="off"
          class="form-input"
          maxlength="40"
          placeholder="Ex. Sport, École, Studio"
          type="text"
        />
      </label>
      <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    </form>

    <template #footer>
      <button class="button-secondary" type="button" @click="emit('close')">
        Annuler
      </button>
      <button type="button" :disabled="!canSubmit" @click="submit">
        <Check :size="18" aria-hidden="true" />
        {{ submitLabel }}
      </button>
    </template>
  </AppModal>
</template>
