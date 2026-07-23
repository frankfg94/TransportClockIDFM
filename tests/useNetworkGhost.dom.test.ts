import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick, ref } from "vue";
import {
  clearNetworkGhostTopologyCache,
  createGeographicViewport,
  useNetworkGhost,
} from "../src/features/network-ghost";
import type { LineGeometryRequest } from "../src/features/line-map/lineGeometry";
import type { TransferLineOption } from "../src/types/transit";

beforeEach(() => {
  clearNetworkGhostTopologyCache();
  vi.unstubAllGlobals();
});

describe("useNetworkGhost", () => {
  it("loads topology with eight desktop workers, resolves GTFS geometry and reuses topology promises", async () => {
    let activeTopologyRequests = 0;
    let maximumActiveTopologyRequests = 0;
    let topologyRequestCount = 0;
    let geometryRequestCount = 0;
    const pending: Array<() => void> = [];
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("/api/line-geometry/resolve")) {
        geometryRequestCount += 1;
        const request = JSON.parse(String(init?.body)) as LineGeometryRequest;
        const stops = new Map(request.stops.map((stop) => [stop.id, stop]));
        const segments = request.branches.map((branch) => {
          const from = stops.get(branch.stopIds[0])!;
          const to = stops.get(branch.stopIds[1])!;
          return {
            id: branch.id,
            fromStopId: from.id,
            toStopId: to.id,
            coordinates: [
              { lon: from.lon, lat: from.lat },
              { lon: (from.lon + to.lon) / 2 + 0.001, lat: (from.lat + to.lat) / 2 },
              { lon: to.lon, lat: to.lat },
            ],
          };
        });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              schemaVersion: 1,
              source: "gtfs",
              datasetVersion: "2026-07-23",
              generatedAt: "2026-07-23T12:00:00.000Z",
              stops: request.stops,
              branches: request.branches,
              segments,
              entrances: [],
              attempts: [{ source: "gtfs", status: "success" }],
            }),
          ),
        );
      }

      topologyRequestCount += 1;
      return new Promise<Response>((resolve) => {
        activeTopologyRequests += 1;
        maximumActiveTopologyRequests = Math.max(
          maximumActiveTopologyRequests,
          activeTopologyRequests,
        );
        pending.push(() => {
          activeTopologyRequests -= 1;
          resolve(new Response(JSON.stringify(createTopology())));
        });
      });
    });

    vi.stubGlobal("fetch", fetchMock);
    const Host = createHost();
    const wrapper = mount(Host);

    await flushPromises();
    expect(topologyRequestCount).toBe(8);

    pending.shift()?.();
    await flushPromises();
    await flushAnimationFrame();
    expect(wrapper.get('[data-testid="line-count"]').text()).toBe("1");
    expect(wrapper.get('[data-testid="geometry-source"]').text()).toBe("direct");
    expect(topologyRequestCount).toBe(9);

    while (topologyRequestCount < 10) {
      pending.shift()?.();
      await flushPromises();
    }

    pending.splice(0).forEach((resolve) => resolve());
    await flushPromises();
    await flushAnimationFrame();

    expect(maximumActiveTopologyRequests).toBe(8);
    expect(wrapper.get('[data-testid="line-count"]').text()).toBe("10");
    expect(wrapper.get('[data-testid="progress"]').text()).toBe("10/10");
    expect(wrapper.get('[data-testid="geometry-source"]').text()).toBe("gtfs");
    expect(geometryRequestCount).toBe(10);

    wrapper.unmount();

    const cachedWrapper = mount(Host);
    await flushPromises();

    expect(topologyRequestCount).toBe(10);
    expect(geometryRequestCount).toBe(20);
    expect(cachedWrapper.get('[data-testid="line-count"]').text()).toBe("10");
  });

  it("publishes every direct topology before a slow railway geometry and upgrades buses independently", async () => {
    let resolveRailGeometry: ((response: Response) => void) | undefined;
    const requestedGeometry: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        if (!String(input).includes("/api/line-geometry/resolve")) {
          return Promise.resolve(new Response(JSON.stringify(createTopology())));
        }

        const request = JSON.parse(String(init?.body)) as LineGeometryRequest;
        requestedGeometry.push(request.lineId);
        if (request.lineId === "line:rer") {
          return new Promise<Response>((resolve) => {
            resolveRailGeometry = resolve;
          });
        }

        return Promise.resolve(createGeometryResponse(request));
      }),
    );

    const Host = defineComponent({
      setup() {
        const transfers = ref<TransferLineOption[]>([
          { id: "line:rer", label: "D", family: "RER" },
          { id: "line:bus", label: "26", family: "BUS" },
        ]);
        const viewport = createTestViewport();
        return useNetworkGhost({
          anchor: createTestAnchor(),
          enabled: true,
          scope: "all",
          transfers,
          useGtfs: true,
          viewport,
        });
      },
      template: `
        <span data-testid="line-count">{{ lines.length }}</span>
        <span data-testid="sources">{{ lines.map((line) => line.id + ':' + line.geometrySource + ':' + line.geometryPending).join(',') }}</span>
        <span data-testid="precision">{{ progress.precisionCompleted }}/{{ progress.precisionTotal }}</span>
      `,
    });
    const wrapper = mount(Host);
    await flushPromises();
    await flushAnimationFrame();

    expect(wrapper.get('[data-testid="line-count"]').text()).toBe("2");
    expect(requestedGeometry).toEqual(["line:rer", "line:bus"]);
    expect(wrapper.get('[data-testid="sources"]').text()).toContain(
      "line:rer:direct:true",
    );
    expect(wrapper.get('[data-testid="sources"]').text()).toContain(
      "line:bus:gtfs:false",
    );
    expect(wrapper.get('[data-testid="precision"]').text()).toBe("1/2");

    const railRequest: LineGeometryRequest = {
      lineId: "line:rer",
      useGtfs: true,
      stops: [
        { id: "a", label: "Anchor", lon: 2.35, lat: 48.85 },
        { id: "b", label: "Next", lon: 2.36, lat: 48.86 },
      ],
      branches: [{ id: "a-b", stopIds: ["a", "b"] }],
    };
    resolveRailGeometry?.(createGeometryResponse(railRequest));
    await flushPromises();
    await flushAnimationFrame();

    expect(wrapper.get('[data-testid="sources"]').text()).toContain(
      "line:rer:gtfs:false",
    );
    expect(wrapper.get('[data-testid="precision"]').text()).toBe("2/2");
  });

  it("aborts a previous station load and ignores its obsolete precise response", async () => {
    let obsoleteSignal: AbortSignal | undefined;
    let resolveObsolete: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        if (!String(input).includes("/api/line-geometry/resolve")) {
          return Promise.resolve(new Response(JSON.stringify(createTopology())));
        }

        const request = JSON.parse(String(init?.body)) as LineGeometryRequest;
        if (request.lineId === "line:old") {
          obsoleteSignal = init?.signal as AbortSignal | undefined;
          return new Promise<Response>((resolve) => {
            resolveObsolete = resolve;
          });
        }

        return Promise.resolve(createGeometryResponse(request));
      }),
    );

    const Host = defineComponent({
      setup() {
        const transfers = ref<TransferLineOption[]>([
          { id: "line:old", label: "Old", family: "RER" },
        ]);
        const switchStation = () => {
          transfers.value = [{ id: "line:new", label: "New", family: "BUS" }];
        };
        const network = useNetworkGhost({
          anchor: createTestAnchor(),
          enabled: true,
          scope: "all",
          transfers,
          useGtfs: true,
          viewport: createTestViewport(),
        });
        return { ...network, switchStation };
      },
      template: `
        <button data-testid="switch" @click="switchStation">switch</button>
        <span data-testid="lines">{{ lines.map((line) => line.id + ':' + line.geometrySource).join(',') }}</span>
      `,
    });
    const wrapper = mount(Host);
    await flushPromises();
    await flushAnimationFrame();
    expect(wrapper.get('[data-testid="lines"]').text()).toBe("line:old:direct");

    await wrapper.get('[data-testid="switch"]').trigger("click");
    await flushPromises();
    await flushAnimationFrame();

    expect(obsoleteSignal?.aborted).toBe(true);
    expect(wrapper.get('[data-testid="lines"]').text()).toBe("line:new:gtfs");

    const obsoleteRequest: LineGeometryRequest = {
      lineId: "line:old",
      useGtfs: true,
      stops: [
        { id: "a", label: "Anchor", lon: 2.35, lat: 48.85 },
        { id: "b", label: "Next", lon: 2.36, lat: 48.86 },
      ],
      branches: [{ id: "a-b", stopIds: ["a", "b"] }],
    };
    resolveObsolete?.(createGeometryResponse(obsoleteRequest));
    await flushPromises();
    await flushAnimationFrame();

    expect(wrapper.get('[data-testid="lines"]').text()).toBe("line:new:gtfs");
  });

  it("retains already resolved visible lines when a display subcategory is removed", async () => {
    let geometryRequestCount = 0;
    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      if (!String(input).includes("/api/line-geometry/resolve")) {
        return Promise.resolve(new Response(JSON.stringify(createTopology())));
      }

      geometryRequestCount += 1;
      const request = JSON.parse(String(init?.body)) as LineGeometryRequest;
      const [from, to] = request.stops;
      const response = new Response(
        JSON.stringify({
          schemaVersion: 1,
          source: "gtfs",
          generatedAt: "2026-07-23T12:00:00.000Z",
          stops: request.stops,
          branches: request.branches,
          segments: [
            {
              id: request.branches[0].id,
              fromStopId: from.id,
              toStopId: to.id,
              coordinates: [from, to],
            },
          ],
          entrances: [],
          attempts: [{ source: "gtfs", status: "success" }],
        }),
      );

      return geometryRequestCount <= 2
        ? Promise.resolve(response)
        : new Promise<Response>(() => undefined);
    });
    vi.stubGlobal("fetch", fetchMock);

    const Host = defineComponent({
      setup() {
        const transfers = ref<TransferLineOption[]>([
          { id: "line:bus", label: "194", family: "BUS" },
          { id: "line:metro", label: "4", family: "METRO" },
        ]);
        const viewport = createGeographicViewport(
          [
            { lon: 2.3, lat: 48.8 },
            { lon: 2.4, lat: 48.9 },
          ],
          { viewBoxWidth: 1080, viewBoxHeight: 620, paddingX: 78, paddingY: 68 },
        );
        const { lines } = useNetworkGhost({
          anchor: {
            id: "anchor",
            label: "Anchor",
            lon: 2.35,
            lat: 48.85,
            mapX: 0.5,
            mapY: 0.5,
          },
          enabled: true,
          scope: "all",
          transfers,
          useGtfs: true,
          viewport,
        });

        const hideBus = () => {
          transfers.value = transfers.value.filter((transfer) => transfer.family !== "BUS");
        };
        return { hideBus, lines };
      },
      template: `
        <button data-testid="hide-bus" @click="hideBus">hide</button>
        <span data-testid="line-count">{{ lines.length }}</span>
        <span data-testid="line-labels">{{ lines.map((line) => line.label).join(',') }}</span>
      `,
    });
    const wrapper = mount(Host);
    await flushPromises();

    expect(wrapper.get('[data-testid="line-count"]').text()).toBe("2");
    expect(geometryRequestCount).toBe(2);

    await wrapper.get('[data-testid="hide-bus"]').trigger("click");
    await nextTick();

    expect(wrapper.get('[data-testid="line-count"]').text()).toBe("1");
    expect(wrapper.get('[data-testid="line-labels"]').text()).toBe("4");
    expect(geometryRequestCount).toBe(2);
  });
});

async function flushAnimationFrame(): Promise<void> {
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  await nextTick();
}

function createHost() {
  return defineComponent({
    setup() {
      const transfers = ref<TransferLineOption[]>(
        Array.from({ length: 10 }, (_, index) => ({
          id: `line:IDFM:C0000${index}`,
          label: `L${index}`,
          family: "METRO",
          mode: "Métro",
        })),
      );
      const viewport = createGeographicViewport(
        [
          { lon: 2.3, lat: 48.8 },
          { lon: 2.4, lat: 48.9 },
        ],
        {
          viewBoxWidth: 1080,
          viewBoxHeight: 620,
          paddingX: 78,
          paddingY: 68,
        },
      );
      const { lines, progress } = useNetworkGhost({
        anchor: {
          id: "anchor",
          label: "Anchor",
          lon: 2.35,
          lat: 48.85,
          mapX: 0.5,
          mapY: 0.5,
        },
        enabled: true,
        scope: "all",
        transfers,
        useGtfs: true,
        viewport,
      });

      return { lines, progress };
    },
    template: `
      <span data-testid="line-count">{{ lines.length }}</span>
      <span data-testid="progress">{{ progress.completed }}/{{ progress.total }}</span>
      <span data-testid="geometry-source">{{ lines[0]?.geometrySource }}</span>
    `,
  });
}

function createTestViewport() {
  return createGeographicViewport(
    [
      { lon: 2.3, lat: 48.8 },
      { lon: 2.4, lat: 48.9 },
    ],
    { viewBoxWidth: 1080, viewBoxHeight: 620, paddingX: 78, paddingY: 68 },
  );
}

function createTestAnchor() {
  return {
    id: "anchor",
    label: "Anchor",
    lon: 2.35,
    lat: 48.85,
    mapX: 0.5,
    mapY: 0.5,
  };
}

function createGeometryResponse(request: LineGeometryRequest): Response {
  const stops = new Map(request.stops.map((stop) => [stop.id, stop]));
  return new Response(
    JSON.stringify({
      schemaVersion: 1,
      source: "gtfs",
      datasetVersion: "2026-07-23",
      generatedAt: "2026-07-23T12:00:00.000Z",
      stops: request.stops,
      branches: request.branches,
      segments: request.branches.flatMap((branch) => {
        const from = stops.get(branch.stopIds[0]);
        const to = stops.get(branch.stopIds[1]);
        return from && to
          ? [
              {
                id: branch.id,
                fromStopId: from.id,
                toStopId: to.id,
                coordinates: [from, to],
              },
            ]
          : [];
      }),
      entrances: [],
      attempts: [{ source: "gtfs", status: "success" }],
    }),
  );
}

function createTopology() {
  return {
    stations: [
      { id: "a", name: "Anchor", lon: 2.35, lat: 48.85 },
      { id: "b", name: "Next", lon: 2.36, lat: 48.86 },
    ],
    segments: [{ id: "a-b", from: "a", to: "b" }],
    patterns: [],
  };
}
