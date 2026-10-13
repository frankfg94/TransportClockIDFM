import { describe, expect, it, vi } from "vitest";
import { createNeighborhoodGtfsAssetReader } from "../src/services/travelRoutes/neighborhoodGtfsAssets";
describe("encoded GTFS directories", () => {
  it("retains Cloudflare's literal escaped directory convention without extra requests", async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo) => {
      expect(String(url)).toContain('IDFM%253Afixture');
      return Response.json({ lineId: 'IDFM:fixture', trips: ['all'] });
    });
    const read = createNeighborhoodGtfsAssetReader(fetcher, undefined);
    expect(await read('https://assets.test', 'timetables/IDFM%3Afixture/index.json', true)).toEqual({ lineId: 'IDFM:fixture', trips: ['all'] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("negotiates Nitro's decoded directory convention on 404 and preserves the full payload", async () => {
    const fetcher = vi.fn(async (url: URL | RequestInfo) => String(url).includes('%253A')
      ? new Response(null, { status: 404 }) : Response.json({ full: true, trips: [1,2,3] }));
    const read = createNeighborhoodGtfsAssetReader(fetcher, undefined);
    expect(await read('https://nitro.test', 'timetables/IDFM%3Afirst/index.json', true)).toEqual({ full: true, trips: [1,2,3] });
    await read('https://nitro.test', 'timetables/IDFM%3Asecond/index.json', true);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[2]![0])).toContain('IDFM%3Asecond');
  });
  it("does not reinterpret unrelated HTTP failures", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));
    await expect(createNeighborhoodGtfsAssetReader(fetcher, undefined)('https://host.test','IDFM%3Afixture/index.json',true)).rejects.toThrow('503');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
