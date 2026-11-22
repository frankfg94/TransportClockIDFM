import type { GreenBoundary } from "../../../shared/natureInCity";
import { toServerApiUrl } from "../../services/serverApi";
import type { ParkWalkingApproach } from "./parkWalkingProfile";
import type { ParkWalkingRequest, ParkWalkingResponse } from "./parkWalkingProfile.worker";
import { parkOsmBounds } from "./remarkableGardens";

let worker: Worker | undefined;
let nextId = 0;
const pending = new Map<number, (result: ParkWalkingResponse["result"]) => void>();

function getWorker() {
  if (worker) return worker;
  if (typeof Worker === "undefined") return;
  worker = new Worker(new URL("./parkWalkingProfile.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }: MessageEvent<ParkWalkingResponse>) => pending.get(data.id)?.(data.result);
  worker.onerror = () => {
    for (const finish of pending.values()) finish(undefined);
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}

export async function loadParkWalkingProfile(boundary: GreenBoundary,
  approaches: readonly ParkWalkingApproach[], areaM2: number | undefined, signal: AbortSignal) {
  const bbox = parkOsmBounds(boundary);
  if (!bbox || signal.aborted) return;
  const target = getWorker();
  if (!target) return;
  const id = ++nextId;
  const params = new URLSearchParams({ bbox, network: "1" });
  const message: ParkWalkingRequest = { id, url: toServerApiUrl(`/api/neighborhood-park-entrances?${params}`),
    boundary, approaches: approaches.map(({ point, minutes }) => ({ point: { lon: point.lon, lat: point.lat }, minutes })), areaM2 };
  return await new Promise<ParkWalkingResponse["result"]>(resolve => {
    function finish(result: ParkWalkingResponse["result"]) {
      pending.delete(id);
      signal.removeEventListener("abort", cancel);
      resolve(result);
    }
    const cancel = () => {
      target.postMessage({ cancel: id });
      finish(undefined);
    };
    pending.set(id, finish);
    signal.addEventListener("abort", cancel, { once: true });
    try { target.postMessage(message); } catch { finish(undefined); }
  });
}
