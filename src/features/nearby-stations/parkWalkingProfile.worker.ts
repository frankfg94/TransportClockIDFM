import type { GreenBoundary } from "../../../shared/natureInCity";
import { selectParkWalkingProfile, type ParkWalkingApproach, type WalkNetwork } from "./parkWalkingProfile";

export type ParkWalkingRequest = {
  id: number;
  url: string;
  boundary: GreenBoundary;
  approaches: readonly ParkWalkingApproach[];
  areaM2?: number;
};
export type ParkWalkingResponse = { id: number; result: ReturnType<typeof selectParkWalkingProfile> };

const requests = new Map<number, AbortController>();
self.addEventListener("message", async ({ data }: MessageEvent<ParkWalkingRequest | { cancel: number }>) => {
  if ("cancel" in data) {
    requests.get(data.cancel)?.abort();
    return;
  }
  const { id, url, boundary, approaches, areaM2 } = data;
  const controller = new AbortController();
  requests.set(id, controller);
  try {
    const response = await fetch(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
    const result = response.ok ? selectParkWalkingProfile(await response.json() as WalkNetwork, boundary, approaches, areaM2) : undefined;
    if (!controller.signal.aborted) self.postMessage({ id, result } satisfies ParkWalkingResponse);
  } catch {
    if (!controller.signal.aborted) self.postMessage({ id, result: undefined } satisfies ParkWalkingResponse);
  } finally {
    requests.delete(id);
  }
});
