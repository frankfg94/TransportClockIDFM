import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import StationCombobox from "../src/components/StationCombobox.vue";
import type { StationSearchOption } from "../src/types/transit";

const stations: StationSearchOption[] = [
  {
    id: "station:one",
    label: "Station One",
    monitoringRef: "station:one",
  },
  {
    id: "station:two",
    label: "Station Two",
    monitoringRef: "station:two",
  },
];

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  readonly observed: Element[] = [];

  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly options?: IntersectionObserverInit,
  ) {
    MockIntersectionObserver.instances.push(this);
  }

  disconnect(): void {}

  observe(element: Element): void {
    this.observed.push(element);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve(): void {}
}

afterEach(() => {
  MockIntersectionObserver.instances = [];
  vi.unstubAllGlobals();
});

describe("StationCombobox inline", () => {
  it("loads transfer badges only when a station enters the scroll viewport", async () => {
    vi.stubGlobal(
      "IntersectionObserver",
      MockIntersectionObserver as unknown as typeof IntersectionObserver,
    );

    const wrapper = mount(StationCombobox, {
      props: {
        inline: true,
        options: stations,
        query: "",
        transferMap: {},
        transferLoadingIds: [],
      },
    });

    await nextTick();
    await nextTick();

    const observer = MockIntersectionObserver.instances[0];
    expect(observer.observed).toHaveLength(stations.length);
    expect(wrapper.emitted("inspect")).toBeUndefined();

    observer.callback(
      [
        {
          isIntersecting: true,
          target: observer.observed[0],
        } as IntersectionObserverEntry,
      ],
      observer as unknown as IntersectionObserver,
    );

    expect(wrapper.emitted("inspect")).toEqual([[stations[0]]]);
  });
});
