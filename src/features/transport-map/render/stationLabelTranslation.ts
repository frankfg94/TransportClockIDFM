import type { TransportMapLabelRenderRecord } from "./transportMapRenderModel";
import { measureTransportMapLabelTextWidth } from "./stationLabelPlacement";

export const STATION_LABEL_TRANSLATION_DURATION_MS = 500;

/** Match by station ID so data order changes cannot swap animated names. */
export function interpolateStationLabelTranslation(
  from: readonly TransportMapLabelRenderRecord[],
  to: readonly TransportMapLabelRenderRecord[],
  progress: number,
): readonly TransportMapLabelRenderRecord[] {
  if (progress >= 1) return to;
  const t = Math.max(0, progress);
  const eased = t * t * (3 - 2 * t);
  const fromById = new Map(from.map((label) => [label.id, label]));
  const toIds = new Set(to.map((label) => label.id));
  const result = to.map((target) => {
    if (!target.id.startsWith("station-label:")) return target;
    const source = fromById.get(target.id);
    if (!source || source.text !== target.text) return withOpacity(target, eased);
    const startOffset = source.pixelOffsetCssPx ?? [0, 0];
    const endOffset = target.pixelOffsetCssPx ?? [0, 0];
    const width = measureTransportMapLabelTextWidth(target.text, target.sizeCssPx);
    const sourceAnchor = anchorFactor(source.textAnchor);
    const targetAnchor = anchorFactor(target.textAnchor);
    // Changing 'end' to 'start' must not instantly move a whole text width.
    const startX = startOffset[0] + width * (targetAnchor - sourceAnchor);
    return {
      ...target,
      pixelOffsetCssPx: [
        startX + (endOffset[0] - startX) * eased,
        startOffset[1] + (endOffset[1] - startOffset[1]) * eased,
      ] as const,
      color: [target.color[0], target.color[1], target.color[2], source.color[3] + (target.color[3] - source.color[3]) * eased] as const,
    };
  });
  // Generic decluttering can omit names: fade them out instead of dropping
  // them on the first frame of the return translation.
  for (const source of from) {
    if (source.id.startsWith("station-label:") && !toIds.has(source.id)) {
      result.push(withOpacity(source, 1 - eased));
    }
  }
  return result;
}

function anchorFactor(anchor: TransportMapLabelRenderRecord["textAnchor"]): number {
  return anchor === "end" ? 1 : anchor === "middle" ? .5 : 0;
}

function withOpacity(label: TransportMapLabelRenderRecord, opacity: number): TransportMapLabelRenderRecord {
  return { ...label, color: [label.color[0], label.color[1], label.color[2], label.color[3] * opacity] };
}
