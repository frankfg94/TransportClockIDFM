import { mkdir, readFile, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeCompiledPlace, type OverpassElement } from '../../src/services/places/compiledPlaces';
import { elementFootprintRings, elementAreaSquareMeters } from '../../src/services/places/placeSurface';
import { groupBuildingFootprints } from '../../src/services/places/buildingFootprintGroups';

// Dedicated regional geometry pack: no general POI payload inflation.
const root = resolve('public/data/place-footprints');
const endpoint = process.argv.find(arg => arg.startsWith('--endpoint='))?.slice(11)
  ?? process.env.PLACES_OVERPASS_URL ?? 'http://127.0.0.1:12345/api/interpreter';
const query = `[out:json][timeout:180][maxsize:536870912];area["ISO3166-2"="FR-IDF"]->.region;(
  wr["shop"~"^(supermarket|hypermarket|mall|shopping_centre)$"](area.region);
  wr["leisure"~"^(park|garden)$"](area.region);
  wr["landuse"="forest"](area.region);
  wr["natural"="wood"](area.region);
)->.places;(.places;rel(bw.places)["type"="building"];);out body geom qt;`;
await mkdir(root, { recursive: true });
const cache = resolve('.data/place-footprints-overpass.json');
let payload: { elements: OverpassElement[]; remark?: string; buildingGroupsIncluded?: boolean };
if (process.argv.includes('--cached')) payload = JSON.parse(await readFile(cache, 'utf8'));
else {
  const response = await fetch(endpoint, { method: 'POST', headers: { accept: 'application/json', 'user-agent': 'TransportClockGPT/0.1 (regional footprint compiler)', 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(240_000) });
  if (!response.ok) throw new Error(`Overpass HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  payload = await response.json();
  if (!Array.isArray(payload.elements) || payload.remark) throw new Error(`Incomplete Overpass: ${payload.remark}`);
  payload.buildingGroupsIncluded = true;
  await mkdir(resolve('.data'), { recursive: true });
  await writeFile(cache, JSON.stringify(payload));
}
if (!payload.buildingGroupsIncluded) throw new Error('This cached snapshot predates building relations. Compile once without --cached.');
const groupElements = payload.elements;
const rawPlaces = payload.elements.flatMap(element => {
  const bounds = (element as OverpassElement & { bounds?: { minlat: number; maxlat: number; minlon: number; maxlon: number } }).bounds;
  const center = element.center ?? (bounds ? { lat: (bounds.minlat + bounds.maxlat) / 2, lon: (bounds.minlon + bounds.maxlon) / 2 } : undefined);
  const place = normalizeCompiledPlace({ ...element, center });
  const footprintRings = elementFootprintRings(element);
  const tags = element.tags ?? {};
  const kind = ['supermarket', 'hypermarket', 'mall', 'shopping_centre'].includes(tags.shop ?? '') ? tags.shop!
    : ['park', 'garden'].includes(tags.leisure ?? '') ? tags.leisure!
      : tags.landuse === 'forest' ? 'forest' : tags.natural === 'wood' ? 'wood' : undefined;
  const areaM2 = place?.areaM2 === 0 ? elementAreaSquareMeters(element) : place?.areaM2;
  return place && footprintRings && kind ? [{ ...place, kind, areaM2, tags: { ...place.tags, ...(tags.landuse ? { landuse: tags.landuse } : {}), ...(tags.natural ? { natural: tags.natural } : {}) }, footprintRings }] : [];
}).sort((a,b) => a.id.localeCompare(b.id));
const places = groupBuildingFootprints(rawPlaces, groupElements);
if (!places.length) throw new Error('No verified footprints returned');
const chunks: typeof places[] = [];
let chunk: typeof places = [], size = 2;
for (const place of places) {
  const bytes = Buffer.byteLength(JSON.stringify(place)) + 1;
  if (bytes > 24 * 1024 ** 2) throw new Error(`Oversized footprint ${place.id}`);
  if (size + bytes > 24 * 1024 ** 2) { chunks.push(chunk); chunk = []; size = 2; }
  chunk.push(place); size += bytes;
}
if (chunk.length) chunks.push(chunk);
const assets: { asset: string; bytes: number; sha256: string; count: number }[] = [];
for (const entries of chunks) {
  const bytes = Buffer.from(JSON.stringify(entries));
  const hash = createHash('sha256').update(bytes).digest('hex');
  const asset = `${hash.slice(0, 16)}.json`;
  await writeFile(join(root, asset), bytes);
  assets.push({ asset, bytes: bytes.length, sha256: hash, count: entries.length });
}
async function inventory(dir: string): Promise<{ path: string; bytes: number }[]> {
  const result = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) result.push(...await inventory(path));
    else result.push({ path, bytes: (await stat(path)).size });
  }
  return result;
}
const obsolete = (await readdir(root)).filter(name => /^[a-f0-9]{16}\.json$/.test(name) && !assets.some(asset => asset.asset === name));
const files = (await inventory(resolve('public'))).filter(file => !obsolete.some(name => file.path === join(root, name)));
if (files.length + 1 > 20_000 || files.some(file => file.bytes > 25 * 1024 ** 2)) throw new Error('Public assets exceed conservative Cloudflare Pages limits');
const publicFileCount = files.filter(file => file.path !== join(root, 'manifest.json')).length + 1;
const counts = places.reduce<Record<string, number>>((counts, place) => { counts[place.kind] = (counts[place.kind] ?? 0) + 1; return counts; }, {});
const observed = payload.elements.filter(element => ['supermarket','hypermarket','mall','shopping_centre'].includes(element.tags?.shop ?? '') || ['park','garden'].includes(element.tags?.leisure ?? '') || element.tags?.landuse === 'forest' || element.tags?.natural === 'wood').length;
const groupedPlaces = places.filter(place => place.footprintGroupId);
const manifest = { schemaVersion: 1, scope: 'FR-IDF', attribution: '© OpenStreetMap contributors', generatedAt: new Date().toISOString(), observed, withFootprint: places.length, buildingGroups: new Set(groupedPlaces.map(place => place.footprintGroupId)).size, groupedPlaces: groupedPlaces.length, counts, assets, publicFileCount };
await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest));
for (const name of await readdir(root)) {
  if (/^[a-f0-9]{16}\.json$/.test(name) && !assets.some(asset => asset.asset === name)) await unlink(join(root, name));
}
console.log(JSON.stringify(manifest, null, 2));
