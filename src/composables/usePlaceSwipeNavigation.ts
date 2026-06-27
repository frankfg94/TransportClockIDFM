import { computed, ref, type CSSProperties, type ComputedRef, type Ref } from "vue";

export interface PlaceSwipeOption {
  id: string;
}

type MaybeRef<T> = Ref<T> | ComputedRef<T>;
type SwipeDirection = "next" | "previous";

interface PointerState {
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  horizontal: boolean;
}

interface UsePlaceSwipeNavigationOptions {
  places: ComputedRef<PlaceSwipeOption[]>;
  activePlaceId: MaybeRef<string>;
  enabled: MaybeRef<boolean>;
  reduceMotion?: MaybeRef<boolean>;
  selectPlace: (placeId: string) => void;
}

const INTERACTIVE_TARGET_SELECTOR = [
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "[contenteditable='true']",
  "[role='button']",
  "[role='menuitem']",
  ".modal-panel",
].join(",");

export function usePlaceSwipeNavigation(
  options: UsePlaceSwipeNavigationOptions,
) {
  const pointer = ref<PointerState>();
  const dragOffset = ref(0);
  const direction = ref<SwipeDirection>("next");

  const activeIndex = computed(() => {
    const index = options.places.value.findIndex(
      (place) => place.id === options.activePlaceId.value,
    );

    return index >= 0 ? index : 0;
  });

  const canNavigate = computed(
    () => options.enabled.value && options.places.value.length > 1,
  );
  const canGoPrevious = computed(
    () => canNavigate.value && activeIndex.value > 0,
  );
  const canGoNext = computed(
    () =>
      canNavigate.value &&
      activeIndex.value < options.places.value.length - 1,
  );
  const isDragging = computed(() => Boolean(pointer.value?.horizontal));
  const transitionName = computed(() => {
    if (options.reduceMotion?.value) {
      return "place-page-fade";
    }

    return direction.value === "previous"
      ? "place-page-previous"
      : "place-page-next";
  });
  const pageStyle = computed<CSSProperties>(() =>
    dragOffset.value
      ? {
          transform: `translateX(${dragOffset.value}px)`,
        }
      : {},
  );

  function goToPreviousPlace(): void {
    goToRelativePlace(-1);
  }

  function goToNextPlace(): void {
    goToRelativePlace(1);
  }

  function onPointerDown(event: PointerEvent): void {
    if (
      !canNavigate.value ||
      event.button !== 0 ||
      isInteractiveTarget(event.target)
    ) {
      return;
    }

    const target = event.currentTarget;
    const measuredWidth =
      target instanceof HTMLElement
        ? target.getBoundingClientRect().width
        : window.innerWidth;
    const width = measuredWidth > 0 ? measuredWidth : window.innerWidth;

    pointer.value = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width,
      horizontal: false,
    };
    dragOffset.value = 0;

    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
  }

  function onPointerMove(event: PointerEvent): void {
    const currentPointer = pointer.value;

    if (!currentPointer || currentPointer.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - currentPointer.startX;
    const deltaY = event.clientY - currentPointer.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (!currentPointer.horizontal) {
      if (absX < 8 && absY < 8) {
        return;
      }

      if (absX <= absY * 1.2) {
        resetPointer();
        return;
      }

      currentPointer.horizontal = true;
    }

    event.preventDefault();
    dragOffset.value = clamp(
      deltaX,
      currentPointer.width * -0.28,
      currentPointer.width * 0.28,
    );
  }

  function onPointerUp(event: PointerEvent): void {
    const currentPointer = pointer.value;

    if (!currentPointer || currentPointer.pointerId !== event.pointerId) {
      return;
    }

    if (!currentPointer.horizontal) {
      resetPointer();
      return;
    }

    const threshold = Math.max(58, currentPointer.width * 0.16);
    const deltaX = dragOffset.value;

    resetPointer();

    if (Math.abs(deltaX) < threshold) {
      return;
    }

    if (deltaX < 0) {
      goToNextPlace();
    } else {
      goToPreviousPlace();
    }
  }

  function onPointerCancel(): void {
    resetPointer();
  }

  function goToRelativePlace(offset: number): void {
    const places = options.places.value;

    if (!canNavigate.value || places.length === 0) {
      return;
    }

    const nextIndex = activeIndex.value + offset;
    const nextPlace = places[nextIndex];

    if (!nextPlace || nextPlace.id === options.activePlaceId.value) {
      return;
    }

    direction.value = offset < 0 ? "previous" : "next";
    dragOffset.value = 0;
    pointer.value = undefined;
    options.selectPlace(nextPlace.id);
  }

  function resetPointer(): void {
    pointer.value = undefined;
    dragOffset.value = 0;
  }

  return {
    activeIndex,
    canGoNext,
    canGoPrevious,
    canNavigate,
    isDragging,
    pageStyle,
    transitionName,
    goToNextPlace,
    goToPreviousPlace,
    onPointerCancel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    ? Boolean(target.closest(INTERACTIVE_TARGET_SELECTOR))
    : false;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
