import type { LineConfig, TransitFamily, TransitMode } from "../types/transit";
import { createRatpLineIconUrls } from "./lineIcons";

type LinePresentationSource = {
  code?: string;
  color?: string;
  family?: TransitFamily;
  id?: string;
  longName?: string;
  mode?: TransitMode | string;
  ref?: string;
  shortName?: string;
  textColor?: string;
};

type LinePresentation = Pick<
  LineConfig,
  "color" | "iconUrl" | "iconUrls" | "textColor"
>;

const OFFICIAL_LINE_PRESENTATION: Record<
  string,
  Pick<LineConfig, "color" | "textColor">
> = {
  "line-idfm-c01383": { color: "#6ec4e8", textColor: "#111827" },
  "metro-13": { color: "#6ec4e8", textColor: "#111827" },

  "line-idfm-c01374": { color: "#be418d", textColor: "#ffffff" },
  "metro-4": { color: "#be418d", textColor: "#ffffff" },

  "line-idfm-c01743": { color: "#4a90d9", textColor: "#ffffff" },
  "rer-b": { color: "#4a90d9", textColor: "#ffffff" },

  "line-idfm-c01742": { color: "#e2231a", textColor: "#ffffff" },
  "rer-a": { color: "#e2231a", textColor: "#ffffff" },

  "line-idfm-c01728": { color: "#008b5b", textColor: "#ffffff" },
  "rer-d": { color: "#008b5b", textColor: "#ffffff" },

  "line-idfm-c01739": { color: "#d6cd00", textColor: "#111827" },
  "transilien-j": { color: "#d6cd00", textColor: "#111827" },
  "train-j": { color: "#d6cd00", textColor: "#111827" },

  "line-idfm-c02528": { color: "#9acd32", textColor: "#10233f" },
  "tram-t10": { color: "#9acd32", textColor: "#10233f" },
  t10: { color: "#9acd32", textColor: "#10233f" },
};

export function createLinePresentation(
  source: LinePresentationSource,
): LinePresentation {
  const family = source.family ?? transitModeToFamily(source.mode);
  const official = resolveOfficialLinePresentation(source);
  const iconUrls = createRatpLineIconUrls({
    code: source.code ?? source.shortName,
    family,
    id: source.id,
    mode: normalizeTransitMode(source.mode),
    ref: source.ref,
  });

  return {
    color: normalizeHexColor(source.color) ?? official?.color ?? "#0064ff",
    textColor: normalizeHexColor(source.textColor) ?? official?.textColor ?? "#ffffff",
    iconUrl: iconUrls[0],
    iconUrls,
  };
}

export function transitModeToFamily(
  mode?: TransitMode | string,
): TransitFamily | undefined {
  const normalized = normalizeTransitMode(mode);

  if (normalized === "metro") return "METRO";
  if (normalized === "rer") return "RER";
  if (normalized === "tram") return "TRAM";
  if (normalized === "bus") return "BUS";
  if (normalized === "train") return "TRANSILIEN";

  return undefined;
}

export function transitFamilyToMode(family: TransitFamily): TransitMode {
  if (family === "METRO") return "metro";
  if (family === "TRAM") return "tram";
  if (family === "RER") return "rer";
  if (family === "BUS" || family === "NOCTILIEN") return "bus";

  return "train";
}

function resolveOfficialLinePresentation(
  source: LinePresentationSource,
): Pick<LineConfig, "color" | "textColor"> | undefined {
  const keys = [
    source.id,
    source.ref,
    source.code,
    source.shortName,
    source.mode && source.shortName ? `${source.mode}-${source.shortName}` : undefined,
    source.family && source.shortName ? `${source.family}-${source.shortName}` : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => createLinePresentationKeys(value));

  return keys.map((key) => OFFICIAL_LINE_PRESENTATION[key]).find(Boolean);
}

function createLinePresentationKeys(value: string): string[] {
  const normalized = normalizeKey(value);
  const code = value.match(/C\d{5}/iu)?.[0]?.toLowerCase();

  return [
    normalized,
    ...(code ? [code, `line-idfm-${code}`] : []),
  ];
}

function normalizeTransitMode(mode?: TransitMode | string): TransitMode | undefined {
  const normalized = normalizeKey(mode ?? "");

  if (normalized.includes("metro")) return "metro";
  if (normalized.includes("rer")) return "rer";
  if (normalized.includes("tram")) return "tram";
  if (normalized.includes("bus")) return "bus";
  if (normalized.includes("rail") || normalized.includes("train") || normalized.includes("transilien")) {
    return "train";
  }

  return undefined;
}

function normalizeHexColor(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  return trimmed.startsWith("#") ? trimmed.toLowerCase() : `#${trimmed.toLowerCase()}`;
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/giu, "-")
    .replace(/^-|-$/gu, "")
    .toLowerCase();
}
