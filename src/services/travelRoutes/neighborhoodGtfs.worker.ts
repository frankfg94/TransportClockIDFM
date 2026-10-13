/// <reference lib="webworker" />
import { createNeighborhoodGtfsRouter } from "../../../shared/gtfs/routing";
import { createGtfsTimetableLoader } from "../../../shared/gtfs/timetableRuntime";
import { computeGtfsLineFrequency, getGtfsFrequencyServiceDate } from "../../../shared/gtfs/frequencyComputation";
import { mapFrequencyStops } from "../../../shared/gtfs/frequencyTopology";
import { findGtfsLastService } from "../../../shared/gtfs/lastService";
import type { GtfsManifest } from "../../../server/services/gtfs/types";
import type { LineTopology } from "../../../server/services/topology/types";
import type { GtfsLineFrequencyResponse } from "../../types/lineFrequency";
import type { NeighborhoodJourneysResponse } from "../../features/nearby-stations/neighborhoodJourneys";
import type { NeighborhoodGtfsWorkerDiagnostics, NeighborhoodGtfsWorkerRequest, NeighborhoodGtfsWorkerResponse } from "./neighborhoodGtfsWorkerProtocol";
import { createNeighborhoodGtfsTaskQueue } from "./neighborhoodGtfsTaskQueue";
import { createNeighborhoodGtfsWalkingMatrix } from "./neighborhoodGtfsWalkingMatrix";
import { createNeighborhoodGtfsAssetReader } from "./neighborhoodGtfsAssets";
import { createNeighborhoodTimetableCache, selectNeighborhoodCivilTimetable, selectNeighborhoodServiceTimetable } from "./neighborhoodTimetableCache";

const scope = self as unknown as DedicatedWorkerGlobalScope;
let manifest: { baseUrl: string; expires: number; promise: Promise<GtfsManifest | undefined> } | undefined;
let activeDiagnostics: NeighborhoodGtfsWorkerDiagnostics | undefined;
let coldStart = false;
const assets = createNeighborhoodGtfsAssetReader();
async function readAsset<T>(baseUrl: string, path: string, diagnostics = activeDiagnostics): Promise<T | undefined> {
  if (diagnostics) diagnostics.assetReads++;
  return observeWorkerStep(diagnostics, "asset", { path }, () => assets<T>(baseUrl, path, coldStart));
}
async function observeWorkerStep<T>(diagnostics: NeighborhoodGtfsWorkerDiagnostics | undefined, task: string, details: Record<string, unknown>, work: () => Promise<T>): Promise<T> {
  if (!diagnostics?.steps) return work();
  const startEpochMs = performance.timeOrigin + performance.now();
  let status: "ready" | "error" = "ready";
  try { return await work(); } catch (error) { status = "error"; throw error; }
  finally {
    const endEpochMs = performance.timeOrigin + performance.now();
    diagnostics.steps.push({ task, startEpochMs, endEpochMs, durationMs: Math.round(endEpochMs - startEpochMs), status, details });
  }
}
const runtime = {
  getManifest: async (baseUrl: string, diagnostics = activeDiagnostics) => {
    if (!manifest || manifest.baseUrl !== baseUrl || manifest.expires <= Date.now()) {
      const promise = readAsset<GtfsManifest>(baseUrl, "current.json", diagnostics);
      manifest = { baseUrl, expires: Date.now() + 60_000, promise };
      void promise.catch(() => { if (manifest?.promise === promise) manifest = undefined; });
    }
    return manifest.promise;
  },
  isEnabled: () => true, cacheEpoch: () => 0, readJson: readAsset,
};
const timetable = createGtfsTimetableLoader<string>(runtime);
const loadTimetable = createNeighborhoodTimetableCache(timetable.loadForDate);
const matrix = createNeighborhoodGtfsWalkingMatrix();
type RoutingContext = { baseUrl: string; diagnostics: NeighborhoodGtfsWorkerDiagnostics };
const route = createNeighborhoodGtfsRouter<RoutingContext>({
  ...runtime,
  getManifest: context => runtime.getManifest(context.baseUrl, context.diagnostics),
  readJson: <T>(context: RoutingContext, path: string) => readAsset<T>(context.baseUrl, path, context.diagnostics),
  matrix: (context, origin, destinations, options) => {
    const details: Record<string, unknown> = { destinations: destinations.length, reverse: options?.reverse === true };
    return observeWorkerStep(context.diagnostics, "walking-matrix", details, async () => {
      const routes = await matrix(context.baseUrl, origin, destinations, { ...options, observe: (cached, reused, examined) => {
        context.diagnostics.matrixCalls++;
        if (cached) context.diagnostics.matrixCacheHits++;
        context.diagnostics.walkingPairsReused += reused;
        context.diagnostics.walkingPairsExamined = (context.diagnostics.walkingPairsExamined ?? 0) + examined;
        context.diagnostics.walkingPairsRequested += examined - reused;
        details.reusedPairs = reused; details.requestedPairs = examined - reused;
      } });
      details.verified = routes.filter(route => !route.fallback).length;
      details.estimated = routes.filter(route => route.fallback).length;
      return routes;
    });
  },
});

const topologies = new Map<string, Promise<LineTopology | undefined>>();
async function topology(baseUrl: string, lineId: string, version: string): Promise<LineTopology | undefined> {
  const key = `${baseUrl}:${lineId}:${version}`;
  if (!topologies.has(key)) {
    const request = (async () => {
      try {
        const url = new URL(`/api/lines/${encodeURIComponent(lineId)}/topology`, baseUrl);
        url.searchParams.set("gtfsVersion", version);
        const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) return undefined;
        const value = await response.json() as LineTopology;
        return Array.isArray(value.stations) && Array.isArray(value.segments) && Array.isArray(value.patterns) ? value : undefined;
      } catch { return undefined; }
    })();
    topologies.set(key, request);
    void request.then(value => {
      if (!value && topologies.get(key) === request) topologies.delete(key);
    });
    while (topologies.size > 8) topologies.delete(topologies.keys().next().value!);
  }
  return topologies.get(key)!;
}
const frequencies = new Map<string, GtfsLineFrequencyResponse>();
async function frequency(baseUrl: string, lineId: string): Promise<GtfsLineFrequencyResponse> {
  const current = await runtime.getManifest(baseUrl), serviceDate = getGtfsFrequencyServiceDate();
  const version = `${current?.timetable?.path}:${current?.cacheGeneration}`;
  const key = `${baseUrl}:${lineId}:${serviceDate}:${version}`;
  if (frequencies.has(key)) return frequencies.get(key)!;
  const loaded = selectNeighborhoodCivilTimetable(await loadTimetable(baseUrl, lineId, serviceDate, version));
  const profile = computeGtfsLineFrequency({ lineId, serviceDate, timetable: loaded, topology: await topology(baseUrl, lineId, version) });
  if (profile.status === "ready" && profile.topologyAvailable) frequencies.set(key, profile);
  while (frequencies.size > 16) frequencies.delete(frequencies.keys().next().value!);
  return profile;
}
async function lastService(baseUrl: string, request: Extract<NeighborhoodGtfsWorkerRequest, { kind: "last-service" }>) {
  const serviceDate = request.serviceDate ?? getGtfsFrequencyServiceDate();
  const current = await runtime.getManifest(baseUrl), version = `${current?.timetable?.path}:${current?.cacheGeneration}`;
  const loaded = selectNeighborhoodServiceTimetable(await loadTimetable(baseUrl, request.lineId, serviceDate, version), serviceDate);
  const stopIds = loaded.index && loaded.status === "ready" ? mapFrequencyStops(loaded.index.stops, await topology(baseUrl, request.lineId, version)) : new Map<string,string>();
  return findGtfsLastService({ status: loaded.status,
    stops: (loaded.index?.stops ?? []).map(stop => ({ id: stop.id, parentId: stop.parentId, name: stop.name, topologyId: stopIds.get(stop.id) })),
    trips: loaded.trips,
  }, request.stationId);
}

// Route batches overlap their street-network waits, sharing the same routing
// trees and in-flight assets. Timetables still retain one normalized line.
const transportQueue = createNeighborhoodGtfsTaskQueue(3);
const placesQueue = createNeighborhoodGtfsTaskQueue();
const timetableQueue = createNeighborhoodGtfsTaskQueue();
scope.addEventListener("message", (event: MessageEvent<NeighborhoodGtfsWorkerRequest>) => {
  const message = event.data;
  if (message.kind === "cancel") { transportQueue.cancel(message.id); placesQueue.cancel(message.id); timetableQueue.cancel(message.id); return; }
  coldStart = message.coldStart === true;
  const { id, baseUrl } = message, enqueued = performance.now();
  // Parks/shops/hospitals keep one slot; their egress HTTP matrices cannot
  // occupy all the transport slots. All destinations are still computed.
  const queue = message.kind !== "routes" ? timetableQueue : message.request.purpose === "places" ? placesQueue : transportQueue;
  queue.enqueue(id, async isCancelled => {
    const started = performance.now();
    const diagnostics: NeighborhoodGtfsWorkerDiagnostics = { kind: message.kind, queueMs: Math.round(started - enqueued), taskMs: 0, assetReads: 0, matrixCalls: 0, matrixCacheHits: 0, walkingPairsReused: 0, walkingPairsRequested: 0 };
    if (message.debug) { diagnostics.enqueuedEpochMs = performance.timeOrigin + enqueued; diagnostics.startedEpochMs = performance.timeOrigin + started; diagnostics.steps = []; }
    if (message.kind === "routes") { diagnostics.purpose = message.request.purpose; diagnostics.destinations = message.request.destinations.length; }
    if (message.kind !== "routes") activeDiagnostics = diagnostics;
    try {
      const payload = message.kind === "frequency" ? await frequency(baseUrl, message.lineId)
        : message.kind === "last-service" ? await lastService(baseUrl, message)
        : await route({ baseUrl, diagnostics }, message.request);
      if (message.kind === "routes") {
        const routing = (payload as NeighborhoodJourneysResponse).diagnostics;
        diagnostics.cacheHit = routing?.cacheHit;
        diagnostics.scannedConnections = routing?.scannedConnections;
      }
      diagnostics.taskMs = Math.round(performance.now() - started);
      if (message.debug) diagnostics.endedEpochMs = performance.timeOrigin + performance.now();
      if (!isCancelled()) scope.postMessage({ id, payload, diagnostics } satisfies NeighborhoodGtfsWorkerResponse);
    }
    catch (error) {
      diagnostics.taskMs = Math.round(performance.now() - started);
      if (message.debug) diagnostics.endedEpochMs = performance.timeOrigin + performance.now();
      if (!isCancelled()) scope.postMessage({ id, error: error instanceof Error ? error.message : "GTFS routing failed", diagnostics } satisfies NeighborhoodGtfsWorkerResponse);
    } finally { if (activeDiagnostics === diagnostics) activeDiagnostics = undefined; }
  });
});
