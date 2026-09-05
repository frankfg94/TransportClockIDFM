import { afterEach, describe, expect, it, vi } from "vitest";
import type { GlobalIsochroneWorkerRequest, GlobalIsochroneWorkerResponse } from "../src/features/transport-map/isochrones/client";
import { GlobalIsochroneArchive } from "../src/features/transport-map/isochrones/archive";
import { walkingArchiveFixture } from "./fixtures/walkingIsochrones";

afterEach(() => vi.unstubAllGlobals());

async function worker(fetcher: typeof fetch) {
  vi.resetModules();
  const messages: GlobalIsochroneWorkerResponse[] = [];
  let sequence = 0;
  let receive!: (event: { data: GlobalIsochroneWorkerRequest }) => void;
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("self", {
    addEventListener: (_type: string, listener: typeof receive) => { receive = listener; },
    postMessage: (message: GlobalIsochroneWorkerResponse) => { messages.push(message); },
  });
  await import("../src/features/transport-map/isochrones/globalIsochrones.worker");
  return {
    messages,
    async send(overrides: Partial<GlobalIsochroneWorkerRequest> = {}) {
      const id = ++sequence;
      receive({ data: { id, url: "https://app.test/api/map/isochrones", mapDataVersion: "test-v1", scopes: [{ key: "mode:METRO", mode: "METRO", minutes: 10 }], reload: false, ...overrides } });
      await vi.waitFor(() => expect(messages.some((message) => message.id === id)).toBe(true), { interval: 5 });
      return messages.find((message) => message.id === id)!;
    },
  };
}

describe("walking radar worker I/O", () => {
  it("does not fetch on import, requests only selected durations and reuses cached responses", async () => {
    const fixture = walkingArchiveFixture();
    const fetcher = vi.fn<typeof fetch>(async (url) => apiResponse(fixture.bytes(), String(url)));
    const state = await worker(fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await state.send()).ok).toBe(true);
    expect((await state.send({ scopes: [{ key: "mode:METRO", mode: "METRO", minutes: 30 }] })).ok).toBe(true);
    expect((await state.send()).ok).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const url = String(fetcher.mock.calls[0]?.[0]);
    expect(new URL(url).pathname).toBe("/api/map/isochrones");
    expect(JSON.parse(new URL(url).searchParams.get("scopes")!)).toEqual([{ key: "mode:METRO", mode: "METRO", minutes: 10 }]);
    expect(url).not.toContain(".zip");
    expect(url).not.toContain("openrouteservice");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: "default" });
  });

  it("reports missing data and performs a fresh load on retry", async () => {
    const fixture = walkingArchiveFixture();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 404 })).mockImplementationOnce(async (url) => apiResponse(fixture.bytes(), String(url)));
    const state = await worker(fetcher);
    expect(await state.send()).toMatchObject({ ok: false, code: "missing" });
    expect(await state.send({ reload: true })).toMatchObject({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toContain("retry=2");
  });

  it("distinguishes incompatible and corrupt files without returning substitute surfaces", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 409 })).mockResolvedValueOnce(new Response("invalid JSON"));
    const state = await worker(fetcher);
    expect(await state.send({ mapDataVersion: "test-v2" })).toMatchObject({ ok: false, code: "incompatible" });
    expect(await state.send({ reload: true })).toMatchObject({ ok: false, code: "invalid" });
    expect(state.messages.every((message) => !("result" in message))).toBe(true);
  });

  it("aborts an obsolete selection while returning only the new duration", async () => {
    const fixture = walkingArchiveFixture();
    let firstSignal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(async (_url, init) => {
      firstSignal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => firstSignal?.addEventListener("abort", () => reject(firstSignal?.reason), { once: true }));
    }).mockImplementation(async (url) => apiResponse(fixture.bytes(), String(url)));
    const state = await worker(fetcher);
    const stale = state.send();
    await vi.waitFor(() => expect(firstSignal).toBeDefined());
    const latest = await state.send({ scopes: [{ key: "mode:METRO", mode: "METRO", minutes: 30 }] });
    expect(firstSignal?.aborted).toBe(true);
    expect(await stale).toMatchObject({ ok: false });
    expect(latest.ok && latest.result.surfaces.map((surface) => surface.minutes)).toEqual([30]);
  });

  it("resolves the API on the deployed Nuxt backend for native builds", async () => {
    vi.resetModules();
    vi.stubGlobal("window", { location: { href: "https://localhost/map" } });
    vi.stubGlobal("__SERVER_API_BASE_URL__", "https://backend.test/");
    const native = await import("../src/features/transport-map/isochrones/client");
    expect(native.resolveGlobalIsochroneUrl()).toBe("https://backend.test/api/map/isochrones");
    vi.resetModules();
    vi.stubGlobal("__SERVER_API_BASE_URL__", "");
    const web = await import("../src/features/transport-map/isochrones/client");
    expect(web.resolveGlobalIsochroneUrl()).toBe("https://localhost/api/map/isochrones");
  });
});

function apiResponse(bytes: Uint8Array, url: string): Response {
  const scopes = JSON.parse(new URL(url).searchParams.get("scopes")!);
  return Response.json({ schemaVersion: 1, mapDataVersion: "test-v1", result: new GlobalIsochroneArchive(bytes).select(scopes) });
}
