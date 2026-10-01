import { describe, expect, it, vi } from "vitest";
import { NEWS_SOURCES } from "../src/features/transport-news/sources";
import {
  NEWS_MODES,
  normalizeNewsPreferences,
  type NewsArticle,
  type NewsSource,
} from "../src/features/transport-news/types";
import {
  filterNewsArticles,
  mergeNewsArticles,
  normalizeNewsLine,
} from "../src/features/transport-news/filter";
import {
  canonicalNewsUrl,
  createNewsArticle,
  discoverIdfmProjects,
  identifyNewsLines,
  identifyNewsTopics,
  newsHtmlLinks,
  parseNewsArticleHtml,
  parseNewsRss,
  plainText,
} from "../server/services/transportNews/parser";
import {
  createNewsCollector,
  fetchNewsDocument,
  NEWS_CACHE_MS,
} from "../server/services/transportNews/collector";
import {
  createDefaultAppSettings,
  normalizeAppSettings,
} from "../src/features/app-settings/appSettings";
import { isNearbyNewsArticle } from "../src/features/nearby-stations/nearbyNewsAlerts";

const source: NewsSource = {
  id: "test",
  name: "Test",
  url: "https://news.example/feed",
  method: "rss",
  kind: "official",
  regional: true,
  modes: [...NEWS_MODES],
};
const rss = `<rss version="2.0"><channel><title>Transport</title><item><title>Prolongement du T10 à Clamart</title><link>https://news.example/t10?utm_source=rss</link><description><![CDATA[<p>Le projet de tramway avance &amp; se précise.</p><script>alert(1)</script>]]></description><pubDate>Thu, 01 Oct 2026 08:00:00 GMT</pubDate></item><item><title>Bus 4 : nouvelle desserte</title><link>https://news.example/bus4</link></item></channel></rss>`;

describe("transport news parsing and attribution", () => {
  it("preserves word boundaries between HTML blocks", () => {
    expect(plainText("<div>Description</div><p>Publication du rapport</p><script>alert(1)</script>"))
      .toBe("Description Publication du rapport");
  });
  it("parses RSS safely, strips active markup and preserves missing dates", () => {
    const articles = parseNewsRss(rss, source);
    expect(articles).toHaveLength(2);
    expect(articles[0]).toMatchObject({
      title: "Prolongement du T10 à Clamart",
      url: "https://news.example/t10",
      excerpt: "Le projet de tramway avance & se précise.",
      publishedAt: "2026-10-01T08:00:00.000Z",
      lines: [{ mode: "tram", code: "T10" }],
    });
    expect(articles[1]!.publishedAt).toBeUndefined();
    expect(() => parseNewsRss("<html>blocked</html>", source)).toThrow();
  });
  it("parses Atom links and embedded XHTML", () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>RER A : nouvelles rames</title><link rel="self" href="https://news.example/atom"/><link rel="alternate" href="https://news.example/a"/><summary type="html">&lt;p&gt;Modernisation du matériel roulant&lt;/p&gt;</summary><published>2026-09-25T12:00:00Z</published></entry></feed>`;
    expect(parseNewsRss(atom, source)[0]).toMatchObject({
      url: "https://news.example/a",
      excerpt: "Modernisation du matériel roulant",
      lines: [{ mode: "rer", code: "A" }],
    });
  });
  it("keeps line codes and modes distinct, including future metro lines", () => {
    expect(identifyNewsLines("Prolongement du T10", source)).toEqual([
      { mode: "tram", code: "T10" },
    ]);
    expect(identifyNewsLines("Métro 4 et bus 4 : projet", source)).toEqual([
      { mode: "metro", code: "4" },
      { mode: "bus", code: "4" },
    ]);
    expect(identifyNewsLines("RER A et Transilien N", source)).toEqual([
      { mode: "rer", code: "A" },
      { mode: "train", code: "N" },
    ]);
    expect(identifyNewsLines("Grand Paris Express : ligne 18", source)).toEqual([
      { mode: "metro", code: "18" },
    ]);
    expect(normalizeNewsLine("transilien", "N")).toEqual({ mode: "train", code: "N" });
  });
  it("does not mark disruptions at stations as station improvements", () => {
    expect(identifyNewsTopics("Incident en gare : interruption du RER A")).toEqual(["disruptions"]);
    expect(identifyNewsTopics("Grève : fermeture des stations du métro")).toEqual(["strikes"]);
  });
  it("classifies regional urban planning and property stories without inventing a transit line", () => {
    expect(identifyNewsTopics("Plan local d’urbanisme et transformation du quartier")).toContain("urbanism");
    const article = createNewsArticle(
      source,
      "Projet de logements à Clamart",
      "/housing",
      "Ce programme immobilier transforme un ancien site en logements.",
    );
    expect(article?.topics).toContain("realEstate");
    expect(article?.lines).toEqual([]);
  });
  it("rejects irrelevant local posts and national news outside the region", () => {
    expect(
      createNewsArticle(source, "Concours de cuisine municipal", "/post", "Inscrivez-vous"),
    ).toBeUndefined();
    expect(
      createNewsArticle(
        { ...source, regional: false },
        "Nouveau tramway à Lyon",
        "/lyon",
        "Un nouveau projet",
      ),
    ).toBeUndefined();
    expect(
      createNewsArticle(
        source,
        "Vers une région zéro plastique",
        "/plastique",
        "Accélérer le réemploi pour améliorer le recyclage.",
      ),
    ).toBeUndefined();
  });
  it("reads article metadata without inventing dates or project status", () => {
    const article = parseNewsArticleHtml(
      `<main><h1>Prolongement de la ligne 4 du métro</h1><p>Les maires demandent une étude.</p></main><script type="application/ld+json">{"@type":"NewsArticle","headline":"Prolongement du métro 4","description":"Les maires demandent une étude.","datePublished":"2025-05-01"}</script>`,
      source,
      "https://news.example/m4",
    );
    expect(article).toMatchObject({
      excerpt: "Les maires demandent une étude.",
      publishedAt: "2025-05-01T00:00:00.000Z",
      lines: [{ mode: "metro", code: "4" }],
    });
    expect(canonicalNewsUrl("javascript:alert(1)", source.url)).toBeUndefined();
  });
  it("restricts HTML article discovery to publisher paths and discovers official projects", () => {
    const htmlSource = { ...source, articlePath: "/actualites/" };
    expect(
      newsHtmlLinks(
        `<main><a href="/actualites/t10">Tram</a><a href="https://other.example/actualites/t10">Other</a><a href="/contact">Contact</a></main>`,
        htmlSource,
      ),
    ).toEqual(["https://news.example/actualites/t10"]);
    expect(
      discoverIdfmProjects(`<a href="/le-reseau/projets/cablec1">Câble C1</a>`)[0],
    ).toMatchObject({
      id: "idfm-project-cablec1",
      name: "IDFM — Câble C1",
      url: "https://www.iledefrance-mobilites.fr/le-reseau/projets/cablec1/actualites",
    });
  });
});
describe("transport news cache and preferences", () => {
  it("caches for thirty minutes and retains the last snapshot on a failed refresh", async () => {
    let now = Date.parse("2026-10-01T08:00:00Z");
    const read = vi.fn().mockResolvedValueOnce(rss).mockRejectedValueOnce(new Error("offline"));
    const collector = createNewsCollector(read, () => now);
    const first = await collector.collect(source);
    now += NEWS_CACHE_MS - 1;
    expect(await collector.collect(source)).toBe(first);
    expect(read).toHaveBeenCalledTimes(1);
    now += 2;
    expect(await collector.collect(source)).toMatchObject({
      state: "stale",
      articles: first.articles,
      fetchedAt: first.fetchedAt,
    });
  });
  it("shares concurrent requests and returns a visible error when no snapshot exists", async () => {
    const read = vi.fn().mockResolvedValue(rss);
    const collector = createNewsCollector(read);
    const [a, b] = await Promise.all([collector.collect(source), collector.collect(source)]);
    expect(a).toBe(b);
    expect(read).toHaveBeenCalledTimes(1);
    expect(
      await createNewsCollector(async () => {
        throw new Error("blocked");
      }).collect(source),
    ).toMatchObject({ state: "unavailable", articles: [] });
  });
  it("reports HTTP failures and refuses a redirect to an untrusted host", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await createNewsCollector().collect(source)).toMatchObject({
        state: "unavailable",
        error: "http",
        httpStatus: 403,
      });
      fetchMock.mockResolvedValue(
        new Response("", {
          status: 302,
          headers: { location: "https://internal.example/private" },
        }),
      );
      await expect(fetchNewsDocument(source.url)).rejects.toMatchObject({ kind: "http" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("limits concurrent upstream documents to four", async () => {
    const releases: (() => void)[] = [];
    let active = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise<void>((resolve) => releases.push(resolve));
        active--;
        return new Response("<rss />");
      }),
    );
    try {
      const requests = Array.from({ length: 7 }, () => fetchNewsDocument(source.url));
      for (let round = 0; round < 10; round++) {
        await new Promise((resolve) => setTimeout(resolve, 0));
        releases.splice(0).forEach((release) => release());
      }
      await Promise.all(requests);
      expect(peak).toBe(4);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("normalizes old settings, removes invalid values and preserves explicit empty preferences", () => {
    expect(normalizeAppSettings({}).transportNews).toEqual(
      createDefaultAppSettings().transportNews,
    );
    expect(
      normalizeNewsPreferences({
        modes: ["tram", "tram", "plane"],
        topics: [],
        disabledSources: ["rer-a", "https://evil.example"],
      }),
    ).toEqual({ modes: ["tram"], topics: [], disabledSources: ["rer-a"] });
    const settings = normalizeAppSettings({
      transportNews: { modes: [], topics: ["projects"], disabledSources: [] },
    });
    expect(normalizeAppSettings(JSON.parse(JSON.stringify(settings))).transportNews).toEqual(
      settings.transportNews,
    );
  });
  it("combines filters, exact line matching and preferences while allowing the card mode override", () => {
    const articles = parseNewsRss(rss, source);
    const preferences = normalizeNewsPreferences(undefined);
    expect(
      filterNewsArticles(articles, preferences, { line: { mode: "tram", code: "T1" } }),
    ).toEqual([]);
    expect(
      filterNewsArticles(articles, preferences, { line: { mode: "metro", code: "4" } }),
    ).toEqual([]);
    expect(
      filterNewsArticles(articles, preferences, {
        query: "clamart",
        topic: "projects",
        sourceId: "test",
        line: { mode: "tram", code: "T10" },
      }),
    ).toHaveLength(1);
    expect(
      filterNewsArticles(
        articles,
        { ...preferences, modes: [] },
        { line: { mode: "tram", code: "T10" } },
      ),
    ).toHaveLength(1);
    expect(filterNewsArticles(articles, { ...preferences, disabledSources: ["test"] })).toEqual([]);
    expect(mergeNewsArticles([...articles, ...articles])).toHaveLength(2);
  });
  it("keeps source IDs unique", () =>
    expect(new Set(NEWS_SOURCES.map((item) => item.id)).size).toBe(NEWS_SOURCES.length));
});

describe("nearby feed notification scope", () => {
  const makeArticle = (overrides: Partial<NewsArticle>): NewsArticle => ({
    id: "source:article",
    title: "Actualité locale",
    url: "https://news.example/article",
    sourceId: "source",
    excerpt: "",
    modes: ["metro", "bus"],
    lines: [],
    topics: ["urbanism"],
    ...overrides,
  });
  const preferences = normalizeNewsPreferences(undefined);

  it("keeps metro and bus numbers distinct and requires a nearby line match", () => {
    const metroArticle = makeArticle({ lines: [{ mode: "metro", code: "4" }], topics: ["projects"] });
    expect(isNearbyNewsArticle(metroArticle, { lines: [{ mode: "metro", code: "4" }], localities: [] }, [], preferences)).toBe(true);
    expect(isNearbyNewsArticle(metroArticle, { lines: [{ mode: "bus", code: "4" }], localities: [] }, [], preferences)).toBe(false);
  });

  it("shows urban planning stories only when their municipality matches this area", () => {
    const article = makeArticle({ title: "Projet d’aménagement à Châtenay-Malabry" });
    expect(isNearbyNewsArticle(article, { lines: [], localities: ["Châtenay-Malabry"] }, [], preferences)).toBe(true);
    expect(isNearbyNewsArticle(article, { lines: [], localities: ["Bagneux"] }, [], preferences)).toBe(false);
  });

  it("uses municipality source coverage and respects disabled topics and sources", () => {
    const article = makeArticle({ title: "Nouveaux logements du quartier", sourceId: "clamart" });
    const sourceWithArea: NewsSource = { ...source, id: "clamart", areas: ["Clamart"] };
    expect(isNearbyNewsArticle(article, { lines: [], localities: ["Clamart"] }, [sourceWithArea], preferences)).toBe(true);
    expect(isNearbyNewsArticle(article, { lines: [], localities: ["Clamart"] }, [sourceWithArea], { ...preferences, topics: [] })).toBe(false);
    expect(isNearbyNewsArticle(article, { lines: [], localities: ["Clamart"] }, [sourceWithArea], { ...preferences, disabledSources: ["clamart"] })).toBe(false);
  });
});
