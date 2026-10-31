import polygonClipping from 'polygon-clipping';
import type { CompiledPlaceRecord, OverpassElement } from './compiledPlaces';
import { elementAreaSquareMeters } from './placeSurface';

/** Only explicit building outlines may join malls; interior shops stay independent. */
export function groupBuildingFootprints(places: readonly CompiledPlaceRecord[], elements: readonly OverpassElement[]): CompiledPlaceRecord[] {
  const byId = new Map(places.map(place => [place.id, place]));
  const grouped = new Set<string>();
  for (const relation of elements) {
    if (relation.type !== 'relation' || relation.id === undefined || relation.tags?.type !== 'building') continue;
    const outlines = (relation.members ?? []).filter(member => member.role === 'outline');
    if (outlines.length < 2 || outlines.some(member => member.type !== 'way' || member.ref === undefined)) continue;
    const members = outlines.map(member => byId.get(`way:${member.ref}`));
    // Do not broaden a mall to an unrelated use or publish a partial group.
    if (members.some(place => !place || !['mall', 'shopping_centre'].includes(place.kind)
      || !place.footprintRings?.length || grouped.has(place.id))) continue;
    const polygons = outlines.map(member => {
      const ring = member.geometry?.map(({lon,lat}): [number,number] => [lon,lat]);
      return ring?.length && elementAreaSquareMeters({geometry: member.geometry}) ? [ring] : undefined;
    });
    if (polygons.some(polygon => !polygon)) continue;
    const [first, ...others] = polygons as polygonClipping.Polygon[];
    const union = polygonClipping.union(first!, ...others);
    const surface = union.reduce((total, polygon) => total + polygon.reduce((sum, ring, index) => {
      const area = elementAreaSquareMeters({geometry: ring.map(([lon,lat]) => ({lon,lat}))}) ?? 0;
      return sum + (index ? -area : area);
    }, 0), 0);
    if (!Number.isFinite(surface) || surface <= 0) continue;
    const footprintRings = union.flat();
    for (const place of members as CompiledPlaceRecord[]) {
      grouped.add(place.id);
      byId.set(place.id, { ...place, footprintRings, areaM2: Math.round(surface), footprintGroupId: `relation:${relation.id}` });
    }
  }
  return places.map(place => byId.get(place.id)!);
}
