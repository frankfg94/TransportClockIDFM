# App Settings Guide

This guide explains how to add, persist, update, and connect custom application settings in `appSettings.ts`.

The app settings system is designed around one simple flow:

```txt
localStorage
  ->
loadSettingsFromLocalStorage()
  ->
useAppSettings()
  ->
App.vue
  ->
child components
```

Child components should usually not read or write `localStorage` directly. They should receive settings through props and emit events when something needs to change.

---

## 1. Add the setting to the `AppSettings` interface

Open `appSettings.ts` and add your setting to the `AppSettings` interface.

Example:

```ts
export interface AppSettings {
  version: 1;
  closedDirectionSummaryMode: ClosedDirectionSummaryMode;
  showPatternMiniMap: boolean;

  // New setting
  hiddenDirectionIdsByBoardId: Record<string, string[]>;
}
```

Use a type that matches how the setting will be used in the UI.

Examples:

```ts
// Simple boolean
showPatternMiniMap: boolean;

// String union
themeMode: "light" | "dark" | "system";

// Number setting
refreshIntervalMs: number;

// Per-board setting
hiddenDirectionIdsByBoardId: Record<string, string[]>;
```

---

## 2. Add the default value

Every setting must have a default value in `createDefaultAppSettings()`.

Example:

```ts
export function createDefaultAppSettings(): AppSettings {
  return {
    version: 1,
    closedDirectionSummaryMode: "last",
    showPatternMiniMap: true,

    // New setting default
    hiddenDirectionIdsByBoardId: {},
  };
}
```

The default value is used when:

- there is no value in `localStorage` yet;
- the stored value is invalid;
- a new setting is added after users already have older settings saved.

---

## 3. Normalize the setting

Settings loaded from `localStorage` must be treated as unsafe because they can be outdated, corrupted, or manually edited.

That is why `normalizeAppSettings()` should validate every field.

Example for a boolean:

```ts
showPatternMiniMap: readBoolean(
  value.showPatternMiniMap,
  defaults.showPatternMiniMap,
),
```

Example for a string union:

```ts
themeMode: isThemeMode(value.themeMode)
  ? value.themeMode
  : defaults.themeMode,
```

Example for a complex object:

```ts
hiddenDirectionIdsByBoardId: parseHiddenDirectionIdsByBoardId(
  value.hiddenDirectionIdsByBoardId,
),
```

---

## 4. Add a parser when the setting is complex

For simple booleans, strings, or numbers, existing helpers are often enough.

For complex values, create a parser.

Example:

```ts
function parseHiddenDirectionIdsByBoardId(
  value: unknown,
): Record<string, string[]> {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([boardId, directionIds]) => {
      if (!Array.isArray(directionIds)) {
        return [];
      }

      const normalizedIds = [
        ...new Set(
          directionIds.filter(
            (directionId): directionId is string =>
              typeof directionId === "string" && directionId.length > 0,
          ),
        ),
      ];

      return normalizedIds.length > 0 ? [[boardId, normalizedIds]] : [];
    }),
  );
}
```

This parser:

- rejects invalid values;
- keeps only string direction IDs;
- removes empty values;
- removes duplicates;
- skips boards with no hidden directions.

---

## 5. Read settings in `App.vue`

In `App.vue`, use the composable:

```ts
const { settings, updateSettings } = useAppSettings();
```

Then pass the setting to the component that needs it.

Example:

```vue
<TransitBoard
  :board="board"
  :hidden-direction-ids="
    settings.hiddenDirectionIdsByBoardId[board.id] ?? []
  "
/>
```

The parent decides which slice of the global settings belongs to each child component.

---

## 6. Update settings from `App.vue`

Use `updateSettings()` when a setting changes.

Example:

```ts
function updateHiddenDirectionIdsForBoard(
  boardId: string,
  directionIds: string[],
): void {
  const nextHiddenDirectionIdsByBoardId = {
    ...settings.value.hiddenDirectionIdsByBoardId,
  };

  if (directionIds.length > 0) {
    nextHiddenDirectionIdsByBoardId[boardId] = directionIds;
  } else {
    delete nextHiddenDirectionIdsByBoardId[boardId];
  }

  updateSettings({
    hiddenDirectionIdsByBoardId: nextHiddenDirectionIdsByBoardId,
  });
}
```

Important: avoid mutating nested settings directly.

Prefer this:

```ts
updateSettings({
  hiddenDirectionIdsByBoardId: nextHiddenDirectionIdsByBoardId,
});
```

Avoid this:

```ts
settings.value.hiddenDirectionIdsByBoardId[boardId] = directionIds;
```

Creating a new object makes the update easier to track and safer for reactivity.

---

## 7. Connect the update to a child component

A child component should emit an event instead of updating app settings directly.

Example in `App.vue`:

```vue
<TransitBoard
  :board="board"
  :hidden-direction-ids="
    settings.hiddenDirectionIdsByBoardId[board.id] ?? []
  "
  @update:hidden-direction-ids="
    updateHiddenDirectionIdsForBoard(board.id, $event)
  "
/>
```

This keeps the architecture clean:

```txt
TransitBoard emits an update
  ->
App.vue receives the update
  ->
App.vue calls updateSettings()
  ->
useAppSettings persists the setting
  ->
localStorage is updated
```

---

## 8. Define props and emits in the child component

In the child component, receive the setting as a prop.

Example in `TransitBoard.vue`:

```ts
const props = withDefaults(
  defineProps<{
    hiddenDirectionIds?: string[];
  }>(),
  {
    hiddenDirectionIds: () => [],
  },
);
```

Then declare the event:

```ts
const emit = defineEmits<{
  "update:hiddenDirectionIds": [directionIds: string[]];
}>();
```

In Vue templates, camelCase events are listened to with kebab-case:

```vue
@update:hidden-direction-ids="..."
```

---

## 9. Use computed values inside the child component

Do not mutate props directly. Create computed values instead.

Example:

```ts
const hiddenDirectionIdSet = computed(
  () => new Set(props.hiddenDirectionIds),
);

const visibleDirectionGroups = computed(() =>
  props.directionGroups.filter(
    (group) => !hiddenDirectionIdSet.value.has(group.id),
  ),
);
```

Then use the computed value in the template:

```vue
<section
  v-for="group in visibleDirectionGroups"
  :key="group.id"
>
  ...
</section>
```

---

## 10. Emit updates from the child component

Example:

```ts
function setDirectionVisibility(directionId: string, event: Event): void {
  const checked = (event.target as HTMLInputElement | null)?.checked ?? true;

  const nextHiddenIds = checked
    ? props.hiddenDirectionIds.filter((id) => id !== directionId)
    : [...new Set([...props.hiddenDirectionIds, directionId])];

  emit("update:hiddenDirectionIds", nextHiddenIds);
}
```

The child does not know about `localStorage`, `AppSettings`, or global persistence. It only sends the new value upward.

---

## 11. Common mistakes

### Forgetting the listener in `App.vue`

This is a common issue:

```vue
<TransitBoard
  :hidden-direction-ids="settings.hiddenDirectionIdsByBoardId[board.id] ?? []"
/>
```

This passes the setting but does not update it.

You also need:

```vue
@update:hidden-direction-ids="
  updateHiddenDirectionIdsForBoard(board.id, $event)
"
```

Without this listener, the child emits the update, but the parent ignores it.

---

### Forgetting to normalize the setting

If the setting is added to the interface and default values but not to `normalizeAppSettings()`, it may disappear after reload or after the next save.

Always update:

1. `AppSettings` interface;
2. `createDefaultAppSettings()`;
3. `normalizeAppSettings()`;
4. parser/helper if needed.

---

### Mutating props in the child component

Do not do this:

```ts
props.hiddenDirectionIds.push(directionId);
```

Props are read-only from the child perspective.

Instead, emit a new value:

```ts
emit("update:hiddenDirectionIds", nextHiddenIds);
```

---

## 12. Recommended pattern

For every new setting, follow this checklist:

```txt
1. Add the field to AppSettings
2. Add a default value in createDefaultAppSettings()
3. Add validation in normalizeAppSettings()
4. Add a parser if the value is complex
5. Read the setting in App.vue through useAppSettings()
6. Pass the value to child components as props
7. Let child components emit changes
8. Handle emitted changes in App.vue
9. Call updateSettings()
10. Never access localStorage directly from child components
```

---

## Final example

### appSettings.ts

```ts
export interface AppSettings {
  version: 1;
  hiddenDirectionIdsByBoardId: Record<string, string[]>;
}

export function createDefaultAppSettings(): AppSettings {
  return {
    version: 1,
    hiddenDirectionIdsByBoardId: {},
  };
}

export function normalizeAppSettings(value: unknown): AppSettings {
  const defaults = createDefaultAppSettings();

  if (!isRecord(value)) {
    return defaults;
  }

  return {
    version: 1,
    hiddenDirectionIdsByBoardId: parseHiddenDirectionIdsByBoardId(
      value.hiddenDirectionIdsByBoardId,
    ),
  };
}
```

### App.vue

```vue
<script setup lang="ts">
const { settings, updateSettings } = useAppSettings();

function updateHiddenDirectionIdsForBoard(
  boardId: string,
  directionIds: string[],
): void {
  const nextHiddenDirectionIdsByBoardId = {
    ...settings.value.hiddenDirectionIdsByBoardId,
  };

  if (directionIds.length > 0) {
    nextHiddenDirectionIdsByBoardId[boardId] = directionIds;
  } else {
    delete nextHiddenDirectionIdsByBoardId[boardId];
  }

  updateSettings({
    hiddenDirectionIdsByBoardId: nextHiddenDirectionIdsByBoardId,
  });
}
</script>

<template>
  <TransitBoard
    :hidden-direction-ids="
      settings.hiddenDirectionIdsByBoardId[board.id] ?? []
    "
    @update:hidden-direction-ids="
      updateHiddenDirectionIdsForBoard(board.id, $event)
    "
  />
</template>
```

### TransitBoard.vue

```ts
const props = withDefaults(
  defineProps<{
    hiddenDirectionIds?: string[];
  }>(),
  {
    hiddenDirectionIds: () => [],
  },
);

const emit = defineEmits<{
  "update:hiddenDirectionIds": [directionIds: string[]];
}>();

function updateHiddenDirections(directionIds: string[]): void {
  emit("update:hiddenDirectionIds", directionIds);
}
```
