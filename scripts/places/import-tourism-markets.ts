import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Window } from "happy-dom";
import { nearbyOpeningHours } from "../../src/features/nearby-stations/nearbyOpeningHours";
import type { MunicipalMarket } from "../../src/features/nearby-stations/neighborhood/municipalMarketInventory";
import { normalizeCityName, placeDistanceMeters, type CompiledPlacesCityFile, type CompiledPlacesManifest } from "../../src/services/places/compiledPlaces";

const TOURISM_LISTINGS: Record<string, { url: string; name: string }> = {
  "92": { url: "https://destination.hauts-de-seine.fr/les-marches-dans-les-hauts-de-seine.html", name: "Destination Hauts-de-Seine" },
};

type TourismMarket = {
  "@type"?: string[];
  name?: string;
  additionalProperty?: { name: string; value: string };
  address?: { streetAddress?: string };
  geo?: { latitude?: number; longitude?: number };
};

async function loadHtml(url: URL, document: Window["document"]) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok || new URL(response.url).origin !== url.origin) throw new Error(`Unavailable market page ${url}`);
  const charset = /charset=([\w-]+)/iu.exec(response.headers.get("content-type") ?? "")?.[1] ?? "utf-8";
  const template = document.createElement("template");
  template.innerHTML = new TextDecoder(charset).decode(await response.arrayBuffer());
  return template.content;
}

const marketName = /^(?:(?:le |les )?marche|halles?)\b/u;
const streetName = (address: string) => normalizeCityName(address.split(",")[0] ?? "")
  .replace(/^(?:\d+\s+)?(?:avenue|rue|place|boulevard|alle[eé])\s+/u, "");

export async function importTourismMarkets(department: string, document: Window["document"]): Promise<MunicipalMarket[]> {
  const source = TOURISM_LISTINGS[department];
  if (!source) return [];
  const listingUrl = new URL(source.url);
  const listing = await loadHtml(listingUrl, document);
  const links = [...listing.querySelectorAll("h3 a[href]")]
    .filter(link => marketName.test(normalizeCityName(link.textContent ?? "")))
    .map(link => new URL(link.getAttribute("href")!, listingUrl))
    .filter(url => url.origin === listingUrl.origin);
  const root = resolve("public/data/places");
  const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8")) as CompiledPlacesManifest;
  const results: MunicipalMarket[] = [];
  for (const url of links) {
    try {
      const page = await loadHtml(url, document);
      for (const script of page.querySelectorAll('script[type="application/ld+json"]')) {
        const linkedData = JSON.parse(script.textContent ?? "") as TourismMarket | TourismMarket[];
        for (const listing of Array.isArray(linkedData) ? linkedData : [linkedData]) {
          const { name, address, geo, additionalProperty } = listing;
          const cityCode = additionalProperty?.name === "codeCommune" ? additionalProperty.value : undefined;
          if (!name || !marketName.test(normalizeCityName(name)) || !listing["@type"]?.includes("Restaurant")
            || !cityCode?.startsWith(department) || !address?.streetAddress || !geo?.latitude || !geo.longitude) continue;
          const city = manifest.cities.find(city => city.code === cityCode);
          if (!city) continue;
          const assets = city.assetMetadata?.map(({ asset }) => asset) ?? city.assets ?? [city.asset];
          const candidates = (await Promise.all(assets.map(async asset =>
            (JSON.parse(await readFile(resolve(root, asset.replace(/^places\//u, "")), "utf8")) as CompiledPlacesCityFile).places))).flat()
            .filter(place => place.kind === "marketplace" && place.address && streetName(place.address) === streetName(address.streetAddress!)
              && placeDistanceMeters(place, { lat: geo.latitude!, lon: geo.longitude! }) <= 180);
          if (candidates.length !== 1) continue;
          const place = candidates[0]!;
          const openingHours = place.tags?.opening_hours;
          const sessions = openingHours && nearbyOpeningHours(openingHours);
          const sessionsPerWeek = sessions ? sessions.reduce((sum, day) => sum + day.intervals.length, 0) : 0;
          if (!sessionsPerWeek) continue;
          results.push({ id: `tourism-market:${cityCode}:${place.id}`, osmPlaceId: place.id,
            name, address: address.streetAddress.trim(), city: city.name, cityCode, lat: place.lat, lon: place.lon,
            openingHours, sessionsPerWeek, sourceUrl: url.href, sourceName: source.name });
        }
      }
    } catch (error) {
      console.warn(error instanceof Error ? error.message : String(error));
    }
  }
  return results;
}
