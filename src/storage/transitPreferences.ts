import type {
  DirectionGroupConfig,
  TransitBoardConfig,
  TransitBoardPreferences,
} from "../types/transit";

export const TRANSIT_PREFERENCES_STORAGE_KEY =
  "transport-clock.preferences.v2";
export const TRANSIT_PREFERENCES_CHANGED_EVENT =
  "transport-clock:preferences-changed";
export const DEFAULT_TRANSIT_PLACE_ID = "home";
export const WORK_TRANSIT_PLACE_ID = "work";

const TRANSIT_PRESET_STATE_VERSION = 3;
const DIRECTION_GROUP_DISCOVERY_VERSION = 1;
const BUILTIN_PLACE_IDS = [DEFAULT_TRANSIT_PLACE_ID, WORK_TRANSIT_PLACE_ID];

export type TransitPlaceKind = "builtin" | "custom";

export interface TransitPlacePreset {
  id: string;
  kind: TransitPlaceKind;
  label: string;
  preferences: TransitBoardPreferences;
}

export interface TransitPresetState {
  version: 3;
  defaultPlaceId: string;
  places: TransitPlacePreset[];
}

export interface DirectionGroupMigrationResult {
  updatedBoardIds: string[];
  completed: boolean;
}

export interface CreateTransitPlaceResult {
  state: TransitPresetState;
  place: TransitPlacePreset;
}

export function createDefaultPreferences(
  boards: TransitBoardConfig[],
): TransitBoardPreferences {
  return createPreferences(boards, true);
}

export function createEmptyTransitPreferences(
  boards: TransitBoardConfig[],
): TransitBoardPreferences {
  return createPreferences(boards, false);
}

export function createDefaultTransitPresetState(
  boards: TransitBoardConfig[],
): TransitPresetState {
  return {
    version: TRANSIT_PRESET_STATE_VERSION,
    defaultPlaceId: DEFAULT_TRANSIT_PLACE_ID,
    places: [
      {
        id: DEFAULT_TRANSIT_PLACE_ID,
        kind: "builtin",
        label: "Home",
        preferences: createDefaultPreferences(boards),
      },
      {
        id: WORK_TRANSIT_PLACE_ID,
        kind: "builtin",
        label: "Work",
        preferences: createEmptyTransitPreferences(boards),
      },
    ],
  };
}

export function loadTransitPresetState(
  defaultBoards: TransitBoardConfig[],
): TransitPresetState {
  const rawValue = window.localStorage.getItem(TRANSIT_PREFERENCES_STORAGE_KEY);

  if (!rawValue) {
    return createDefaultTransitPresetState(defaultBoards);
  }

  try {
    return normalizeTransitPresetState(JSON.parse(rawValue), defaultBoards);
  } catch {
    return createDefaultTransitPresetState(defaultBoards);
  }
}

export function saveTransitPresetState(state: TransitPresetState): void {
  window.localStorage.setItem(
    TRANSIT_PREFERENCES_STORAGE_KEY,
    JSON.stringify(normalizeTransitPresetState(state, [])),
  );
  window.dispatchEvent(new Event(TRANSIT_PREFERENCES_CHANGED_EVENT));
}

export function normalizeTransitPresetState(
  value: unknown,
  defaultBoards: TransitBoardConfig[],
): TransitPresetState {
  if (isPresetStateLike(value)) {
    return normalizePresetState(value, defaultBoards);
  }

  if (isRecord(value)) {
    return migrateLegacyPreferences(value, defaultBoards);
  }

  return createDefaultTransitPresetState(defaultBoards);
}

export function loadTransitPreferences(
  defaultBoards: TransitBoardConfig[],
  placeId?: string,
): TransitBoardPreferences {
  const state = loadTransitPresetState(defaultBoards);
  const resolvedPlaceId = resolveTransitPlaceId(state, placeId);

  return cloneTransitBoardPreferences(
    getTransitPlaceById(state, resolvedPlaceId)?.preferences ??
      createDefaultPreferences(defaultBoards),
  );
}

export function saveTransitPreferences(
  preferences: TransitBoardPreferences,
  placeId = DEFAULT_TRANSIT_PLACE_ID,
): void {
  const state = loadTransitPresetState([]);
  const nextState = updateTransitPlacePreferences(state, placeId, preferences);

  saveTransitPresetState(nextState);
}

export function getTransitPlaceById(
  state: TransitPresetState,
  placeId?: string,
): TransitPlacePreset | undefined {
  return state.places.find((place) => place.id === placeId);
}

export function resolveTransitPlaceId(
  state: TransitPresetState,
  requestedPlaceId?: string,
): string {
  if (requestedPlaceId && getTransitPlaceById(state, requestedPlaceId)) {
    return requestedPlaceId;
  }

  if (getTransitPlaceById(state, state.defaultPlaceId)) {
    return state.defaultPlaceId;
  }

  return getTransitPlaceById(state, DEFAULT_TRANSIT_PLACE_ID)?.id ??
    state.places[0]?.id ??
    DEFAULT_TRANSIT_PLACE_ID;
}

export function setDefaultTransitPlace(
  state: TransitPresetState,
  placeId: string,
): TransitPresetState {
  if (!getTransitPlaceById(state, placeId)) {
    throw new Error("Place not found.");
  }

  return normalizeTransitPresetState(
    {
      ...state,
      defaultPlaceId: placeId,
    },
    [],
  );
}

export function createTransitPlace(
  state: TransitPresetState,
  label: string,
  defaultBoards: TransitBoardConfig[],
): CreateTransitPlaceResult {
  const normalizedLabel = normalizeTransitPlaceLabel(label);
  const id = createCustomPlaceId(normalizedLabel);

  assertCustomPlaceIdAvailable(state, id);

  const place: TransitPlacePreset = {
    id,
    kind: "custom",
    label: normalizedLabel,
    preferences: createEmptyTransitPreferences(defaultBoards),
  };
  const nextState = normalizeTransitPresetState(
    {
      ...state,
      places: [...state.places, place],
    },
    defaultBoards,
  );

  return {
    state: nextState,
    place: getTransitPlaceById(nextState, id) ?? place,
  };
}

export function renameTransitPlace(
  state: TransitPresetState,
  placeId: string,
  label: string,
): TransitPresetState {
  const place = getTransitPlaceById(state, placeId);
  const normalizedLabel = normalizeTransitPlaceLabel(label);

  if (!place) {
    throw new Error("Place not found.");
  }

  if (place.kind === "builtin") {
    return normalizeTransitPresetState(
      {
        ...state,
        places: state.places.map((candidate) =>
          candidate.id === placeId
            ? { ...candidate, label: normalizedLabel }
            : candidate,
        ),
      },
      [],
    );
  }

  const nextId = createCustomPlaceId(normalizedLabel);

  if (nextId !== place.id) {
    assertCustomPlaceIdAvailable(state, nextId);
  }

  return normalizeTransitPresetState(
    {
      ...state,
      defaultPlaceId:
        state.defaultPlaceId === place.id ? nextId : state.defaultPlaceId,
      places: state.places.map((candidate) =>
        candidate.id === place.id
          ? { ...candidate, id: nextId, label: normalizedLabel }
          : candidate,
      ),
    },
    [],
  );
}

export function deleteTransitPlace(
  state: TransitPresetState,
  placeId: string,
): TransitPresetState {
  const place = getTransitPlaceById(state, placeId);

  if (!place) {
    throw new Error("Place not found.");
  }

  if (place.kind === "builtin") {
    throw new Error("Built-in places cannot be deleted.");
  }

  const places = state.places.filter((candidate) => candidate.id !== placeId);
  const fallbackDefaultPlaceId =
    state.defaultPlaceId === placeId
      ? DEFAULT_TRANSIT_PLACE_ID
      : state.defaultPlaceId;

  return normalizeTransitPresetState(
    {
      ...state,
      defaultPlaceId: fallbackDefaultPlaceId,
      places,
    },
    [],
  );
}

export function updateTransitPlacePreferences(
  state: TransitPresetState,
  placeId: string,
  preferences: TransitBoardPreferences,
): TransitPresetState {
  if (!getTransitPlaceById(state, placeId)) {
    throw new Error("Place not found.");
  }

  return normalizeTransitPresetState(
    {
      ...state,
      places: state.places.map((place) =>
        place.id === placeId
          ? {
              ...place,
              preferences: cloneTransitBoardPreferences(preferences),
            }
          : place,
      ),
    },
    [],
  );
}

export function cloneTransitBoardPreferences(
  preferences: TransitBoardPreferences,
): TransitBoardPreferences {
  return {
    ...preferences,
    visibleBoardIds: [...preferences.visibleBoardIds],
    boardOrderIds: [...preferences.boardOrderIds],
    collapsedDirectionIds: [...preferences.collapsedDirectionIds],
    customBoards: preferences.customBoards.map((board) => ({ ...board })),
    hiddenDirectionIdsByBoardId: Object.fromEntries(
      Object.entries(preferences.hiddenDirectionIdsByBoardId).map(
        ([boardId, directionIds]) => [boardId, [...directionIds]],
      ),
    ),
  };
}

export function isTransitBuiltinPlace(place: TransitPlacePreset): boolean {
  return place.kind === "builtin";
}

export function addBoardToTransitPreferences(
  board: TransitBoardConfig,
  defaultBoards: TransitBoardConfig[],
  placeId = DEFAULT_TRANSIT_PLACE_ID,
): TransitBoardPreferences {
  const state = loadTransitPresetState(defaultBoards);
  const resolvedPlaceId = resolveTransitPlaceId(state, placeId);
  const place = getTransitPlaceById(state, resolvedPlaceId);
  const preferences = cloneTransitBoardPreferences(
    place?.preferences ?? createDefaultPreferences(defaultBoards),
  );
  const defaultBoard = defaultBoards.find((candidate) =>
    boardsReferToSameStation(candidate, board),
  );

  if (defaultBoard) {
    preferences.visibleBoardIds = addUniqueId(
      preferences.visibleBoardIds,
      defaultBoard.id,
    );
    preferences.boardOrderIds = addUniqueId(
      preferences.boardOrderIds,
      defaultBoard.id,
    );
    saveTransitPresetState(
      updateTransitPlacePreferences(state, resolvedPlaceId, preferences),
    );
    return preferences;
  }

  const existingIndex = preferences.customBoards.findIndex(
    (candidate) =>
      candidate.id === board.id || boardsReferToSameStation(candidate, board),
  );

  if (existingIndex >= 0) {
    const existingId = preferences.customBoards[existingIndex].id;

    preferences.customBoards[existingIndex] = {
      ...board,
      id: existingId,
    };
    preferences.visibleBoardIds = addUniqueId(
      preferences.visibleBoardIds,
      existingId,
    );
    preferences.boardOrderIds = addUniqueId(
      preferences.boardOrderIds,
      existingId,
    );
  } else {
    preferences.customBoards.push(board);
    preferences.visibleBoardIds = addUniqueId(
      preferences.visibleBoardIds,
      board.id,
    );
    preferences.boardOrderIds = addUniqueId(
      preferences.boardOrderIds,
      board.id,
    );
  }

  saveTransitPresetState(
    updateTransitPlacePreferences(state, resolvedPlaceId, preferences),
  );
  return preferences;
}

export async function migrateCustomBoardDirectionGroups(
  preferences: TransitBoardPreferences,
  discoverDirectionGroups: (
    board: TransitBoardConfig,
  ) => Promise<DirectionGroupConfig[] | undefined>,
): Promise<DirectionGroupMigrationResult> {
  if (
    preferences.directionGroupDiscoveryVersion >=
    DIRECTION_GROUP_DISCOVERY_VERSION
  ) {
    return { updatedBoardIds: [], completed: true };
  }

  const candidates = preferences.customBoards.filter(
    (board) => Boolean(board.schedule) && board.directionGroups.length === 1,
  );
  const updatedBoardIds: string[] = [];
  let completed = true;

  for (const board of candidates) {
    try {
      const directionGroups = await discoverDirectionGroups(board);

      if (!directionGroups) {
        completed = false;
        continue;
      }

      if (!haveSameDirectionGroups(board.directionGroups, directionGroups)) {
        preferences.customBoards = preferences.customBoards.map((candidate) =>
          candidate.id === board.id
            ? { ...candidate, directionGroups }
            : candidate,
        );
        updatedBoardIds.push(board.id);
      }
    } catch {
      // Leave the migration pending so a transient API failure is retried.
      completed = false;
    }
  }

  if (completed) {
    preferences.directionGroupDiscoveryVersion =
      DIRECTION_GROUP_DISCOVERY_VERSION;
  }

  return { updatedBoardIds, completed };
}

function createPreferences(
  boards: TransitBoardConfig[],
  visibleByDefault: boolean,
): TransitBoardPreferences {
  return {
    visibleBoardIds: visibleByDefault ? boards.map((board) => board.id) : [],
    boardOrderIds: boards.map((board) => board.id),
    boardDisplayMode: "grid",
    collapsedDirectionIds: [],
    customBoards: [],
    directionGroupDiscoveryVersion: DIRECTION_GROUP_DISCOVERY_VERSION,
    closedDirectionSummaryMode: "next",
    maxDeparturesPerDirection: "default",
    terminalDirectionsOnly: false,
    hiddenDirectionIdsByBoardId: {},
    boardTogglesPlacement: "inline",
  };
}

function migrateLegacyPreferences(
  value: Record<string, unknown>,
  defaultBoards: TransitBoardConfig[],
): TransitPresetState {
  return normalizePresetState(
    {
      version: TRANSIT_PRESET_STATE_VERSION,
      defaultPlaceId: DEFAULT_TRANSIT_PLACE_ID,
      places: [
        {
          id: DEFAULT_TRANSIT_PLACE_ID,
          kind: "builtin",
          label: "Home",
          preferences: value,
        },
        {
          id: WORK_TRANSIT_PLACE_ID,
          kind: "builtin",
          label: "Work",
          preferences: createEmptyTransitPreferences(defaultBoards),
        },
      ],
    },
    defaultBoards,
  );
}

function normalizePresetState(
  value: Record<string, unknown>,
  defaultBoards: TransitBoardConfig[],
): TransitPresetState {
  const defaults = createDefaultTransitPresetState(defaultBoards);
  const rawPlaces = Array.isArray(value.places) ? value.places : [];
  const normalizedPlaces = rawPlaces.flatMap((rawPlace) =>
    normalizeTransitPlace(rawPlace, defaultBoards),
  );
  const withBuiltins = ensureBuiltinPlaces(normalizedPlaces, defaults);
  const dedupedPlaces = dedupePlacesById(withBuiltins);
  const defaultPlaceId =
    typeof value.defaultPlaceId === "string" &&
    dedupedPlaces.some((place) => place.id === value.defaultPlaceId)
      ? value.defaultPlaceId
      : DEFAULT_TRANSIT_PLACE_ID;

  return {
    version: TRANSIT_PRESET_STATE_VERSION,
    defaultPlaceId,
    places: sortTransitPlaces(dedupedPlaces),
  };
}

function normalizeTransitPlace(
  value: unknown,
  defaultBoards: TransitBoardConfig[],
): TransitPlacePreset[] {
  if (!isRecord(value) || typeof value.id !== "string") {
    return [];
  }

  const isBuiltin = BUILTIN_PLACE_IDS.includes(value.id);
  const kind = isBuiltin
    ? "builtin"
    : value.kind === "custom"
      ? "custom"
      : undefined;

  if (!kind) {
    return [];
  }

  const fallbackPreferences =
    value.id === WORK_TRANSIT_PLACE_ID
      ? createEmptyTransitPreferences(defaultBoards)
      : createDefaultPreferences(defaultBoards);

  return [
    {
      id: value.id,
      kind,
      label:
        typeof value.label === "string" && value.label.trim()
          ? value.label.trim()
          : value.id === WORK_TRANSIT_PLACE_ID
            ? "Work"
            : "Home",
      preferences: normalizeTransitBoardPreferences(
        value.preferences,
        defaultBoards,
        fallbackPreferences,
      ),
    },
  ];
}

function ensureBuiltinPlaces(
  places: TransitPlacePreset[],
  defaults: TransitPresetState,
): TransitPlacePreset[] {
  return defaults.places.map((defaultPlace) => {
    const existingPlace = places.find((place) => place.id === defaultPlace.id);

    return existingPlace
      ? { ...existingPlace, kind: "builtin" as const }
      : cloneTransitPlace(defaultPlace);
  }).concat(places.filter((place) => !BUILTIN_PLACE_IDS.includes(place.id)));
}

function dedupePlacesById(places: TransitPlacePreset[]): TransitPlacePreset[] {
  const seenPlaceIds = new Set<string>();

  return places.filter((place) => {
    if (seenPlaceIds.has(place.id)) {
      return false;
    }

    seenPlaceIds.add(place.id);
    return true;
  });
}

function sortTransitPlaces(places: TransitPlacePreset[]): TransitPlacePreset[] {
  return [...places].sort((left, right) => {
    const leftRank = getPlaceSortRank(left);
    const rightRank = getPlaceSortRank(right);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return left.label.localeCompare(right.label, "fr");
  });
}

function getPlaceSortRank(place: TransitPlacePreset): number {
  if (place.id === DEFAULT_TRANSIT_PLACE_ID) {
    return 0;
  }

  if (place.id === WORK_TRANSIT_PLACE_ID) {
    return 2;
  }

  return 1;
}

function normalizeTransitBoardPreferences(
  value: unknown,
  defaultBoards: TransitBoardConfig[],
  fallback: TransitBoardPreferences,
): TransitBoardPreferences {
  if (!isRecord(value)) {
    return cloneTransitBoardPreferences(fallback);
  }

  const customBoards = Array.isArray(value.customBoards)
    ? (value.customBoards.filter(isTransitBoardConfigLike) as TransitBoardConfig[])
    : [];
  const persistedBoardIds =
    defaultBoards.length === 0
      ? [...readStringArray(value.boardOrderIds), ...readStringArray(value.visibleBoardIds)]
      : [];
  const knownBoardIds = [
    ...defaultBoards.map((board) => board.id),
    ...customBoards.map((board) => board.id),
    ...persistedBoardIds,
  ];
  const knownBoardIdSet = new Set(knownBoardIds);
  const visibleBoardIds = Array.isArray(value.visibleBoardIds)
    ? value.visibleBoardIds.filter(
        (id): id is string =>
          typeof id === "string" && knownBoardIdSet.has(id),
      )
    : [...fallback.visibleBoardIds];

  return {
    visibleBoardIds,
    boardOrderIds: normalizeBoardOrderIds(value.boardOrderIds, knownBoardIds),
    boardDisplayMode: value.boardDisplayMode === "list" ? "list" : "grid",
    collapsedDirectionIds: readStringArray(value.collapsedDirectionIds),
    customBoards,
    directionGroupDiscoveryVersion: readDirectionGroupDiscoveryVersion(
      value.directionGroupDiscoveryVersion,
    ),
    closedDirectionSummaryMode:
      value.closedDirectionSummaryMode === "last" ? "last" : "next",
    maxDeparturesPerDirection: parseMaxDeparturesPerDirection(
      value.maxDeparturesPerDirection,
    ),
    terminalDirectionsOnly:
      typeof value.terminalDirectionsOnly === "boolean"
        ? value.terminalDirectionsOnly
        : fallback.terminalDirectionsOnly,
    hiddenDirectionIdsByBoardId: parseHiddenDirectionIdsByBoardId(
      value.hiddenDirectionIdsByBoardId,
    ),
    boardTogglesPlacement:
      value.boardTogglesPlacement === "context-menu"
        ? "context-menu"
        : "inline",
  };
}

function parseMaxDeparturesPerDirection(
  value: unknown,
): TransitBoardPreferences["maxDeparturesPerDirection"] {
  if (value === "default") {
    return "default";
  }

  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return [1, 2, 3, 4, 6, 8, 10].includes(numericValue)
    ? (numericValue as TransitBoardPreferences["maxDeparturesPerDirection"])
    : "default";
}

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

function createCustomPlaceId(label: string): string {
  const slug = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");

  return slug || "place";
}

function assertCustomPlaceIdAvailable(
  state: TransitPresetState,
  placeId: string,
): void {
  if (BUILTIN_PLACE_IDS.includes(placeId)) {
    throw new Error("This name is reserved.");
  }

  if (getTransitPlaceById(state, placeId)) {
    throw new Error("A place with this name already exists.");
  }
}

function normalizeTransitPlaceLabel(label: string): string {
  const normalizedLabel = label.trim().replace(/\s+/gu, " ");

  if (!normalizedLabel) {
    throw new Error("The place name is required.");
  }

  return normalizedLabel;
}

function cloneTransitPlace(place: TransitPlacePreset): TransitPlacePreset {
  return {
    ...place,
    preferences: cloneTransitBoardPreferences(place.preferences),
  };
}

function isPresetStateLike(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Array.isArray(value.places);
}

function isTransitBoardConfigLike(value: unknown): value is TransitBoardConfig {
  return isRecord(value) && typeof value.id === "string";
}

function boardsReferToSameStation(
  left: TransitBoardConfig,
  right: TransitBoardConfig,
): boolean {
  const leftStopArea = normalizeIdentity(left.schedule?.stopAreaRef);
  const rightStopArea = normalizeIdentity(right.schedule?.stopAreaRef);
  const leftLine = normalizeIdentity(
    left.schedule?.lineRef ?? left.line.ref ?? left.line.shortName,
  );
  const rightLine = normalizeIdentity(
    right.schedule?.lineRef ?? right.line.ref ?? right.line.shortName,
  );

  if (
    leftStopArea &&
    rightStopArea &&
    leftStopArea === rightStopArea &&
    leftLine === rightLine
  ) {
    return true;
  }

  return (
    normalizeIdentity(left.title) === normalizeIdentity(right.title) &&
    normalizeIdentity(left.line.shortName) ===
      normalizeIdentity(right.line.shortName)
  );
}

function addUniqueId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

function normalizeBoardOrderIds(
  value: unknown,
  knownBoardIds: string[],
): string[] {
  const knownBoardIdSet = new Set(knownBoardIds);
  const savedIds = Array.isArray(value)
    ? value.filter(
        (id): id is string =>
          typeof id === "string" && knownBoardIdSet.has(id),
      )
    : [];

  return [...new Set([...savedIds, ...knownBoardIds])];
}

function normalizeIdentity(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/giu, "")
    .toLowerCase();
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readDirectionGroupDiscoveryVersion(value: unknown): number {
  return typeof value === "number" && value >= 0 ? value : 0;
}

function haveSameDirectionGroups(
  left: DirectionGroupConfig[],
  right: DirectionGroupConfig[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (group, index) =>
        group.id === right[index]?.id &&
        group.label === right[index]?.label &&
        JSON.stringify(group.match) === JSON.stringify(right[index]?.match),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
