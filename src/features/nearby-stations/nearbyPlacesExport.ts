import {
  nearbyPlaceWalkingDistanceMeters,
  type NearbyPlaceIconId,
  type NearbyWalkingMinutes,
} from "./nearbyPlacePresentation";
import type { NearbyPlace } from "./nearbyPlaces";
import type { NearbyWalkingRoute } from "./nearbyWalkingRoutes";
import type { NearbyWalkingLoadProgress } from "./useNearbyWalkingRoutes";

export interface NearbyPlacesExportCopy {
  locale: "fr" | "en";
  eyebrow: string;
  title: string;
  searchLabel: string;
  searchPlaceholder: string;
  summary: string;
  summaryTemplate: string;
  resultsLabel: string;
  loading: string;
  error: string;
  noSubcategoryResults: string;
  openInGoogleMaps: string;
  radiusLabel: string;
  fiveMinutes: string;
  tenMinutes: string;
  fifteenMinutes: string;
  premiumRequired: string;
}

export interface NearbyPlacesExportPayload {
  places: readonly NearbyPlace[];
  walkingMinutes: NearbyWalkingMinutes;
  originCity?: string;
  query?: string;
  selectedPlaceId?: string;
  preserveSelectedPlaceOutsideRadius?: boolean;
  walkingRoutes?: Readonly<Record<string, NearbyWalkingRoute | undefined>>;
  walkingProgress?: Readonly<Record<string, NearbyWalkingLoadProgress | undefined>>;
  loadingGroupIds?: readonly string[];
  initialPreloadGroupCount?: number;
  loading?: boolean;
  error?: string;
}

export interface NearbyPlacesExportItem {
  id: string;
  name: string;
  type: string;
  address?: string;
  distanceMeters: number;
  walkingMinutes: number;
  walkingTime: string;
  googleMapsUrl: string;
  selected: boolean;
  commerce?: boolean;
}

export interface NearbyPlacesExportSection {
  id: string;
  label: string;
  icon: NearbyPlaceIconId;
  tone: string;
  expanded: boolean;
  places: readonly NearbyPlacesExportItem[];
}

const MAX_FREE_EXPORT_MINUTES = 10;
const MAX_FREE_EXPORT_RADIUS_METERS = MAX_FREE_EXPORT_MINUTES * 80;
const EXPORT_TONE_IDS = new Set([
  "green",
  "orange",
  "teal",
  "pink",
  "brown",
  "violet",
  "red",
  "blue",
  "indigo",
  "purple",
  "amber",
  "slate",
]);

const LUCIDE_ICON_CONTENT: Readonly<Record<NearbyPlaceIconId, string>> = {
  basket: `<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>`,
  utensils: `<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>`,
  health: `<path d="M4 9a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h4a1 1 0 0 1 1 1v4a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2v-4a1 1 0 0 1 1-1h4a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-4a1 1 0 0 1-1-1V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4a1 1 0 0 1-1 1z"/>`,
  education: `<path d="m22 10-10-5-10 5 10 5 10-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/><path d="M22 10v6"/>`,
  "tree-pine": `<path d="m17 14 3 4h-4l3 4H5l3-4H4l3-4H4l5-6H6l6-6 6 6h-3l5 6z"/><path d="M12 22v-3"/>`,
  shirt: `<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>`,
  "home-garden": `<path d="M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1M9 8a3 3 0 1 0 3 3M9 8h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1"/><circle cx="12" cy="8" r="2"/><path d="M12 10v12"/><path d="M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z"/><path d="M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z"/>`,
  toys: `<line x1="6" x2="10" y1="11" y2="11"/><line x1="8" x2="8" y1="9" y2="13"/><line x1="15" x2="15.01" y1="12" y2="12"/><line x1="18" x2="18.01" y1="10" y2="10"/><path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>`,
  car: `<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>`,
  "home-tech": `<path d="M18 5a2 2 0 0 1 2 2v8.526a2 2 0 0 0 .212.897l1.068 2.127a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45l1.068-2.127A2 2 0 0 0 4 15.526V7a2 2 0 0 1 2-2z"/><path d="M20.054 15.987H3.946"/>`,
  briefcase: `<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>`,
  culture: `<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>`,
  landmark: `<path d="M10 18v-7"/><path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>`,
  sparkles: `<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>`,
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function lucideIcon(icon: NearbyPlaceIconId, size: number, className: string): string {
  return `<svg aria-hidden="true" class="${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">${LUCIDE_ICON_CONTENT[icon] ?? LUCIDE_ICON_CONTENT.sparkles}</svg>`;
}

function exportToneClass(tone: string): string {
  return EXPORT_TONE_IDS.has(tone) ? tone : "slate";
}

const CHEVRON_DOWN_ICON = `<svg aria-hidden="true" class="nearby-directory-export__chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>`;
const EXTERNAL_LINK_ICON = `<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`;
const LOCK_ICON = `<svg aria-hidden="true" class="nearby-directory-export__lock-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><rect width="18" height="11" x="3" y="10" rx="2"/><path d="M7 10V7a5 5 0 0 1 10 0v3"/></svg>`;

function safeHttpUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return escapeHtml(url.href);
  } catch {
    return "";
  }
}

function safePayload(payload: NearbyPlacesExportPayload): NearbyPlacesExportPayload {
  const places = payload.places.filter((place) =>
    nearbyPlaceWalkingDistanceMeters(place, payload.walkingRoutes?.[place.id]) <= MAX_FREE_EXPORT_RADIUS_METERS,
  );
  const placeIds = new Set(places.map((place) => place.id));
  const walkingRoutes = payload.walkingRoutes
    ? Object.fromEntries(
        Object.entries(payload.walkingRoutes).filter(([placeId]) => placeIds.has(placeId)),
      )
    : undefined;

  return {
    ...payload,
    places,
    walkingMinutes: payload.walkingMinutes === 5 ? 5 : 10,
    selectedPlaceId: payload.selectedPlaceId && placeIds.has(payload.selectedPlaceId)
      ? payload.selectedPlaceId
      : undefined,
    walkingRoutes,
  };
}

function serializePayload(payload: NearbyPlacesExportPayload): string {
  return JSON.stringify(payload)
    .replace(/</gu, "\\u003c")
    .replace(/>/gu, "\\u003e")
    .replace(/&/gu, "\\u0026")
    .replace(/\u2028/gu, "\\u2028")
    .replace(/\u2029/gu, "\\u2029");
}

function renderPlace(
  item: NearbyPlacesExportItem,
  groupIcon: NearbyPlaceIconId,
  googleMapsLabel: string,
): string {
  const googleMapsUrl = safeHttpUrl(item.googleMapsUrl);
  const link = googleMapsUrl
    ? `<a class="nearby-directory-export__place-google" href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(item.name)} — ${escapeHtml(googleMapsLabel)}" title="${escapeHtml(googleMapsLabel)}">${EXTERNAL_LINK_ICON}</a>`
    : "";

  return `<li class="nearby-directory-export__place-row${item.selected ? " nearby-directory-export__place-row--selected" : ""}" data-place-id="${escapeHtml(item.id)}" data-distance-meters="${item.distanceMeters}" data-commerce="${item.commerce ? "true" : "false"}" data-search="${escapeHtml(`${item.name} ${item.type} ${item.address ?? ""}`.toLocaleLowerCase())}">
  <span class="nearby-directory-export__place-icon">${lucideIcon(groupIcon, 16, "nearby-directory-export__place-icon-svg")}</span>
  <div class="nearby-directory-export__place-copy">
    <strong>${escapeHtml(item.name)}</strong>
    <span class="nearby-directory-export__place-type">${escapeHtml(item.type)}</span>
  </div>
  <span class="nearby-directory-export__place-walk">${escapeHtml(item.walkingTime)}</span>
  ${link}
</li>`;
}

function renderSections(
  sections: readonly NearbyPlacesExportSection[],
  googleMapsLabel: string,
): string {
  if (sections.every((section) => section.places.length === 0)) {
    return "";
  }

  return sections
    .filter((section) => section.places.length > 0)
    .map((section) => {
      const contentId = `nearby-directory-export-group-${section.id}`;
      return `<article class="nearby-directory-export__group nearby-directory-export__group--${exportToneClass(section.tone)}" data-group-id="${escapeHtml(section.id)}">
  <h2>
    <button type="button" class="nearby-directory-export__group-toggle" data-group-toggle aria-expanded="${section.expanded ? "true" : "false"}" aria-controls="${escapeHtml(contentId)}">
      <span class="nearby-directory-export__group-icon">${lucideIcon(section.icon, 18, "nearby-directory-export__group-icon-svg")}</span>
      <span class="nearby-directory-export__group-title">${escapeHtml(section.label)}</span>
      <span class="nearby-directory-export__group-count" data-group-count>${section.places.length}</span>
      ${CHEVRON_DOWN_ICON}
    </button>
  </h2>
  <div id="${escapeHtml(contentId)}" data-group-content class="nearby-directory-export__group-content"${section.expanded ? "" : " hidden"}>
    <ul>${section.places.map((place) => renderPlace(place, section.icon, googleMapsLabel)).join("")}</ul>
  </div>
</article>`;
    })
    .join("");
}

/**
 * Build a standalone snapshot from the component props. The payload is kept
 * in JSON so the export has the same source data as the component, but it is
 * sanitized first: places and walking routes beyond 10 minutes are never
 * written to the file. Client-side HTML cannot hide data from its reader, so
 * this boundary is the actual protection for the paid 15-minute radius.
 */
export function buildNearbyPlacesExportHtml(
  copy: NearbyPlacesExportCopy,
  payload: NearbyPlacesExportPayload,
  sections: readonly NearbyPlacesExportSection[],
): string {
  const exportPayload = safePayload(payload);
  const allowedPlaceIds = new Set(exportPayload.places.map((place) => place.id));
  const exportSections = sections.map((section) => ({
    ...section,
    places: section.places.filter((place) => allowedPlaceIds.has(place.id)),
  }));
  const query = exportPayload.query ?? "";
  const hasExportResults = exportSections.some((section) => section.places.length > 0);
  const stateMarkup = exportPayload.loading
    ? `<div class="nearby-directory-export__state"><strong>${escapeHtml(copy.loading)}</strong></div>`
    : exportPayload.error
      ? `<div class="nearby-directory-export__state nearby-directory-export__state--error"><strong>${escapeHtml(copy.error)}</strong><span>${escapeHtml(exportPayload.error)}</span></div>`
      : `<div class="nearby-directory-export__groups">${renderSections(exportSections, copy.openInGoogleMaps)}<p class="nearby-directory-export__empty-results" data-export-empty-results${hasExportResults ? " hidden" : ""}>${escapeHtml(copy.noSubcategoryResults)}</p></div>`;

  return `<!doctype html>
<html lang="${escapeHtml(copy.locale)}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(copy.title)}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      html { min-height: 100%; width: 100%; }
      * { box-sizing: border-box; }
      body { background: #f7f8fc; color: #10233f; margin: 0; min-height: 100vh; overflow-x: hidden; padding: 0; width: 100%; }
      .nearby-directory-export { background: #f7f8fc; border: 0; border-radius: 0; box-shadow: none; margin: 0; max-width: none; min-height: 100vh; overflow: hidden; width: 100%; }
      .nearby-directory-export__header { align-items: center; background: #fff; border-bottom: 1px solid rgba(16,35,63,.1); display: flex; flex-wrap: wrap; gap: 10px; justify-content: space-between; padding: 10px clamp(12px, 2.5vw, 32px); }
      .nearby-directory-export__header > div { min-width: 0; }
      .nearby-directory-export__eyebrow { color: #5146ff; font-size: .6rem; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
      h1 { font-size: clamp(1.05rem, 2vw, 1.35rem); line-height: 1.05; margin: 3px 0 0; }
      .nearby-directory-export__body { display: grid; gap: 12px; padding: 12px clamp(12px, 2.5vw, 32px) 24px; width: 100%; }
      .nearby-directory-export__toolbar { align-items: center; display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; min-width: 0; }
      .nearby-directory-export__search { align-items: center; background: #fff; border: 1px solid rgba(16,35,63,.14); border-radius: 8px; display: flex; flex: 1 1 360px; height: 32px; max-height: 40px; min-height: 32px; min-width: min(100%, 280px); overflow: hidden; padding: 0 8px; }
      .nearby-directory-export__search input { background: transparent; border: 0; color: #10233f; flex: 1 1 auto; font: inherit; font-size: .72rem; min-width: 0; outline: 0; width: 100%; }
      .nearby-directory-export__radius { align-items: center; background: #f1efff; border-radius: 11px; color: #5146ff; display: flex; flex: 0 1 auto; gap: 3px; max-width: 100%; padding: 4px; }
      .nearby-directory-export__radius-label { font-size: .68rem; font-weight: 800; margin: 0 6px; }
      .nearby-directory-export__radius button { background: transparent; border: 0; border-radius: 7px; color: #5e6480; font: inherit; font-size: .68rem; min-height: 28px; padding: 4px 8px; }
      .nearby-directory-export__radius button.is-active { background: #5146ff; color: #fff; }
      .nearby-directory-export__radius button:disabled { align-items: center; color: #8b91a7; cursor: not-allowed; display: inline-flex; gap: 5px; opacity: .85; }
      .nearby-directory-export__lock-icon { height: 14px; width: 14px; }
      .nearby-directory-export__summary { color: #64748b; font-size: .72rem; font-weight: 800; margin: 0; }
      .nearby-directory-export__groups { align-items: start; display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); }
      .nearby-directory-export__group { --directory-export-tone: #64748b; --directory-export-tone-soft: rgba(100,116,139,.12); background: #fff; border: 1px solid rgba(16,35,63,.09); border-radius: 9px; min-width: 0; overflow: hidden; }
      .nearby-directory-export__group--green { --directory-export-tone: #17864c; --directory-export-tone-soft: rgba(23,134,76,.12); }
      .nearby-directory-export__group--orange { --directory-export-tone: #e16919; --directory-export-tone-soft: rgba(225,105,25,.12); }
      .nearby-directory-export__group--teal { --directory-export-tone: #0f8e8a; --directory-export-tone-soft: rgba(15,142,138,.12); }
      .nearby-directory-export__group--pink { --directory-export-tone: #cf3d78; --directory-export-tone-soft: rgba(207,61,120,.12); }
      .nearby-directory-export__group--brown { --directory-export-tone: #9a5a22; --directory-export-tone-soft: rgba(154,90,34,.12); }
      .nearby-directory-export__group--violet { --directory-export-tone: #8147bd; --directory-export-tone-soft: rgba(129,71,189,.12); }
      .nearby-directory-export__group--red { --directory-export-tone: #c23a45; --directory-export-tone-soft: rgba(194,58,69,.12); }
      .nearby-directory-export__group--blue { --directory-export-tone: #2474c8; --directory-export-tone-soft: rgba(36,116,200,.12); }
      .nearby-directory-export__group--indigo { --directory-export-tone: #5146ff; --directory-export-tone-soft: rgba(81,70,255,.12); }
      .nearby-directory-export__group--purple { --directory-export-tone: #7c3db5; --directory-export-tone-soft: rgba(124,61,181,.12); }
      .nearby-directory-export__group--amber { --directory-export-tone: #b77910; --directory-export-tone-soft: rgba(183,121,16,.12); }
      .nearby-directory-export__group h2 { margin: 0; padding: 0; }
      .nearby-directory-export__group-toggle { align-items: center; background: #fff; border: 0; color: #10233f; cursor: pointer; display: grid; gap: 7px; grid-template-columns: 24px minmax(0,1fr) auto 18px; min-height: 36px; padding: 5px 8px; text-align: left; width: 100%; }
      .nearby-directory-export__group-toggle:hover, .nearby-directory-export__group-toggle:focus-visible { background: #fafaff; }
      .nearby-directory-export__group-icon { align-items: center; background: var(--directory-export-tone-soft); border-radius: 50%; color: var(--directory-export-tone); display: flex; height: 24px; justify-content: center; width: 24px; }
      .nearby-directory-export__group-title { font-size: .76rem; font-weight: 900; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .nearby-directory-export__group-count { background: var(--directory-export-tone-soft); border-radius: 999px; color: var(--directory-export-tone); font-size: .62rem; padding: 2px 6px; }
      .nearby-directory-export__chevron { color: var(--directory-export-tone); transition: transform 180ms ease; }
      .nearby-directory-export__group-toggle[aria-expanded="true"] .nearby-directory-export__chevron { transform: rotate(180deg); }
      .nearby-directory-export__group-content { border-top: 1px solid rgba(16,35,63,.08); display: grid; grid-template-rows: 1fr; opacity: 1; overflow: hidden; transition: grid-template-rows 220ms ease, opacity 180ms ease, border-top-color 220ms ease; }
      .nearby-directory-export__group-content > ul { min-height: 0; overflow: hidden; }
      .nearby-directory-export__group-content[hidden] { border-top-color: transparent; display: grid; grid-template-rows: 0fr; opacity: 0; }
      .nearby-directory-export--initializing .nearby-directory-export__group-content { transition: none; }
      @media (prefers-reduced-motion: reduce) { .nearby-directory-export__group-content { transition: none; } }
      .nearby-directory-export__group ul { display: grid; gap: 0 6px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); list-style: none; margin: 0; padding: 0 6px; }
      .nearby-directory-export__place-row { align-items: center; border-bottom: 1px solid rgba(16,35,63,.07); display: grid; gap: 6px; grid-template-columns: 22px minmax(0,1fr) auto 24px; min-height: 34px; padding: 3px 2px; }
      .nearby-directory-export__place-row--selected { background: var(--directory-export-tone-soft); }
      .nearby-directory-export__place-row:last-child { border-bottom: 0; }
      .nearby-directory-export__place-icon { align-items: center; background: var(--directory-export-tone-soft); border-radius: 50%; color: var(--directory-export-tone); display: flex; height: 22px; justify-content: center; width: 22px; }
      .nearby-directory-export__place-copy { align-items: center; display: flex; gap: 7px; line-height: 1.1; min-width: 0; }
      .nearby-directory-export__place-copy strong { flex: 1 1 auto; font-size: .7rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .nearby-directory-export__place-type { color: var(--directory-export-tone); flex: 0 1 42%; font-size: .61rem; max-width: 42%; overflow: hidden; text-align: right; text-overflow: ellipsis; white-space: nowrap; }
      .nearby-directory-export__place-walk { color: var(--directory-export-tone); font-size: .62rem; font-weight: 850; max-width: 100%; white-space: nowrap; }
      .nearby-directory-export__place-google { align-items: center; color: var(--directory-export-tone); display: flex; justify-content: center; text-align: center; text-decoration: none; }
      .nearby-directory-export__empty-results, .nearby-directory-export__state { color: #64748b; padding: 30px 18px; text-align: center; }
      .nearby-directory-export__state strong { color: #10233f; display: block; }
      .nearby-directory-export__state--error { color: #b42318; }
      .sr-only { height: 1px; margin: -1px; overflow: hidden; position: absolute; width: 1px; }
      @media (max-width: 700px) { .nearby-directory-export__header, .nearby-directory-export__body { padding-left: 16px; padding-right: 16px; } .nearby-directory-export__toolbar { align-items: stretch; flex-direction: column; } .nearby-directory-export__search, .nearby-directory-export__search input, .nearby-directory-export__radius { width: 100%; } .nearby-directory-export__search { flex: 0 0 32px; height: 32px; max-height: 40px; } .nearby-directory-export__search input { min-width: 0; } .nearby-directory-export__radius { justify-content: stretch; } .nearby-directory-export__radius button { flex: 1 1 0; min-width: 0; } .nearby-directory-export__groups, .nearby-directory-export__group ul { grid-template-columns: 1fr; } }
      @media (max-width: 420px) { .nearby-directory-export__header { align-items: stretch; flex-direction: column; } .nearby-directory-export__group-toggle { gap: 6px; grid-template-columns: 24px minmax(0,1fr) auto 16px; padding-left: 6px; padding-right: 6px; } .nearby-directory-export__place-row { gap: 5px; grid-template-columns: 20px minmax(0,1fr) 22px; } .nearby-directory-export__place-icon { height: 20px; width: 20px; } .nearby-directory-export__place-walk { grid-column: 2; justify-self: start; } .nearby-directory-export__place-google { grid-column: 3; grid-row: 1 / span 2; } }
    </style>
  </head>
  <body>
    <main class="nearby-directory-export" aria-labelledby="nearby-directory-export-title">
      <header class="nearby-directory-export__header">
        <div>
          <div class="nearby-directory-export__eyebrow">${escapeHtml(copy.eyebrow)}</div>
          <h1 id="nearby-directory-export-title">${escapeHtml(copy.title)}</h1>
        </div>
      </header>
      <div class="nearby-directory-export__body">
        <div class="nearby-directory-export__toolbar">
          <label class="nearby-directory-export__search">
            <span class="sr-only">${escapeHtml(copy.searchLabel)}</span>
            <input type="search" aria-label="${escapeHtml(copy.searchLabel)}" placeholder="${escapeHtml(copy.searchPlaceholder)}" value="${escapeHtml(query)}">
          </label>
          <div class="nearby-directory-export__radius" role="group" aria-label="${escapeHtml(copy.radiusLabel)}">
            <span class="nearby-directory-export__radius-label">${escapeHtml(copy.radiusLabel)}</span>
            <button type="button" data-radius="5"${exportPayload.walkingMinutes === 5 ? " class=\"is-active\" aria-pressed=\"true\"" : " aria-pressed=\"false\""}>${escapeHtml(copy.fiveMinutes)}</button>
            <button type="button" data-radius="10"${exportPayload.walkingMinutes === 10 ? " class=\"is-active\" aria-pressed=\"true\"" : " aria-pressed=\"false\""}>${escapeHtml(copy.tenMinutes)}</button>
            <button type="button" data-radius="15" disabled aria-disabled="true" aria-pressed="false" title="${escapeHtml(copy.premiumRequired)}">
              ${LOCK_ICON}<span>${escapeHtml(copy.fifteenMinutes)}</span>
            </button>
          </div>
        </div>
        <p class="nearby-directory-export__summary" data-export-summary data-summary-template="${escapeHtml(copy.summaryTemplate)}">${escapeHtml(copy.summary)}</p>
        <section class="nearby-directory-export__results" aria-label="${escapeHtml(copy.resultsLabel)}">
          ${stateMarkup}
        </section>
        <script id="nearby-directory-export-payload" type="application/json">${serializePayload(exportPayload)}</script>
      </div>
    </main>
    <script>
      (() => {
        const root = document.querySelector(".nearby-directory-export");
        if (!root) return;
        root.classList.add("nearby-directory-export--initializing");
        const search = root.querySelector("input[type=search]");
        const buttons = Array.from(root.querySelectorAll("[data-radius]:not([disabled])"));
        const rows = Array.from(root.querySelectorAll("[data-place-id]"));
        const groups = Array.from(root.querySelectorAll("[data-group-id]"));
        const accordionGroups = groups.map((group) => ({
          group,
          toggle: group.querySelector("[data-group-toggle]"),
          content: group.querySelector("[data-group-content]"),
        }));
        const isMobile = window.matchMedia
          ? window.matchMedia("(max-width: 700px)").matches
          : window.innerWidth <= 700;
        if (isMobile) {
          accordionGroups.forEach(({ toggle, content }) => {
            toggle?.setAttribute("aria-expanded", "false");
            if (content) content.hidden = true;
          });
        }
        root.classList.remove("nearby-directory-export--initializing");
        const empty = root.querySelector("[data-export-empty-results]");
        const summary = root.querySelector("[data-export-summary]");
        const summaryTemplate = summary?.dataset.summaryTemplate || "";
        const normalize = (value) => value.normalize("NFD").replace(/[\\u0300-\\u036f]/gu, "").toLocaleLowerCase();
        let radius = Number(root.querySelector("[data-radius].is-active")?.dataset.radius || "10");
        const applyFilters = () => {
          const query = normalize((search?.value || "").trim());
          let visibleCount = 0;
          let visibleCommerceCount = 0;
          rows.forEach((row) => {
            const matchesRadius = Number(row.dataset.distanceMeters || "0") <= radius * 80;
            const matchesQuery = !query || normalize(row.dataset.search || "").includes(query);
            row.hidden = !(matchesRadius && matchesQuery);
            if (!row.hidden) {
              visibleCount += 1;
              if (row.dataset.commerce === "true") visibleCommerceCount += 1;
            }
          });
          groups.forEach((group) => {
            const visibleRows = group.querySelectorAll("[data-place-id]:not([hidden])");
            group.hidden = visibleRows.length === 0;
            const count = group.querySelector("[data-group-count]");
            if (count) count.textContent = String(visibleRows.length);
            const accordion = accordionGroups.find((candidate) => candidate.group === group);
            if (query && visibleRows.length > 0 && accordion?.toggle && accordion.content) {
              accordion.toggle.setAttribute("aria-expanded", "true");
              accordion.content.hidden = false;
            }
          });
          if (empty) empty.hidden = visibleCount > 0;
          if (summary && summaryTemplate) {
            summary.textContent = summaryTemplate
              .replace("{total}", String(visibleCount))
              .replace("{commerce}", String(visibleCommerceCount))
              .replace("{count}", String(visibleCount))
              .replace("{minutes}", String(radius));
          }
          buttons.forEach((button) => {
            const active = Number(button.dataset.radius) === radius;
            button.classList.toggle("is-active", active);
            button.setAttribute("aria-pressed", String(active));
          });
        };
        buttons.forEach((button) => button.addEventListener("click", () => {
          radius = Number(button.dataset.radius || "10");
          applyFilters();
        }));
        accordionGroups.forEach(({ toggle, content }) => toggle?.addEventListener("click", () => {
          const expanded = toggle.getAttribute("aria-expanded") === "true";
          toggle.setAttribute("aria-expanded", String(!expanded));
          if (content) content.hidden = expanded;
        }));
        search?.addEventListener("input", applyFilters);
        applyFilters();
      })();
    </script>
  </body>
</html>`;
}

export const nearbyPlacesExportPolicy = {
  maxMinutes: MAX_FREE_EXPORT_MINUTES,
  maxRadiusMeters: MAX_FREE_EXPORT_RADIUS_METERS,
} as const;
