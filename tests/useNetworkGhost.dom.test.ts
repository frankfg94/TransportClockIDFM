import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import {
  clearNetworkGhostTopologyCache,
  createGeographicViewport,
  useNetworkGhost,
} from "../src/features/network-ghost";
import type { TransferLineOption } from "../src/types/transit";

beforeEach(() => {
  clearNetworkGhostTopologyCache();
  vi.unstubAllGlobals();
});

describe("useNetworkGhost", () => {
  it("loads progressively with four workers and reuses topology promises", async () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const pending: Array<() => void> = [];
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          activeRequests += 1;
          maximumActiveRequests = Math.max(
            maximumActiveRequests,
            activeRequests,
          );
          pending.push(() => {
            activeRequests -= 1;
            resolve(new Response(JSON.stringify(createTopology())));
          });
        }),
    );

    vi.stubGlobal("fetch", fetchMock);
    const Host = createHost();
    const wrapper = mount(Host);

    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(4);

    pending.shift()?.();
    await flushPromises();
    expect(wrapper.get('[data-testid="line-count"]').text()).toBe("1");
    expect(fetchMock).toHaveBeenCalledTimes(5);

    while (fetchMock.mock.calls.length < 6) {
      pending.shift()?.();
      await flushPromises();
    }

    pending.splice(0).forEach((resolve) => resolve());
    await flushPromises();

    expect(maximumActiveRequests).toBe(4);
    expect(wrapper.get('[data-testid="line-count"]').text()).toBe("6");
    expect(wrapper.get('[data-testid="progress"]').text()).toBe("6/6");

    wrapper.unmount();

    const cachedWrapper = mount(Host);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(cachedWrapper.get('[data-testid="line-count"]').text()).toBe("6");
  });
});

function createHost() {
  return defineComponent({
    setup() {
      const transfers = ref<TransferLineOption[]>(
        Array.from({ length: 6 }, (_, index) => ({
          id: `line:test:${index}`,
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
        viewport,
      });

      return { lines, progress };
    },
    template: `
      <span data-testid="line-count">{{ lines.length }}</span>
      <span data-testid="progress">{{ progress.completed }}/{{ progress.total }}</span>
    `,
  });
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
