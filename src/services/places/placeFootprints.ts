import type { CompiledPlaceRecord } from './compiledPlaces';

let pending: Promise<CompiledPlaceRecord[]> | undefined;
export function loadPlaceFootprints(): Promise<CompiledPlaceRecord[]> {
  if (!pending) pending = (async () => {
    const response = await fetch('/data/place-footprints/manifest.json');
    if (!response.ok) throw new Error(`Footprints manifest HTTP ${response.status}`);
    const manifest = await response.json() as { schemaVersion: number; assets: { asset: string }[] };
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets)) throw new Error('Invalid footprints manifest');
    const result: CompiledPlaceRecord[] = [];
    for (const { asset } of manifest.assets) {
      if (!/^[a-f0-9]{16}\.json$/.test(asset)) throw new Error('Invalid footprint asset');
      const chunk = await fetch(`/data/place-footprints/${asset}`);
      if (!chunk.ok) throw new Error(`Footprint chunk HTTP ${chunk.status}`);
      const places = await chunk.json();
      if (!Array.isArray(places)) throw new Error('Invalid footprint chunk');
      result.push(...places);
    }
    return result;
  })().catch(error => { pending = undefined; throw error; });
  return pending;
}
