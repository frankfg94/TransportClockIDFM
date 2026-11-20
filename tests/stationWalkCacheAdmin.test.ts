import { createApp, eventHandler, toWebHandler } from "h3";
import { expect, it, vi } from "vitest";
import sharedCache from "../server/api/walking/shared-cache.post";

it("requires the server's administrator credential for a shared reset", async () => {
  const store = { put: vi.fn(async () => {}) };
  const app = createApp().use(eventHandler(event => {
    event.context.cloudflare = { env: { WALKING_CACHE_KV: store, WALKING_CACHE_ADMIN_TOKEN: "test-only" } };
    return sharedCache(event);
  }));
  const send = (action: string, token = "") => toWebHandler(app)(new Request("https://verdict.example/api/walking/shared-cache", {
    method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + token, "x-station-walk-action": action },
    body: JSON.stringify({ action }),
  }));
  expect(await (await send("status")).json()).toMatchObject({ available: true, authorized: false });
  expect((await send("reset", "incorrect")).status).toBe(403);
  expect(store.put).not.toHaveBeenCalled();
  expect((await send("reset", "test-only")).status).toBe(200);
  expect(store.put).toHaveBeenCalledOnce();
});
