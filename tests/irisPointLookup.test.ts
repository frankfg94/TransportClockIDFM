import { describe, expect, it } from 'vitest';
import { findPointIrisNeighborhoods } from '../server/services/neighborhoodVerdict/irisPointLookup';
import { pointInIrisGeometry } from '../src/features/transport-map/iris/irisGeometry';
import { IRIS_SOURCE_ID, type CompiledIrisData, type CompiledIrisNeighborhood } from '../server/services/neighborhoodVerdict/contracts';
function fixture(): CompiledIrisData {
  const a: CompiledIrisNeighborhood = { id:'a', codeIris:'a', communeCode:'a', communeName:'A', departmentCode:'1',name:'A',type:'H',centroid:[1,1],
    geometry:{type:'Polygon',coordinates:[[[0,0],[2,0],[2,2],[0,2],[0,0]],[[.5,.5],[1.5,.5],[1.5,1.5],[.5,1.5],[.5,.5]]]}};
  const b: CompiledIrisNeighborhood = {...a,id:'b',communeCode:'b',geometry:{type:'MultiPolygon',coordinates:[[[[1,1],[3,1],[3,3],[1,3],[1,1]]],[[[4,4],[5,4],[5,5],[4,5],[4,4]]]]}};
  return {sourceId:IRIS_SOURCE_ID,bbox:[0,0,5,5],neighborhoods:[a,b]};
}
describe('exact IRIS bounding-box lookup',()=>{
  it('preserves every match, holes, boundaries, multipolygons and ambiguous communes on repeated lookups',()=>{
    const data=fixture();
    for(let lon=-.25;lon<=5.25;lon+=.25)for(let lat=-.25;lat<=5.25;lat+=.25){
      const point={lon,lat},expected=data.neighborhoods.filter(n=>pointInIrisGeometry(point,n.geometry));
      expect(findPointIrisNeighborhoods(data,point)).toEqual(expected);
      expect(findPointIrisNeighborhoods(data,point)).toEqual(expected);
    }
  });
  it('uses new bounds for a replaced dataset without caching point results',()=>{
    const first=fixture(); expect(findPointIrisNeighborhoods(first,{lon:4.5,lat:4.5}).map(n=>n.id)).toEqual(['b']);
    const changed=structuredClone(first);changed.neighborhoods=[changed.neighborhoods[0]!];
    expect(findPointIrisNeighborhoods(changed,{lon:4.5,lat:4.5})).toEqual([]);
  });
});
