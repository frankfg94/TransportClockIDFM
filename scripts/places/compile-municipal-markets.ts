import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Window, type DocumentFragment } from "happy-dom";
import { normalizeCityName } from "../../src/services/places/compiledPlaces";
import { MUNICIPAL_MARKETS_ASSET, type MunicipalMarket } from "../../src/features/nearby-stations/neighborhood/municipalMarketInventory";
import { importTourismMarkets } from "./import-tourism-markets";

const DIRECTORY = "https://api-lannuaire.service-public.gouv.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records";
const GEOCODER = "https://data.geopf.fr/geocodage/search";
const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const OSM_DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const OSM_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ADDRESS = /^(?:adresse\s*:\s*)?(\d+\s*(?:(?:bis|ter|quater)\s+)?(?:rue|avenue|place|boulevard|allée|quai|cours|route|impasse|passage)\s+[^,.;]{3,85})(?:[,.]|$)/iu;
const FOOD = /\b(?:alimentaires?|primeurs?|fromagers?|poissonniers?|bouchers?|boulangers?|maraichers?|volaillers?|fruits|legumes|traiteurs?|producteurs?)\b/gu;

interface DirectoryRow { code_insee_commune: string; nom: string; site_internet: string }
interface WordPressPage { id: number; link: string; title: { rendered: string }; content: { rendered: string } }
interface MarketPage {
  name: string;
  address: string;
  openingHours?: string;
  sessionsPerWeek: number;
  areaM2?: number;
  listedTraders?: number;
}

function normalizeText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function marketSizeEvidence(content: DocumentFragment): Pick<MarketPage, "areaM2" | "listedTraders"> {
  const text = normalizeText(content.textContent ?? "");
  const areas = [...text.matchAll(/\b(?:surface|superficie)\s+du\s+marche\s*(?:de|est de|:)?\s*(\d+(?:[ .\u00a0\u202f]\d{3})*(?:,\d+)?)\s*m\s*(?:²|2)(?!\w)/gu)]
    .map(match => Number(match[1]!.replace(/[.\s]/gu, "").replace(",", ".")));
  const areaM2 = areas.length && areas.every(area => area === areas[0] && area > 0) ? areas[0] : undefined;
  const heading = [...content.querySelectorAll("h2, h3, h4")].find(node =>
    /^(?:les )?commercants du marche\s*:?$/u.test(normalizeText(node.textContent ?? "").trim()));
  const list = heading?.nextElementSibling;
  const entries = list?.matches("ul, ol") ? [...list.children].filter(node => node.matches("li") && node.textContent?.trim()).length
    : list?.matches("p") ? (list.textContent ?? "").split("\u000b").filter(line => /^\s*[•●]\s*\p{L}/u.test(line)).length : 0;
  return { ...(areaM2 ? { areaM2 } : {}), ...(entries ? { listedTraders: entries } : {}) };
}

function publishedHours(line: string, days: string[]): string | undefined {
  const timeRange = /(?:de\s+)?(\d{1,2})\s*[h:]\s*(\d{2})?\s*(?:a|-)\s*(\d{1,2})\s*[h:]\s*(\d{2})?(?:\s*\((?:de|d['’])\s*([a-z]+)\s+a\s+([a-z]+)\))?/gu;
  const clock = (hour: string, minute = "00") => `${hour.padStart(2, "0")}:${minute}`;
  const ranges = [...line.matchAll(timeRange)];
  if (!ranges.length) return undefined;
  const hours: string[] = [];
  for (const [, from, fromMinutes, until, untilMinutes, startMonth, endMonth] of ranges) {
    if (Number(from) > 23 || Number(until) > 23 || Number(fromMinutes ?? 0) > 59 || Number(untilMinutes ?? 0) > 59) return undefined;
    const start = OSM_MONTHS[MONTHS.indexOf(startMonth ?? "")];
    const end = OSM_MONTHS[MONTHS.indexOf(endMonth ?? "")];
    if ((ranges.length > 1 || startMonth || endMonth) && (!start || !end)) return undefined;
    hours.push(`${start && end ? `${start}-${end} ` : ""}${days.join(",")} ${clock(from!, fromMinutes)}-${clock(until!, untilMinutes)}`);
  }
  return hours.join("; ");
}

/** A numbered address and a recurring schedule must appear together, with food
 * evidence in the page. An unstructured or ambiguous page remains unknown. */
export function parseMunicipalMarketPage(page: WordPressPage, document: Window["document"]): MarketPage | undefined {
  const title = document.createElement("template");
  const body = document.createElement("template");
  title.innerHTML = page.title.rendered;
  body.innerHTML = page.content.rendered;
  const name = title.content.textContent?.trim()
    .replace(/^(?:le|les)\s+(?=marché)/iu, "").replace(/^marché/iu, "Marché");
  if (!name || !/^marché(?=\s|$)/iu.test(name) || /\b(?:publics?|noel|brocante|emploi|immobilier|ancien|provisoire)\b/u.test(normalizeText(name))) return undefined;
  body.content.querySelectorAll("script, style").forEach(node => node.remove());
  body.content.querySelectorAll("br").forEach(node => node.replaceWith(document.createTextNode("\u000b")));
  const terms = new Set(normalizeText(body.content.textContent ?? "").match(FOOD) ?? []);
  if (terms.size < 2) return undefined;
  const matches = [...body.content.querySelectorAll("p, li, address")].flatMap(block => {
    const lines = (block.textContent ?? "").split("\u000b").map(line => line.replace(/\s+/gu, " ").trim()).filter(Boolean);
    return lines.flatMap((line, index) => {
      const address = ADDRESS.exec(line)?.[1];
      if (!address) return [];
      const schedule = normalizeText(lines[index + 1] ?? "");
      const week = /^les\s+((?:(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?)(?:(?:\s*,\s*|\s+(?:et|&|puis)\s+)(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?)*)\b/u.exec(schedule);
      if (!week || /\b(?:premiers?|derniers?|mois|exceptionnellement)\b/u.test(schedule.split(/[,.]/u, 1)[0]!)) return [];
      const days = DAYS.flatMap((day, position) => new RegExp(`\\b${day}s?\\b`, "u").test(week[1]!) ? [OSM_DAYS[position]!] : []);
      return [{ name, address, sessionsPerWeek: days.length, openingHours: publishedHours(schedule, days) }];
    });
  });
  const unique = [...new Map(matches.map(market => [normalizeCityName(market.address), market])).values()];
  return unique.length === 1 ? { ...unique[0]!, ...marketSizeEvidence(body.content) } : undefined;
}

async function json<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url.hostname}`);
  return await response.json() as T;
}

function municipalSite(row: DirectoryRow): URL | undefined {
  const links = JSON.parse(row.site_internet) as { valeur?: string; libelle?: string }[];
  const website = links.find(link => !link.libelle && link.valeur)?.valeur ?? links[0]?.valeur;
  if (!website) return undefined;
  const url = new URL(website);
  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  return url;
}

async function geocode(address: string, city: string, cityCode: string) {
  const url = new URL(GEOCODER);
  url.search = new URLSearchParams({ q: `${address}, ${city}`, citycode: cityCode, type: "housenumber", limit: "3" }).toString();
  const result = await json<{ features: { geometry: { coordinates: [number, number] }; properties: { name?: string; citycode: string; type: string } }[] }>(url);
  const candidates = result.features.filter(({ properties }) => properties.type === "housenumber"
    && properties.citycode === cityCode && normalizeCityName(properties.name ?? "") === normalizeCityName(address));
  return candidates.length === 1 ? candidates[0]!.geometry.coordinates : undefined;
}

async function marketsIn(row: DirectoryRow, document: Window["document"]): Promise<MunicipalMarket[]> {
  const site = municipalSite(row);
  if (!site) return [];
  const city = row.nom.replace(/^Mairie\s*-\s*/iu, "");
  const cityCode = row.code_insee_commune;
  const search = new URL("/wp-json/wp/v2/search", site);
  search.search = new URLSearchParams({ search: "marché", type: "post", subtype: "page", per_page: "100", _fields: "id,title" }).toString();
  const pages = await json<{ id: number; title: string }[]>(search);
  const markets: MunicipalMarket[] = [];
  for (const hit of pages.filter(hit => /^(?:(?:le|les)\s+)?marché(?=\s|$)/iu.test(hit.title))) {
    const url = new URL(`/wp-json/wp/v2/pages/${hit.id}`, site);
    url.searchParams.set("_fields", "id,link,title,content");
    const page = await json<WordPressPage>(url);
    const market = parseMunicipalMarketPage(page, document);
    if (!market || new URL(page.link).origin !== site.origin) continue;
    const point = await geocode(market.address, city, cityCode);
    if (!point) continue;
    const [lon, lat] = point;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    markets.push({ ...market, id: `municipal-market:${cityCode}:${page.id}`, city, cityCode, lon, lat, sourceUrl: page.link });
  }
  return markets;
}

async function compile(department: string) {
  if (!/^\d{2}$/u.test(department)) throw new Error("Pass a two-digit department with --department=");
  const directory = new URL(DIRECTORY);
  directory.search = new URLSearchParams({
    where: `startswith(code_insee_commune, '${department}') AND pivot LIKE 'mairie'`,
    select: "code_insee_commune,nom,site_internet", limit: "100",
  }).toString();
  directory.searchParams.set("order_by", "code_insee_commune");
  const results: DirectoryRow[] = [];
  while (true) {
    directory.searchParams.set("offset", String(results.length));
    const page = await json<{ results: DirectoryRow[]; total_count: number }>(directory);
    if (!page.results.length && results.length < page.total_count) throw new Error("Incomplete directory response");
    results.push(...page.results);
    if (results.length >= page.total_count) break;
  }
  const window = new Window();
  const markets: MunicipalMarket[] = [];
  let scanned = 0;
  try {
    for (let i = 0; i < results.length; i += 3) {
      const settled = await Promise.allSettled(results.slice(i, i + 3).map(row => marketsIn(row, window.document)));
      for (const result of settled) {
        if (result.status !== "fulfilled") continue;
        scanned++;
        markets.push(...result.value);
      }
    }
    markets.push(...await importTourismMarkets(department, window.document).catch(error => {
      console.warn(error instanceof Error ? error.message : String(error));
      return [];
    }));
  } finally { await window.close(); }
  if (!markets.length) throw new Error(`No verified municipal markets from ${scanned}/${results.length} reachable sites`);
  const out = resolve("public", MUNICIPAL_MARKETS_ASSET.slice(1));
  const previous = await readFile(out, "utf8").then(source => JSON.parse(source) as { schemaVersion: number; markets: MunicipalMarket[] })
    .catch(error => {
      if (error?.code === "ENOENT") return undefined;
      throw error;
    });
  if (previous && (previous.schemaVersion !== 1 || !Array.isArray(previous.markets))) throw new Error("Invalid existing market inventory");
  const combined = [...(previous?.markets ?? []).filter(market => !market.cityCode.startsWith(department)), ...markets];
  combined.sort((a, b) => a.cityCode.localeCompare(b.cityCode) || a.id.localeCompare(b.id));
  await mkdir(dirname(out), { recursive: true });
  const temporary = `${out}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ schemaVersion: 1, markets: combined }, null, 2) + "\n");
  await rename(temporary, out);
  console.log(`Published ${markets.length} municipal markets from ${scanned}/${results.length} sites for department ${department}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const department = process.argv.find(arg => arg.startsWith("--department="))?.split("=")[1] ?? "";
  compile(department).catch(error => { console.error(error.message); process.exitCode = 1; });
}
