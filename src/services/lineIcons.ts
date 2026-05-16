import type { TransitFamily, TransitMode } from "../types/transit";

interface LineIconSource {
  code?: string;
  family?: TransitFamily;
  id?: string;
  mode?: TransitMode;
  ref?: string;
}

export function createRatpLineIconUrls(source: LineIconSource): string[] {
  const family = source.family ?? transitModeToFamily(source.mode);
  const lineCode = getLineCode(source);
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

function getLineCode(source: LineIconSource): string | undefined {
  const rawCode =
    source.id?.split(":").pop() ??
    source.ref?.match(/Line::([^:]+):/u)?.[1] ??
    source.code;

  return rawCode?.replace(/^LIGIDFM/u, "").trim();
}

function transitModeToFamily(mode?: TransitMode): TransitFamily | undefined {
  if (mode === "metro") {
    return "METRO";
  }

  if (mode === "rer") {
    return "RER";
  }

  if (mode === "tram") {
    return "TRAM";
  }

  if (mode === "bus") {
    return "BUS";
  }

  if (mode === "train") {
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

