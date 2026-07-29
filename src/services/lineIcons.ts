import type { TransitFamily, TransitMode } from "../types/transit";

interface LineIconSource {
  code?: string;
  family?: TransitFamily;
  id?: string;
  mode?: TransitMode | string;
  ref?: string;
}

interface LineIconIdentity {
  family?: TransitFamily;
  lineCode?: string;
}

const OFFICIAL_LINE_IDENTITIES: Record<
  string,
  { family?: TransitFamily; lineCode: string }
> = {
  t1: { family: "TRAM", lineCode: "C01389" },
  c01389: { family: "TRAM", lineCode: "C01389" },
  c02404: { family: "BUS", lineCode: "C01389" },
};

export function inferTransitFamilyFromLineIdentity(
  source: LineIconSource,
): TransitFamily | undefined {
  const explicitFamily = source.family ?? transitModeToFamily(source.mode);

  if (explicitFamily) {
    return explicitFamily;
  }

  return resolveLineIconIdentity(source).family;
}

export function createRatpLineIconUrls(source: LineIconSource): string[] {
  const identity = resolveLineIconIdentity(source);
  const family = identity.family;
  const lineCode = identity.lineCode;
  const displayCode = source.code?.trim();

  if (!family || !lineCode) {
    return [];
  }

  const modePaths = getRatpModePaths(family);

  return Array.from(
    new Set(
      modePaths.flatMap((modePath) => [
        `https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/${modePath}/picto-ligne-LIGIDFM${lineCode}.svg`,
        ...(displayCode
          ? [
              `https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/${modePath}/picto-ligne-${displayCode}.svg`,
            ]
          : []),
      ]),
    ),
  );
}

function resolveLineIconIdentity(source: LineIconSource): LineIconIdentity {
  const rawLineCode = getRawLineCode(source);
  const normalizedLineCode = normalizeLineCode(rawLineCode);
  const identity = normalizedLineCode
    ? OFFICIAL_LINE_IDENTITIES[normalizedLineCode.toLowerCase()]
    : undefined;
  const explicitFamily = source.family ?? transitModeToFamily(source.mode);

  return {
    family: explicitFamily ?? identity?.family,
    lineCode: identity?.lineCode ?? normalizeLineCode(rawLineCode),
  };
}

function getRawLineCode(source: LineIconSource): string | undefined {
  const rawCode =
    source.id?.split(":").pop() ??
    source.ref?.match(/Line::([^:]+):/u)?.[1] ??
    source.code;

  return rawCode?.replace(/^LIGIDFM/u, "").trim();
}

function normalizeLineCode(value?: string): string | undefined {
  return value?.trim();
}

function transitModeToFamily(mode?: TransitMode | string): TransitFamily | undefined {
  const normalizedMode = mode?.trim().toLowerCase();

  if (normalizedMode?.includes("metro")) {
    return "METRO";
  }

  if (normalizedMode?.includes("rer")) {
    return "RER";
  }

  if (normalizedMode?.includes("tram")) {
    return "TRAM";
  }

  if (normalizedMode?.includes("bus")) {
    return "BUS";
  }

  if (
    normalizedMode?.includes("train") ||
    normalizedMode?.includes("rail") ||
    normalizedMode?.includes("transilien")
  ) {
    return "TRANSILIEN";
  }

  return undefined;
}

function getRatpModePaths(family: TransitFamily): string[] {
  if (family === "METRO") {
    return ["metro"];
  }

  if (family === "RER") {
    return ["rer"];
  }

  if (family === "TRAM") {
    return ["tramway", "tram"];
  }

  if (family === "NOCTILIEN") {
    return ["noctilien"];
  }

  return [];
}


