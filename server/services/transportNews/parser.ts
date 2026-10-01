import { XMLParser, XMLValidator } from "fast-xml-parser";
import { parse } from "node-html-parser";
import { normalizeNewsLine, mergeNewsArticles } from "../../../src/features/transport-news/filter";
import type {
  NewsArticle,
  NewsLine,
  NewsMode,
  NewsSource,
  NewsTopic,
} from "../../../src/features/transport-news/types";

export function plainText(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const root = parse(String(value));
  root.querySelectorAll("script, style, iframe, object, noscript").forEach((node) => node.remove());
  return root.structuredText.replace(/\s+/gu, " ").trim();
}
export function canonicalNewsUrl(value: unknown, base: string): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value, base);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return;
    url.hash = "";
    [...url.searchParams.keys()]
      .filter((key) => /^(utm_|fbclid$|gclid$)/i.test(key))
      .forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return;
  }
}
export function newsDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}
const regionPattern =
  /île[- ]de[- ]france|ile[- ]de[- ]france|francilien|paris|transilien|ratp|idfm|clamart|châtenay|chatenay|bagneux|sceaux|bourg.la.reine|hauts.de.seine|val.de.marne|seine.saint.denis|essonne|yvelines|val.d.oise|seine.et.marne/iu;
const transportPattern =
  /métro|metro|tram|\brer\b|transilien|\bbus\b|noctilien|téléphérique|telepherique|transport|ferroviaire|\bgare[s]?\b|\brame[s]?\b|grand paris express|\bt\s?\d{1,2}\b|\bmi\s?\d{2}\b|\bmr\s?\d{2}\b/iu;

export function identifyNewsLines(text: string, source: NewsSource): NewsLine[] {
  text = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const lines: NewsLine[] = [];
  const add = (mode: string, code: string) => {
    const line = normalizeNewsLine(mode, code);
    if (line && !lines.some((other) => other.mode === line.mode && other.code === line.code))
      lines.push(line);
  };
  for (const match of text.matchAll(/\bRER\s*([A-E])\b(?:\s*(?:et|&|\/)\s*([A-E])\b)?/giu)) {
    add("rer", match[1]!);
    if (match[2]) add("rer", match[2]);
  }
  for (const match of text.matchAll(/\bT\s?(\d{1,2})(?!\d)\b/giu)) add("tram", match[1]!);
  for (const match of text.matchAll(/\bM\s?(\d{1,2}(?:bis)?)(?!\d)\b/giu)) add("metro", match[1]!);
  for (const match of text.matchAll(
    /(?:métro|metro)\s*(?:ligne\s*)?(\d{1,2}(?:\s?bis)?)(?!\d)\b/giu,
  ))
    add("metro", match[1]!.replace(/\s/g, ""));
  for (const match of text.matchAll(/ligne\s*(\d{1,2}(?:\s?bis)?)\s*(?:du|de|de la)?\s*metro/giu))
    add("metro", match[1]!.replace(/\s/g, ""));
  if (/grand paris express/iu.test(text))
    for (const match of text.matchAll(/ligne\s*(1[5678])\b/giu)) add("metro", match[1]!);
  for (const match of text.matchAll(/tram(?:way)?\s*(?:ligne\s*)?(\d{1,2})\b/giu))
    add("tram", match[1]!);
  if (/\bRER\b/iu.test(text))
    for (const match of text.matchAll(/ligne\s*([A-E])\b/giu)) add("rer", match[1]!);
  for (const match of text.matchAll(/\b(?:bus|autobus)\s*(?:ligne\s*)?(\d{1,4})\b/giu))
    add("bus", match[1]!);
  for (const match of text.matchAll(/\bN\s?(\d{2,3})\b/giu)) add("noctilien", `N${match[1]}`);
  for (const match of text.matchAll(
    /\b(?:transilien\s*(?:lignes?\s*)?|lignes?\s+)([HJKLNPRUV])\b(?:\s*(?:et|&|\/)\s*([HJKLNPRUV])\b)?/giu,
  )) {
    add("train", match[1]!);
    if (match[2]) add("train", match[2]);
  }
  for (const match of text.matchAll(/\b(?:câble|cable)\s*C?\s?(\d+)\b/giu))
    add("cable", `C${match[1]}`);
  // A dedicated publisher's line is evidence; a general publisher never supplies a guessed line.
  if (source.lines?.length === 1) source.lines.forEach((line) => add(line.mode, line.code));
  return lines;
}
export function identifyNewsTopics(text: string): NewsTopic[] {
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const topics: NewsTopic[] = [];
  const patterns: [NewsTopic, RegExp][] = [
    [
      "projects",
      /prolong|extension|nouvelle ligne|projet|concertation|enquete publique|mise en service|inaugur|financement|grand paris express/,
    ],
    ["works", /travaux|chantier|renovat|modernisat|amenagement|construction/],
    [
      "stations",
      /accessibil|ascenseur|pole d.echange|(?:nouvell?e?|renovat|modernisat|amenagement|construction|ce qui a change).{0,100}\b(?:gares?|stations?)\b|\b(?:gares?|stations?)\b.{0,100}(?:renovat|modernisat|amenagement|extension|nouvel acces|passage souterrain)/,
    ],
    [
      "vehicles",
      /materiel roulant|rame|nouveaux trains|nouveau train|mi\s?\d{2}|mr\s?\d{2}|alstom|caf\b|automatis|electri|hydrogene|biomethane/,
    ],
    [
      "service",
      /desserte|frequence|renumerot|offre de transport|restructur|nouveau reseau|nouveaux horaires|renforcement/,
    ],
    [
      "urbanism",
      /urbanisme|amenagement du territoire|quartier|\bzac\b|zone d.amenagement|renouvellement urbain|\bplu[ij]?\b|operation d.amenagement|requalification urbaine|friche|amenageur|ecoquartier/,
    ],
    [
      "realEstate",
      /immobilier|logement|habitat|marche immobilier|prix au m2|vente immobiliere|foncier|promotion immobiliere|loyer locatif/,
    ],
    ["strikes", /greve|mouvement social/],
    ["disruptions", /incident|perturbation|interruption|panne|accident|trafic interrompu/],
  ];
  for (const [topic, pattern] of patterns) if (pattern.test(normalized)) topics.push(topic);
  // A station mentioned in an incident does not turn it into an improvement project.
  if (
    topics.includes("strikes") &&
    !topics.some((topic) => ["projects", "vehicles", "service"].includes(topic))
  )
    return ["strikes"];
  if (
    topics.includes("disruptions") &&
    !topics.some((topic) => ["projects", "works", "vehicles", "service"].includes(topic))
  )
    return ["disruptions"];
  return topics.length ? topics : ["general"];
}
export function createNewsArticle(
  source: NewsSource,
  titleValue: unknown,
  urlValue: unknown,
  excerptValue: unknown,
  dateValue?: unknown,
): NewsArticle | undefined {
  const title = plainText(titleValue).slice(0, 300);
  const fullExcerpt = plainText(excerptValue);
  const excerpt =
    fullExcerpt.length > 350
      ? `${fullExcerpt.slice(0, 350).replace(/\s+\S*$/u, "")}…`
      : fullExcerpt;
  const url = canonicalNewsUrl(urlValue, source.url);
  const text = `${title} ${excerpt}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const topics = identifyNewsTopics(text);
  const isUrbanismOrRealEstate = topics.some((topic) => topic === "urbanism" || topic === "realEstate");
  if (
    !url ||
    title.length < 6 ||
    (!transportPattern.test(text) && !isUrbanismOrRealEstate) ||
    (!source.regional && !regionPattern.test(text))
  )
    return;
  const lines = identifyNewsLines(text, source);
  const modes = new Set<NewsMode>(lines.map((line) => line.mode));
  for (const [mode, pattern] of [
    ["metro", /métro|metro/iu],
    ["rer", /\brer\b/iu],
    ["train", /transilien/iu],
    ["tram", /tram/iu],
    ["bus", /\bbus\b|autobus|tzen|t zen/iu],
    ["noctilien", /noctilien/iu],
    ["cable", /câble|cable|téléphérique|telepherique/iu],
  ] as const)
    if (pattern.test(text)) modes.add(mode);
  if (!modes.size) source.modes.forEach((mode) => modes.add(mode));
  let articleTopics = topics;
  const normalizedTitle = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/que s.est.il passe|incident|accident|panne|perturbation/.test(normalizedTitle))
    articleTopics = ["disruptions"];
  return {
    id: `${source.id}:${url}`,
    sourceId: source.id,
    title,
    url,
    excerpt,
    publishedAt: newsDate(dateValue),
    lines,
    modes: [...modes],
    topics: articleTopics,
  };
}
const array = (value: unknown): any[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const scalar = (value: any): any =>
  value && typeof value === "object"
    ? Object.entries(value)
        .filter(([key]) => !key.startsWith("@_"))
        .map(([, part]) => (Array.isArray(part) ? part.map(scalar).join(" ") : scalar(part)))
        .filter(Boolean)
        .join(" ")
    : value;
export function parseNewsRss(body: string, source: NewsSource): NewsArticle[] {
  if (XMLValidator.validate(body) !== true) throw new Error("parse");
  const xml = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    processEntities: true,
    parseTagValue: false,
    removeNSPrefix: false,
  }).parse(body);
  const items = xml.rss?.channel?.item ?? xml.feed?.entry ?? xml["rdf:RDF"]?.item;
  if (!xml.rss && !xml.feed && !xml["rdf:RDF"]) throw new Error("parse");
  return mergeNewsArticles(
    array(items)
      .slice(0, 100)
      .flatMap((item) => {
        const links = array(item.link);
        const link = links.find(
          (value) =>
            typeof value === "object" && (!value["@_rel"] || value["@_rel"] === "alternate"),
        );
        const article = createNewsArticle(
          source,
          scalar(item.title),
          link?.["@_href"] ?? scalar(item.link) ?? scalar(item.guid),
          scalar(item.description ?? item.summary ?? item["content:encoded"] ?? item.content),
          scalar(item.pubDate ?? item.published ?? item["dc:date"] ?? item.updated),
        );
        return article ? [article] : [];
      }),
  );
}
export function parseNewsArticleHtml(
  body: string,
  source: NewsSource,
  pageUrl = source.url,
): NewsArticle | undefined {
  const root = parse(body);
  const meta = (key: string) =>
    root.querySelector(`meta[property="${key}"],meta[name="${key}"]`)?.getAttribute("content");
  let structured: any;
  for (const node of root.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(node.textContent);
      const entries = array(data).flatMap((item) => array(item["@graph"] ?? item));
      structured = entries.find((item) =>
        /Article|NewsArticle|BlogPosting/.test(String(item["@type"])),
      );
      if (structured) break;
    } catch {
      /* A malformed publisher metadata block does not hide the article. */
    }
  }
  root
    .querySelectorAll("nav,footer,aside,script,style,[role='dialog']")
    .forEach((node) => node.remove());
  const article =
    root.querySelector(".entry-content,.article-content,[itemprop='articleBody']") ??
    root.querySelector("article") ??
    root.querySelector("main") ??
    root;
  const paragraphs = article
    .querySelectorAll("p")
    .map((node) => plainText(node.innerHTML))
    .filter((text) => text.length >= 70 && !/©|crédits? photo|copyright/iu.test(text));
  const bodyExcerpt = paragraphs.find((text) =>
    transportPattern.test(text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")),
  );
  const metadataDescription = meta("og:description") ?? meta("description");
  const description =
    structured?.description ??
    (metadataDescription && metadataDescription.length >= 70 ? metadataDescription : undefined) ??
    bodyExcerpt ??
    paragraphs[0];
  return createNewsArticle(
    source,
    structured?.headline ?? meta("og:title") ?? root.querySelector("h1")?.textContent,
    pageUrl,
    description,
    structured?.datePublished ??
      meta("article:published_time") ??
      article?.querySelector("time")?.getAttribute("datetime"),
  );
}
export function newsHtmlLinks(body: string, source: NewsSource): string[] {
  const root = parse(body);
  const scope = root.querySelector("main") ?? root;
  return [
    ...new Set(
      scope.querySelectorAll("a[href]").flatMap((node) => {
        const url = canonicalNewsUrl(node.getAttribute("href"), source.url);
        if (
          !url ||
          new URL(url).hostname !== new URL(source.url).hostname ||
          !new URL(url).pathname.includes(source.articlePath ?? "/actualites/") ||
          new URL(url).pathname.replace(/\/$/, "") ===
            new URL(source.url).pathname.replace(/\/$/, "")
        )
          return [];
        return [url];
      }),
    ),
  ].slice(0, 16);
}
export function discoverIdfmProjects(body: string): NewsSource[] {
  const root = parse(body);
  const slugs = [
    ...new Set(
      root
        .querySelectorAll("a[href]")
        .map(
          (node) =>
            node.getAttribute("href")?.match(/\/le-reseau\/projets\/([a-z0-9-]+)(?:\/|$)/)?.[1],
        )
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  return slugs
    .filter((slug) => slug !== "tram-t10-prolongement")
    .map((slug) => ({
      id: `idfm-project-${slug}`,
      name: `IDFM — ${plainText(root.querySelectorAll("a[href]").find((node) => node.getAttribute("href")?.includes(`/projets/${slug}`))?.textContent) || slug}`,
      url: `https://www.iledefrance-mobilites.fr/le-reseau/projets/${slug}/actualites`,
      method: "html",
      kind: "official",
      regional: true,
      modes: ["metro", "rer", "train", "tram", "bus", "noctilien", "cable"],
      articlePath: `/projets/${slug}/actualites/`,
    }));
}
