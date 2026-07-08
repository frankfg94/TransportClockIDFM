<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "../i18n";

withDefaults(
  defineProps<{
    open: boolean;
    eyebrow?: string;
    title: string;
    panelClass?: string;
    closeLabel?: string;
  }>(),
  {
    eyebrow: "",
    panelClass: "",
    closeLabel: "",
  },
);

const emit = defineEmits<{
  close: [];
}>();
const { t } = useI18n();
const resolvedCloseLabel = computed(() => t("common.actions.close"));
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-scale">
      <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
        <section
          class="modal-panel"
          :class="panelClass"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
        >
          <header class="modal-panel__header">
            <slot name="header">
              <div>
                <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
                <h2>{{ title }}</h2>
              </div>
            </slot>
            <button
              class="icon-button"
              type="button"
              :aria-label="closeLabel || resolvedCloseLabel"
              @click="emit('close')"
            >
              ×
            </button>
          </header>

          <div class="app-modal__body">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="modal-panel__footer">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
