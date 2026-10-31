import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { CompiledPlaceRecord } from '../../src/services/places/compiledPlaces';

const root = resolve('public/data/place-footprints');
const manifest = JSON.parse(await readFile(resolve(root,'manifest.json'), 'utf8'));
const places: CompiledPlaceRecord[] = [];
for (const asset of manifest.assets) {
  if (!/^[a-f0-9]{16}\.json$/.test(asset.asset)) throw new Error('Invalid asset path');
  const bytes = await readFile(resolve(root,asset.asset));
  if (bytes.length !== asset.bytes || bytes.length > 25 * 1024 ** 2 || createHash('sha256').update(bytes).digest('hex') !== asset.sha256) throw new Error(`Invalid asset ${asset.asset}`);
  const entries = JSON.parse(bytes.toString());
  if (entries.length !== asset.count) throw new Error('Asset count mismatch');
  places.push(...entries);
}
if (places.length !== manifest.withFootprint || new Set(places.map(place=>place.id)).size !== places.length) throw new Error('Invalid total count or duplicate ids');
const kinds = ['supermarket','hypermarket','mall','shopping_centre','park','garden','forest','wood'];
for (const place of places) {
  if (!kinds.includes(place.kind) || !(place.areaM2! > 0) || !Number.isFinite(place.areaM2) || !place.footprintRings?.length) throw new Error(`Invalid place ${place.id}`);
  for (const ring of place.footprintRings) {
    if (ring.length < 4 || ring.some(([lon,lat]) => !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon)>180 || Math.abs(lat)>90)
      || ring[0]!.some((value,index) => Math.abs(value-ring.at(-1)![index]!) >= 1e-7)) throw new Error(`Invalid ring ${place.id}`);
  }
}
const targets = ['relation:2768926','way:150389811','way:678745793','way:150380716','way:155222966'];
const examples = targets.map(id => {
  const place = places.find(place=>place.id===id);
  if (!place) throw new Error(`Missing proof target ${id}`);
  return { id, name: place.name, kind: place.kind, areaM2: place.areaM2, vertices: place.footprintRings!.reduce((sum,ring)=>sum+ring.length,0) };
});
const report = { passed: true, counts: manifest.counts, places: places.length, observed: manifest.observed, withoutVerifiedFootprint: manifest.observed-places.length, examples };
await mkdir(resolve('.data-update-evidence/place-footprints'),{recursive:true});
await writeFile(resolve('.data-update-evidence/place-footprints/dataset-validation.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
