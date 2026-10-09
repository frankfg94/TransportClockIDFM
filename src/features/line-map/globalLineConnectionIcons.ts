import type { GlobalMapLine } from "../transport-map/contracts/manifest";
import { createTransportLineSearchOption } from "../transport-map/overlays/ghostLineDirections";

/** One badge per passenger-facing line name and mode, regardless of source IDs. */
export function createGlobalLineConnectionIconEntries(lines: readonly GlobalMapLine[]) {
  const seen = new Set<string>();
  return lines.flatMap((line) => {
    const presentation = createTransportLineSearchOption(line);
    if (!presentation) return [];
    const key = `${line.mode}:${presentation.label.trim().toUpperCase()}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ line, presentation }];
  });
}
