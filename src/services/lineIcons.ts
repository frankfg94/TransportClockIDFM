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
  "metro-4": { family: "METRO", lineCode: "C01374" },
  "metro-1": { family: "METRO", lineCode: "C01371" },
  "metro-2": { family: "METRO", lineCode: "C01372" },
  "metro-3": { family: "METRO", lineCode: "C01373" },
  "metro-6": { family: "METRO", lineCode: "C01376" },
  "metro-5": { family: "METRO", lineCode: "C01375" },
  "metro-7": { family: "METRO", lineCode: "C01377" },
  "metro-8": { family: "METRO", lineCode: "C01378" },
  "metro-9": { family: "METRO", lineCode: "C01379" },
  "metro-10": { family: "METRO", lineCode: "C01380" },
  "metro-11": { family: "METRO", lineCode: "C01381" },
  "metro-12": { family: "METRO", lineCode: "C01382" },
  "metro-13": { family: "METRO", lineCode: "C01383" },
  "metro-14": { family: "METRO", lineCode: "C01384" },
  "rer-a": { family: "RER", lineCode: "C01742" },
  "rer-b": { family: "RER", lineCode: "C01743" },
  "rer-c": { family: "RER", lineCode: "C01727" },
  "tram-t6": { family: "TRAM", lineCode: "C01794" },
  "bus-38": { family: "BUS", lineCode: "C01083" },
  "bus-68": { family: "BUS", lineCode: "C01104" },
  "bus-162": { family: "BUS", lineCode: "C01184" },
  "bus-194": { family: "BUS", lineCode: "C01214" },
  "bus-195": { family: "BUS", lineCode: "C01215" },
  "bus-394": { family: "BUS", lineCode: "C01319" },
  "bus-clam": { family: "BUS", lineCode: "C01357" },
  "bus-font": { family: "BUS", lineCode: "C01368" },
  "bus-7805": { family: "BUS", lineCode: "C01543" },
  "noctilien-n13": { family: "NOCTILIEN", lineCode: "C01419" },
  "noctilien-n14": { family: "NOCTILIEN", lineCode: "C01418" },
  "noctilien-n66": { family: "NOCTILIEN", lineCode: "C01807" },
  "noctilien-n123": { family: "NOCTILIEN", lineCode: "C02659" },
  t1: { family: "TRAM", lineCode: "C01389" },
  c01389: { family: "TRAM", lineCode: "C01389" },
  c02404: { family: "BUS", lineCode: "C01389" },
};

const NOCTILIEN_LEGACY_ICON_ASSETS: Record<string, string> = {
  n13: "picto_noctilien_ligne-n13.1496915882.svg",
  n14: "picto_noctilien_ligne-n14.1496915883.svg",
  n66: "picto_noctilien_ligne-n66.1568191656.svg",
  n123: "picto_noctilien_ligne-n123.1721914749.svg",
};

// The RATP web catalogue currently publishes hashed SVG filenames. Keep the
// old unversioned paths below as a compatibility fallback for older assets.
const RATP_PICTO_VERSIONS: Partial<Record<TransitFamily, string>> = {
  METRO: "1787972729",
  RER: "1787972732",
  TRAM: "1787972732",
  TRANSILIEN: "1787972732",
};
const RATP_LINE_PICTO_VERSIONS: Record<string, string> = {
  C01727: "1788059132",
};
const RATP_BUS_ICON_VERSION = "1496915831";

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
  const legacyNoctilienIcon = family === "NOCTILIEN"
    ? NOCTILIEN_LEGACY_ICON_ASSETS[displayCode?.toLowerCase() ?? ""]
    : undefined;
  const legacyBusIcon = family === "BUS" && isSafeIconCode(displayCode)
    ? `https://www.ratp.fr/sites/default/files/lines-assets/picto/busratp/picto_busratp_ligne-${displayCode}.${RATP_BUS_ICON_VERSION}.svg`
    : undefined;
  const version = RATP_LINE_PICTO_VERSIONS[lineCode] ?? RATP_PICTO_VERSIONS[family];

  return Array.from(
    new Set(
      [
        ...(legacyNoctilienIcon
          ? [`https://www.ratp.fr/sites/default/files/lines-assets/picto/noctilien/${legacyNoctilienIcon}`]
          : []),
        ...(legacyBusIcon ? [legacyBusIcon] : []),
        ...modePaths.flatMap((modePath) => [
          ...(version
            ? [
                `https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/${modePath}/picto-ligne-LIGIDFM${lineCode}.${version}.svg`,
                ...(displayCode
                  ? [
                      `https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/${modePath}/picto-ligne-${displayCode}.${version}.svg`,
                    ]
                  : []),
              ]
            : []),
          `https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/${modePath}/picto-ligne-LIGIDFM${lineCode}.svg`,
          ...(displayCode
            ? [
                `https://www.ratp.fr/sites/default/files/lines-assets/picto-v2/${modePath}/picto-ligne-${displayCode}.svg`,
              ]
            : []),
        ]),
      ],
    ),
  );
}

function isSafeIconCode(value?: string): value is string {
  return Boolean(value && /^[0-9A-Za-z-]+$/u.test(value));
}

function resolveLineIconIdentity(source: LineIconSource): LineIconIdentity {
  const rawLineCode = getRawLineCode(source);
  const normalizedLineCode = normalizeLineCode(rawLineCode);
  const explicitFamily = source.family ?? transitModeToFamily(source.mode);
  const familyIdentity = normalizedLineCode && explicitFamily
    ? OFFICIAL_LINE_IDENTITIES[`${explicitFamily.toLowerCase()}-${normalizedLineCode.toLowerCase()}`]
    : undefined;
  const identity = familyIdentity
    ?? (normalizedLineCode
      ? OFFICIAL_LINE_IDENTITIES[normalizedLineCode.toLowerCase()]
      : undefined);

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

  if (family === "TRANSILIEN") {
    return ["train"];
  }

  return [];
}


