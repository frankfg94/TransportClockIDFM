import { nextTick, onBeforeUnmount, watch, type Ref } from "vue";

/** Focus lifecycle shared by non-modal sheets and modal side-panel overlays. */
export function usePanelFocus(
  panel: Ref<HTMLElement | undefined>,
  isOpen: () => boolean,
  trapFocus: () => boolean = () => false,
) {
  let previouslyFocused: HTMLElement | undefined;

  function restoreFocus(): void {
    const active = typeof document === "undefined" ? undefined : document.activeElement;
    const ownsFocus = !active || active === document.body || panel.value?.contains(active);
    if (ownsFocus && previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    previouslyFocused = undefined;
  }

  watch(isOpen, async (open) => {
    if (typeof document === "undefined") return;
    if (!open) {
      restoreFocus();
      return;
    }
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    await nextTick();
    if (isOpen()) panel.value?.focus({ preventScroll: true });
  }, { immediate: true });

  onBeforeUnmount(restoreFocus);

  function handleTab(event: KeyboardEvent): void {
    if (!trapFocus() || event.key !== "Tab" || !panel.value) return;
    const focusable = Array.from(panel.value.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ));
    if (!focusable.length) {
      event.preventDefault();
      panel.value.focus();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (document.activeElement === panel.value) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return { handleTab };
}
