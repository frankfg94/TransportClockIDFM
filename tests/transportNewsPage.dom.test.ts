import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeNewsPreferences,
  type NewsArticle,
  type NewsSource,
} from "../src/features/transport-news/types";
import TransportNewsPage from "../src/features/transport-news/TransportNewsPage.vue";
import SettingsTransportNewsCategory from "../src/features/app-settings/SettingsTransportNewsCategory.vue";
import AppNavigationMenu from "../src/features/app-settings/AppNavigationMenu.vue";
import TransitBoard from "../src/components/TransitBoard.vue";
import { createDefaultAppSettings } from "../src/features/app-settings/appSettings";

const mocks = vi.hoisted(() => ({
  route: { path: "/feed", query: {} as Record<string, string>, params: {} },
  settings: undefined as any,
  replace: vi.fn(),
}));
vi.mock("#imports", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useRoute: () => mocks.route,
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock("../src/features/app-settings/appSettings", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAppSettings: () => ({ settings: mocks.settings }),
}));

const source: NewsSource = {
  id: "test-source",
  name: "Source officielle",
  url: "https://news.example/feed",
  method: "rss",
  kind: "official",
  regional: true,
  modes: ["metro", "bus"],
};
const article: NewsArticle = {
  id: "m4",
  title: "Prolongement du métro 4 vers Châtenay",
  url: "https://news.example/m4",
  sourceId: source.id,
  excerpt: "Le projet est à l’étude.",
  publishedAt: "2026-09-30T08:00:00Z",
  lines: [{ mode: "metro", code: "4" }],
  modes: ["metro"],
  topics: ["projects"],
};
const global = {
  stubs: {
    NuxtLink: {
      props: ["to"],
      template: "<a :href=\"typeof to === 'string' ? to : to.path\"><slot /></a>",
    },
    LineIconBadge: true,
    ContextMenu: { props: ["open"], template: '<div v-if="open"><slot /></div>' },
  },
};
beforeEach(() => {
  mocks.settings = ref(createDefaultAppSettings());
  mocks.route.query = {};
  mocks.replace.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});
function mockFetch(sources = [source], articles = [article]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith("/sources")
          ? { sources, statuses: [], catalogState: "unavailable" }
          : {
              sourceId: new URL(url, "http://localhost").searchParams.get("sourceId"),
              articles,
              state: "ready",
              checkedAt: new Date().toISOString(),
            },
    })),
  );
}
describe("transport news UI", () => {
  it("loads real-shaped articles, overrides the disabled card mode, then clears the line", async () => {
    mocks.route.query = { mode: "metro", line: "4" };
    mocks.settings.value.transportNews.modes = ["bus"];
    mockFetch();
    const wrapper = mount(TransportNewsPage, { global });
    await flushPromises();
    expect(wrapper.findAll(".news-card")).toHaveLength(1);
    expect(wrapper.text()).toContain("Le projet est à l’étude.");
    expect(wrapper.find(".news-chip--selected").text()).toContain("Métro 4");
    expect(wrapper.text()).toContain("La couverture est partielle");
    await wrapper.find(".news-chip--selected").trigger("click");
    await flushPromises();
    expect(mocks.replace).toHaveBeenCalledWith({ path: "/feed", query: {} });
    expect(wrapper.findAll(".news-card")).toHaveLength(0);
    wrapper.unmount();
  });
  it("caps browser collection at four concurrent requests and shows source errors", async () => {
    const sources = Array.from({ length: 6 }, (_, i) => ({ ...source, id: `source-${i}` }));
    let active = 0;
    let maximum = 0;
    const releases: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/sources"))
          return { ok: true, json: async () => ({ sources, catalogState: "ready" }) };
        active++;
        maximum = Math.max(maximum, active);
        await new Promise<void>((resolve) =>
          releases.push(() => {
            active--;
            resolve();
          }),
        );
        const id = new URL(url, "http://localhost").searchParams.get("sourceId");
        return {
          ok: true,
          json: async () => ({ sourceId: id, articles: [], state: "unavailable", httpStatus: 403 }),
        };
      }),
    );
    const wrapper = mount(TransportNewsPage, { global });
    await flushPromises();
    expect(active).toBe(4);
    releases.splice(0).forEach((release) => release());
    await flushPromises();
    expect(active).toBe(2);
    releases.splice(0).forEach((release) => release());
    await flushPromises();
    expect(maximum).toBe(4);
    expect(wrapper.text()).toContain("HTTP 403");
    expect(wrapper.findAll(".news-card")).toHaveLength(0);
    wrapper.unmount();
  });
  it("paginates by thirty and applies search without fetching again", async () => {
    const articles = Array.from({ length: 35 }, (_, i) => ({
      ...article,
      id: String(i),
      url: `https://news.example/${i}`,
      title: `Projet métro ${i}`,
    }));
    mockFetch([source], articles);
    const wrapper = mount(TransportNewsPage, { global });
    await flushPromises();
    expect(wrapper.findAll(".news-card")).toHaveLength(30);
    await wrapper.find(".news-page__more").trigger("click");
    expect(wrapper.findAll(".news-card")).toHaveLength(35);
    const calls = vi.mocked(fetch).mock.calls.length;
    await wrapper
      .find('.news-page__desktop-filters input[type="search"]')
      .setValue("Projet métro 34");
    expect(wrapper.findAll(".news-card")).toHaveLength(1);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
    wrapper.unmount();
  });
  it("emits persistent source preferences through the settings contract", async () => {
    mockFetch();
    const wrapper = mount(SettingsTransportNewsCategory, {
      props: { settings: mocks.settings.value, panelOpen: true, isSettingVisible: () => true },
    });
    await flushPromises();
    const sourceToggle = wrapper.findAll('input[type="checkbox"]').at(-1)!;
    await sourceToggle.setValue(false);
    expect(wrapper.emitted("update-settings")?.[0]).toEqual([
      { transportNews: { ...normalizeNewsPreferences(undefined), disabledSources: [source.id] } },
    ]);
    wrapper.unmount();
  });
  it("keeps the feed in the secondary navigation menu", async () => {
    const wrapper = mount(AppNavigationMenu, { global });
    expect(wrapper.find('a[href="/feed"]').exists()).toBe(false);
    await wrapper.find(".app-navigation__menu-button").trigger("click");
    expect(wrapper.find('a[href="/feed"]').text()).toBe("Feed transports");
    wrapper.unmount();
  });
  it("closes the card menu and emits the selected board for news navigation", async () => {
    const board = {
      id: "m4",
      title: "Bagneux",
      city: "Bagneux",
      line: {
        ref: "line:m4",
        mode: "metro" as const,
        shortName: "4",
        longName: "Métro 4",
        color: "#a0006e",
        textColor: "#fff",
      },
      monitoringPoints: [],
      directionGroups: [],
      maxDepartures: 5,
    };
    const wrapper = mount(TransitBoard, {
      props: {
        board,
        departures: [],
        directionGroups: [],
        collapsedDirectionIds: [],
        loading: false,
      },
      global,
    });
    await wrapper.find(".board-actions__trigger").trigger("click");
    const action = wrapper
      .findAll('[role="menuitem"]')
      .find((item) => item.text() === "Voir les actualités")!;
    await action.trigger("click");
    expect(wrapper.emitted("open-news")?.[0]).toEqual([board]);
    expect(wrapper.find('[role="menuitem"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
