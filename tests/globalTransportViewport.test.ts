import { describe, expect, it, vi } from "vitest";
import { useGlobalTransportViewport, type UseGlobalTransportViewportOptions } from "../src/features/line-map/useGlobalTransportViewport";
import type { TransportMapNetwork, TransportMapViewportResult } from "../src/features/transport-map/contracts/network";
import { createCamera } from "../src/features/transport-map/geo/camera";

function fixture(acceptsCameraChange?: () => boolean) {
  let camera = createCamera({ generation: 1 });
  let mask = 1;
  let forced: string[] = [];
  let release!: (result: TransportMapViewportResult) => void;
  const result: TransportMapViewportResult = { generation: 1, paths: [], stations: [], chunkIds: [], bytes: 0, fromCache: true };
  const network = {} as TransportMapNetwork;
  const publishViewport = vi.fn();
  const queryViewport = vi.fn<UseGlobalTransportViewportOptions["queryViewport"]>(() => new Promise<TransportMapViewportResult>((resolve) => { release = resolve; }));
  const controller = useGlobalTransportViewport({
    isMounted: () => true, getNetwork: () => network, getCamera: () => camera,
    getVisibleModeMask: () => mask, getActiveLineId: () => undefined, getForcedLineIds: () => forced,
    queryViewport, getNetworkAfterQuery: () => network, publishNetwork: vi.fn(), publishViewport,
    setLoading: vi.fn(), clearError: vi.fn(), setError: vi.fn(), debounceMs: 0, acceptsCameraChange,
  });
  return { controller, publishViewport, queryViewport, camera,
    move: () => { camera = { ...camera, generation: 2 }; },
    changeMask: () => { mask = 2; }, changeForced: () => { forced = ["new-line"]; },
    finish: () => release(result), result };
}

describe("global transport viewport publication", () => {
  it("keeps the settled-camera mode from publishing a response after movement", async () => {
    const f = fixture(); const request = f.controller.refreshViewport(); f.move(); f.finish();
    expect(await request).toBe(false); expect(f.publishViewport).not.toHaveBeenCalled();
  });
  it("publishes an anticipated viewport that still covers the moving camera", async () => {
    const f = fixture(() => true); const target = { ...f.camera, zoom: 6 };
    const request = f.controller.refreshViewport(undefined, target); f.move(); f.finish();
    expect(await request).toBe(true); expect(f.queryViewport.mock.calls[0]?.[0]).toBe(target);
    expect(f.publishViewport).toHaveBeenCalledWith(f.result);
  });
  it.each(["changeMask", "changeForced"] as const)("rejects a covered response when %s changes", async (change) => {
    const f = fixture(() => true); const request = f.controller.refreshViewport(); f.move(); f[change](); f.finish();
    expect(await request).toBe(false); expect(f.publishViewport).not.toHaveBeenCalled();
  });
});
