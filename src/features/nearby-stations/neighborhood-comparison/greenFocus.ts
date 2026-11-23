import type { GreenMapReference, GreenPoint } from "../../../../shared/natureInCity";

export type GreenCommuneMapReference = Extract<GreenMapReference, { scope: "commune" }>;
export interface NatureCommuneFocus {
  reference: GreenCommuneMapReference;
  communeName: string;
  origin?: GreenPoint;
}

function firstString(value: unknown): string | undefined {
  return typeof value === "string" ? value : Array.isArray(value) && typeof value[0] === "string" ? value[0] : undefined;
}

export function buildNatureCommuneFocusUrl(reference: GreenCommuneMapReference, communeName: string, origin?: GreenPoint): string {
  const query = new URLSearchParams({ focus: `nature:commune:${reference.code}`, version: reference.version, communeName });
  if (origin) { query.set("originLat", String(origin.lat)); query.set("originLon", String(origin.lon)); }
  return `/map?${query.toString()}`;
}

export function parseNatureCommuneFocusQuery(query: Record<string, unknown>): NatureCommuneFocus | undefined {
  const match = firstString(query.focus)?.match(/^nature:commune:(\d{5})$/u);
  const version = firstString(query.version);
  if (!match || !version || !/^[a-f0-9]{24}$/u.test(version)) return undefined;
  const rawLat = Number(firstString(query.originLat));
  const rawLon = Number(firstString(query.originLon));
  const origin = Number.isFinite(rawLat) && Math.abs(rawLat) <= 90 && Number.isFinite(rawLon) && Math.abs(rawLon) <= 180
    ? { lat: rawLat, lon: rawLon } : undefined;
  return {
    reference: { scope: "commune", code: match[1]!, version },
    communeName: firstString(query.communeName) || match[1]!,
    origin,
  };
}
