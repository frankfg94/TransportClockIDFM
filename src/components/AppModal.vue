<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "../i18n";
import { usePanelFocus } from "./usePanelFocus";

const props = withDefaults(
  defineProps<{
    open: boolean;
    eyebrow?: string;
    title: string;
    panelClass?: string;
    closeLabel?: string;
    teleportDisabled?: boolean;
  }>(),
  {
    eyebrow: "",
    panelClass: "",
    closeLabel: "",
    teleportDisabled: false,
  },
);

const emit = defineEmits<{
  close: [];
}>();
const { t } = useI18n();
const resolvedCloseLabel = computed(() => t("common.actions.close"));
const dialogPanel = ref<HTMLElement>();
const { handleTab } = usePanelFocus(dialogPanel, () => props.open, () => true);
onMounted(() => {
  // A first async mount may resolve the focus watcher before DOM insertion.
  if (props.open) dialogPanel.value?.focus({ preventScroll: true });
});

function handleDialogKeydown(event: KeyboardEvent): void {
  handleTab(event);
  if (event.key !== "Escape" || event.defaultPrevented) return;
  event.preventDefault();
  event.stopPropagation();
  emit("close");
}
</script>

<template>
  <Teleport to="body" :disabled="teleportDisabled">
    <Transition name="modal-scale">
      <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
        <section
          ref="dialogPanel"
          class="modal-panel"
          :class="panelClass"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
          @keydown="handleDialogKeydown"
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
