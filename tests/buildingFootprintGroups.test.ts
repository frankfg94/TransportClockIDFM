import { describe, expect, it } from 'vitest';
import { groupBuildingFootprints } from '../src/services/places/buildingFootprintGroups';
import { normalizeCompiledPlace, type OverpassElement } from '../src/services/places/compiledPlaces';
import { elementFootprintRings } from '../src/services/places/placeSurface';

const way = (id:number, west:number, east:number, shop='mall'): OverpassElement => ({ type:'way', id, center:{lon:west,lat:48.8}, tags:{shop,name:'Same brand'}, geometry:[{lon:west,lat:48.8},{lon:east,lat:48.8},{lon:east,lat:48.801},{lon:west,lat:48.801},{lon:west,lat:48.8}] });
const left=way(1,2.3,2.302), right=way(2,2.301,2.303), shop=way(3,2.301,2.3015,'supermarket');
const places=[left,right,shop].map(element=>({...normalizeCompiledPlace(element)!,footprintRings:elementFootprintRings(element)}));
const relation: OverpassElement={type:'relation',id:10,tags:{type:'building'},members:[
  {type:'way',ref:1,role:'outline',geometry:left.geometry},
  {type:'way',ref:2,role:'outline',geometry:right.geometry},
  {type:'way',ref:3,role:'buildingpart',geometry:shop.geometry},
]};
describe('explicit mall building groups',()=>{
  it('joins outlines, subtracts overlaps, and leaves an interior supermarket independent',()=>{
    const result=groupBuildingFootprints(places,[relation]);
    const expected=normalizeCompiledPlace(way(9,2.3,2.303))!;
    expect(result[0]?.footprintGroupId).toBe('relation:10');
    expect(result[1]?.footprintRings).toEqual(result[0]?.footprintRings);
    expect(result[0]?.areaM2).toBeCloseTo(expected.areaM2!,0);
    expect(result[0]?.areaM2).toBeLessThan(places[0]!.areaM2!+places[1]!.areaM2!);
    expect(result[2]).toBe(places[2]);
  });
  it('does not infer a group from identical names or publish an incomplete relation',()=>{
    expect(groupBuildingFootprints(places,[])).toEqual(places);
    expect(groupBuildingFootprints(places.slice(0,1),[relation])).toEqual(places.slice(0,1));
  });
  it('does not use a level shell or interior shop as a building outline',()=>{
    expect(groupBuildingFootprints(places,[{...relation,tags:{type:'level'}}])).toEqual(places);
    expect(groupBuildingFootprints(places,[{...relation,members:[{type:'way',ref:1,role:'shell',geometry:left.geometry},{type:'way',ref:2,role:'shell',geometry:right.geometry}]}])).toEqual(places);
  });
});
