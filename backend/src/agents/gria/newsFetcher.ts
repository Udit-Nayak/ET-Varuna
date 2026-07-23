import { DEFAULT_LIMIT, FETCH_RETRY_COUNT, FETCH_TIMEOUT_MS, GRIA_KEYWORDS } from "./constants";
import { FetchResult, NewsArticle, NewsSourceProviderType, PipelineInput } from "./types";

type SourceKind = "json" | "rss";
type QueryProfile = "india_diplomacy" | "oil_markets" | "maritime_chokepoints" | "geopolitical_shock";
type SourceFetchContext = {
  query: string;
  limit: number;
  since?: string;
  now: Date;
};

type SourceAdapter = {
  id: string;
  name: string;
  kind: SourceKind;
  providerType: NewsSourceProviderType;
  enabled: () => boolean;
  buildUrls: (context: SourceFetchContext) => string[];
  headers?: Record<string, string>;
  categories: string[];
  profiles: QueryProfile[];
};

type SourceStats = FetchResult["sourceStats"][number];
type NormalizedCandidate = Partial<NewsArticle> & { source?: string; raw?: unknown };

const CATEGORY_QUERIES = [
  '("India" OR "Indian" OR MEA OR "foreign relations" OR diplomacy OR bilateral)',
  '(war OR conflict OR terror OR piracy OR blockade OR military OR sanctions OR tariff OR "export ban")',
  '(oil OR petroleum OR LNG OR gas OR OPEC OR "OPEC+" OR energy OR crude OR refinery OR "strategic reserve")',
  '(finance OR trade OR markets OR commodities OR inflation OR rates OR currency OR "trade opportunity")',
  '(shipping OR maritime OR ports OR chokepoint OR logistics OR "supply chain" OR freight OR reroute)',
  '(Hormuz OR Suez OR "Bab-el-Mandeb" OR Malacca OR Panama OR "Black Sea" OR "Red Sea" OR "South China Sea" OR "Persian Gulf")',
  '("US India" OR "China India" OR "Russia India" OR "Iran India" OR "Saudi India" OR "UAE India")',
].join(" OR ");

const QUERY_PROFILES: Record<QueryProfile, string> = {
  india_diplomacy:
    '("India" OR Indian OR MEA) AND (diplomacy OR bilateral OR "foreign relations" OR "strategic partnership" OR sanctions OR trade)',
  oil_markets:
    '(oil OR crude OR petroleum OR LNG OR gas OR OPEC OR "OPEC+" OR refinery) AND (India OR Asia OR imports OR prices OR sanctions OR supply)',
  maritime_chokepoints:
    '(shipping OR maritime OR tanker OR freight OR port OR reroute OR chokepoint OR Hormuz OR Suez OR "Bab-el-Mandeb" OR Malacca OR "Red Sea" OR "Persian Gulf")',
  geopolitical_shock:
    '(war OR conflict OR blockade OR missile OR attack OR sanctions OR tariff OR "export ban" OR "supply disruption") AND (oil OR energy OR trade OR shipping OR India)',
};

const DEFAULT_ENABLED_SOURCE_IDS = new Set(
  (process.env.GRIA_ENABLED_SOURCES ??
    [
      "newsapi-energy-geopolitics",
      "mea-india",
      "marinelink",
    ].join(","))
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
);

const isoDate = (date: Date): string => date.toISOString();
const gdeltDate = (date: Date): string =>
  date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "");

const boundedSince = (value: string | undefined, now: Date): Date => {
  const parsed = new Date(value ?? "");
  const fallbackHours = Math.max(1, Number(process.env.GRIA_DEFAULT_LOOKBACK_HOURS ?? 24));
  const minDate = new Date(now.getTime() - fallbackHours * 60 * 60 * 1000);
  if (Number.isNaN(parsed.getTime())) return minDate;
  return parsed < minDate ? minDate : parsed;
};

const appendDateParams = (url: URL, since: string | undefined, now: Date): URL => {
  url.searchParams.set("from", isoDate(boundedSince(since, now)));
  url.searchParams.set("to", isoDate(now));
  return url;
};

const appendGdeltDateParams = (url: URL, since: string | undefined, now: Date): URL => {
  url.searchParams.set("startdatetime", gdeltDate(boundedSince(since, now)));
  url.searchParams.set("enddatetime", gdeltDate(now));
  return url;
};

const TRUSTED_SOURCE_REGISTRY: SourceAdapter[] = [
  {
    id: "newsapi-energy-geopolitics",
    name: "NewsAPI",
    kind: "json",
    providerType: "NewsAPI",
    enabled: () => Boolean(process.env.NEWSAPI_KEY),
    buildUrls: ({ query, limit, since, now }) => {
      const url = appendDateParams(new URL("https://newsapi.org/v2/everything"), since, now);
      url.searchParams.set("q", query.slice(0, 500));
      url.searchParams.set("searchIn", "title,description,content");
      url.searchParams.set(
        "domains",
        "reuters.com,apnews.com,mea.gov.in,mopng.gov.in,opec.org,iea.org,marinelink.com,maritime-executive.com"
      );
      url.searchParams.set("language", "en");
      url.searchParams.set("sortBy", "publishedAt");
      url.searchParams.set("pageSize", String(Math.min(limit, 100)));
      url.searchParams.set("apiKey", process.env.NEWSAPI_KEY ?? "");
      return [url.toString()];
    },
    categories: [],
    profiles: ["india_diplomacy", "oil_markets", "maritime_chokepoints", "geopolitical_shock"],
  },
  {
    id: "gdelt-energy-geopolitics",
    name: "GDELT",
    kind: "json",
    providerType: "GDELT",
    enabled: () => process.env.GRIA_ENABLE_GDELT === "true",
    buildUrls: ({ query, limit, since, now }) => {
      const url = appendGdeltDateParams(new URL("https://api.gdeltproject.org/api/v2/doc/doc"), since, now);
      url.searchParams.set("query", query);
      url.searchParams.set("mode", "artlist");
      url.searchParams.set("format", "json");
      url.searchParams.set("maxrecords", String(Math.min(limit, 250)));
      url.searchParams.set("sort", "HybridRel");
      return [url.toString()];
    },
    categories: [],
    profiles: ["india_diplomacy", "oil_markets", "maritime_chokepoints", "geopolitical_shock"],
  },
  {
    id: "reuters-world",
    name: "Reuters",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://www.reuters.com/world/feed/"],
    categories: ["geopolitics", "economy", "trade", "energy", "shipping"],
    profiles: ["india_diplomacy", "geopolitical_shock", "maritime_chokepoints"],
  },
  {
    id: "reuters-markets",
    name: "Reuters Markets",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://www.reuters.com/markets/feed/"],
    categories: ["markets", "finance", "economy", "trade"],
    profiles: ["oil_markets", "geopolitical_shock"],
  },
  {
    id: "ap-world",
    name: "AP News",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://apnews.com/hub/world-news/rss"],
    categories: ["geopolitics", "conflict", "trade"],
    profiles: ["india_diplomacy", "geopolitical_shock"],
  },
  {
    id: "bbc-world",
    name: "BBC World",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://feeds.bbci.co.uk/news/world/rss.xml", "https://feeds.bbci.co.uk/news/business/rss.xml"],
    categories: ["geopolitics", "finance", "economy", "trade"],
    profiles: ["india_diplomacy", "oil_markets", "geopolitical_shock"],
  },
  {
    id: "aljazeera-world",
    name: "Al Jazeera",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://www.aljazeera.com/xml/rss/all.xml"],
    categories: ["geopolitics", "conflict", "maritime"],
    profiles: ["geopolitical_shock", "maritime_chokepoints"],
  },
  {
    id: "mea-india",
    name: "MEA India",
    kind: "rss",
    providerType: "RSS",
    enabled: () => true,
    buildUrls: () => ["https://www.mea.gov.in/rss-feeds.htm?xml=1"],
    categories: ["india", "diplomacy", "foreign relations"],
    profiles: ["india_diplomacy"],
  },
  {
    id: "pib-india",
    name: "PIB",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://pib.gov.in/rssfeed.aspx"],
    categories: ["india", "government", "diplomacy"],
    profiles: ["india_diplomacy", "oil_markets"],
  },
  {
    id: "mopng-india",
    name: "Ministry of Petroleum",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://mopng.gov.in/rss"],
    categories: ["india", "oil", "lng", "gas", "energy"],
    profiles: ["oil_markets"],
  },
  {
    id: "rbi",
    name: "RBI",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://www.rbi.org.in/scripts/Rss.aspx"],
    categories: ["india", "rates", "inflation", "finance"],
    profiles: ["oil_markets"],
  },
  {
    id: "opec",
    name: "OPEC",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://www.opec.org/opec_web/en/press_room/rss.xml"],
    categories: ["oil", "energy", "opec"],
    profiles: ["oil_markets", "geopolitical_shock"],
  },
  {
    id: "iea",
    name: "IEA",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://www.iea.org/newsroom/rss/news.xml"],
    categories: ["energy", "oil", "gas", "lng"],
    profiles: ["oil_markets"],
  },
  {
    id: "imf",
    name: "IMF",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://www.imf.org/en/News/RSS"],
    categories: ["finance", "economy", "inflation", "rates"],
    profiles: ["oil_markets"],
  },
  {
    id: "world-bank",
    name: "World Bank",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://www.worldbank.org/en/news/all?format=rss"],
    categories: ["finance", "economy", "trade"],
    profiles: ["oil_markets"],
  },
  {
    id: "bloomberg-markets",
    name: "Bloomberg",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://feeds.bloomberg.com/markets/news.rss"],
    categories: ["markets", "finance", "economy", "energy", "trade"],
    profiles: ["oil_markets"],
  },
  {
    id: "ft-markets",
    name: "Financial Times",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://www.ft.com/rss/world"],
    categories: ["markets", "finance", "economy", "trade"],
    profiles: ["oil_markets", "geopolitical_shock"],
  },
  {
    id: "maritime-executive",
    name: "Maritime Executive",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://www.maritime-executive.com/rss/news"],
    categories: ["maritime", "shipping", "ports", "security"],
    profiles: ["maritime_chokepoints", "geopolitical_shock"],
  },
  {
    id: "marinelink",
    name: "MarineLink",
    kind: "rss",
    providerType: "RSS",
    enabled: () => true,
    buildUrls: () => ["https://www.marinelink.com/rss"],
    categories: ["maritime", "shipping", "ports"],
    profiles: ["maritime_chokepoints"],
  },
  {
    id: "lloyds-list",
    name: "Lloyd's List",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://www.lloydslist.com/rss"],
    categories: ["maritime", "shipping", "ports"],
    profiles: ["maritime_chokepoints"],
  },
  {
    id: "splash247",
    name: "Splash247",
    kind: "rss",
    providerType: "RSS",
    enabled: () => process.env.AIS_SIMULATION_ENABLED === "true",
    buildUrls: () => ["https://splash247.com/feed/"],
    categories: ["maritime", "shipping", "ports"],
    profiles: ["maritime_chokepoints"],
  },
];

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const stripHtml = (value: string): string =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();
const normalizeDate = (value: unknown): string => {
  const parsed = new Date(typeof value === "string" || typeof value === "number" ? value : "");
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};
const safeLower = (value: string): string => normalizeWhitespace(value).toLowerCase();
const canonicalUrl = (value: string): string => {
  try {
    const url = new URL(value);
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"].forEach((key) => url.searchParams.delete(key));
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().toLowerCase();
  }
};
const tokenize = (value: string): Set<string> => new Set(value.toLowerCase().split(/\W+/).filter(Boolean));
const similarity = (left: string, right: string): number => {
  const a = tokenize(left);
  const b = tokenize(right);
  const shared = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : shared / union;
};
const deriveKeywords = (article: Pick<NewsArticle, "title" | "description" | "content">): string[] => {
  const haystack = `${article.title} ${article.description} ${article.content}`.toLowerCase();
  return Array.from(new Set(GRIA_KEYWORDS.filter((keyword) => haystack.includes(keyword.toLowerCase()))));
};
const publishedAfter = (article: NewsArticle, since?: string): boolean => {
  if (!since) return true;
  const sinceTime = new Date(since).getTime();
  const publishedTime = new Date(article.publishedAt).getTime();
  if (Number.isNaN(sinceTime) || Number.isNaN(publishedTime)) return true;
  return publishedTime > sinceTime - 5 * 60 * 1000;
};
const validateArticle = (article: Partial<NewsArticle>): article is NewsArticle =>
  Boolean(article.title?.trim() && article.source?.trim() && article.publishedAt?.trim() && article.content?.trim() !== undefined && article.url?.trim());
const normalizeArticle = (article: NormalizedCandidate, fallbackSource: string): NewsArticle | null => {
  const title = normalizeWhitespace(stripHtml(article.title ?? ""));
  const url = canonicalUrl((article.url ?? "").trim());
  const source = normalizeWhitespace(stripHtml(article.source ?? fallbackSource)) || fallbackSource;
  const publishedAt = normalizeDate(article.publishedAt);
  const description = normalizeWhitespace(stripHtml(article.description ?? ""));
  const content = normalizeWhitespace(stripHtml(article.content ?? description));
  if (!title || !url || !source || !publishedAt || !content) {
    return null;
  }
  const normalized: NewsArticle = {
    id: `${safeLower(source)}-${Buffer.from(url).toString("base64url")}`,
    title,
    description,
    content,
    url,
    source,
    publishedAt,
    category: normalizeWhitespace(article.category ?? "general") || "general",
    language: normalizeWhitespace(article.language ?? "en") || "en",
    author: normalizeWhitespace(article.author ?? "") || undefined,
    keywords: Array.from(new Set([...(article.keywords ?? []), ...deriveKeywords({ title, description, content })])),
    raw: article.raw,
  };
  return validateArticle(normalized) ? normalized : null;
};
const extractJsonItems = (payload: unknown): Array<Record<string, unknown>> => {
  if (!payload || typeof payload !== "object") return [];
  const asRecord = payload as Record<string, unknown>;
  const items = asRecord.articles ?? asRecord.items ?? asRecord.data ?? [];
  return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
};
const normalizeJsonSource = (payload: unknown, source: SourceAdapter, fallbackCategory: string): NewsArticle[] =>
  extractJsonItems(payload)
    .map((item) =>
      normalizeArticle(
        {
          title: String(item.title ?? item.headline ?? ""),
          description: String(item.description ?? item.summary ?? item.snippet ?? ""),
          content: String(item.content ?? item.text ?? item.description ?? item.summary ?? ""),
          url: String(item.url ?? item.link ?? ""),
          source: String((item.source as { name?: string } | undefined)?.name ?? item.sourceCommonName ?? item.domain ?? item.source ?? source.name),
          publishedAt: String(item.publishedAt ?? item.published_at ?? item.seendate ?? item.date ?? item.published ?? new Date().toISOString()),
          author: String(item.author ?? item.byline ?? ""),
          category: String(item.category ?? fallbackCategory),
          language: String(item.language ?? "en"),
          raw: item,
        },
        source.name
      )
    )
    .filter((item): item is NewsArticle => Boolean(item));
const splitXmlItems = (xml: string, tag: string): string[] => [...xml.matchAll(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}>`, "gi"))].map((match) => match[0]);
const getTagValue = (xml: string, tag: string): string => {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
};
const getAttrValue = (xml: string, tag: string, attr: string): string => {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*\\b${attr}="([^"]+)"`, "i"));
  return match ? stripHtml(match[1]) : "";
};
const normalizeRssSource = (payload: string, source: SourceAdapter, fallbackCategory: string): NewsArticle[] => {
  const items = [...splitXmlItems(payload, "item"), ...splitXmlItems(payload, "entry")];
  return items
    .map((item) => {
      const title = getTagValue(item, "title");
      const description = getTagValue(item, "description") || getTagValue(item, "summary") || getTagValue(item, "content");
      const content = getTagValue(item, "content:encoded") || description;
      const link = getTagValue(item, "link") || getAttrValue(item, "link", "href");
      const publishedAt = getTagValue(item, "pubDate") || getTagValue(item, "published") || getTagValue(item, "updated");
      const sourceName = getTagValue(item, "source") || source.name;
      const author = getTagValue(item, "author") || getTagValue(item, "dc:creator");
      return normalizeArticle({ title, description, content, url: link, source: sourceName, publishedAt, author, category: fallbackCategory, language: "en", raw: item }, source.name);
    })
    .filter((item): item is NewsArticle => Boolean(item));
};
const buildQuerySet = (inputQuery: string): string[] => {
  const normalized = inputQuery.trim();
  const querySet = new Set<string>();
  querySet.add(normalized || CATEGORY_QUERIES);
  querySet.add(CATEGORY_QUERIES);
  Object.values(QUERY_PROFILES).forEach((query) => querySet.add(query));
  return [...querySet];
};
const sourceQueries = (source: SourceAdapter, inputQuery: string): string[] => {
  const normalized = inputQuery.trim();
  if (normalized && normalized !== CATEGORY_QUERIES) return [normalized];
  if (source.id === "gdelt-energy-geopolitics") return [QUERY_PROFILES.geopolitical_shock];
  return Array.from(new Set(source.profiles.map((profile) => QUERY_PROFILES[profile])));
};
const matchesSourceCategories = (article: NewsArticle, categories: string[]): boolean => {
  if (categories.length === 0) return true;
  const text = `${article.title} ${article.description} ${article.content} ${article.source}`.toLowerCase();
  return (
    categories.some((category) => text.includes(category.toLowerCase())) ||
    GRIA_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()))
  );
};
const exactDomainScore = (article: NewsArticle): number => {
  const text = `${article.title} ${article.description} ${article.content} ${article.source}`.toLowerCase();
  const groups = [
    ["india", "indian", "mea", "mopng"],
    ["oil", "crude", "petroleum", "lng", "gas", "opec", "energy", "refinery"],
    ["hormuz", "suez", "bab-el-mandeb", "malacca", "red sea", "persian gulf", "chokepoint"],
    ["shipping", "maritime", "tanker", "freight", "port", "reroute"],
    ["war", "conflict", "attack", "missile", "blockade", "sanction", "tariff", "export ban"],
    ["trade", "market", "commodity", "supply chain", "foreign relations", "diplomacy"],
  ];
  return groups.reduce((score, terms) => score + (terms.some((term) => text.includes(term)) ? 1 : 0), 0);
};
const isFocusedDomainArticle = (article: NewsArticle): boolean => {
  const score = exactDomainScore(article);
  const text = `${article.title} ${article.description} ${article.content}`.toLowerCase();
  const hardHit = /(hormuz|suez|bab-el-mandeb|red sea|malacca|persian gulf|india.*oil|oil.*india|tanker.*attack|shipping.*sanction|crude.*sanction)/i.test(text);
  return hardHit || score >= 2;
};
const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};
const fetchJson = async (url: string, headers: Record<string, string> | undefined): Promise<unknown> => {
  const response = await fetchWithTimeout(url, { headers }, FETCH_TIMEOUT_MS);
  if (response.status === 429) throw new Error(`Rate limited: ${url}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
};
const fetchText = async (url: string, headers: Record<string, string> | undefined): Promise<string> => {
  const response = await fetchWithTimeout(url, { headers }, FETCH_TIMEOUT_MS);
  if (response.status === 429) throw new Error(`Rate limited: ${url}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
};
const fetchWithRetry = async <T>(fn: () => Promise<T>): Promise<T> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= FETCH_RETRY_COUNT; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_RETRY_COUNT) await delay(250 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Fetch failed");
};
const fetchSource = async (source: SourceAdapter, query: string, limit: number, since: string | undefined, now: Date): Promise<NewsArticle[]> => {
  const urls = source.buildUrls({ query, limit, since, now });
  const collected: NewsArticle[] = [];
  for (const url of urls) {
    const articles = await fetchWithRetry(async () => {
      if (source.kind === "json") return normalizeJsonSource(await fetchJson(url, source.headers), source, source.categories[0] ?? "general");
      return normalizeRssSource(await fetchText(url, source.headers), source, source.categories[0] ?? "general");
    });
    collected.push(...articles);
  }
  return collected.filter((article) => publishedAfter(article, since) && matchesSourceCategories(article, source.categories));
};
const dedupeArticles = (articles: NewsArticle[]): NewsArticle[] => {
  const byUrl = new Set<string>();
  const unique: NewsArticle[] = [];
  for (const article of articles) {
    const normalizedUrl = canonicalUrl(article.url);
    const duplicate = unique.some((existing) => {
      const sameUrl = canonicalUrl(existing.url) === normalizedUrl;
      const sameTitle = safeLower(existing.title) === safeLower(article.title);
      const titleSimilarity = similarity(existing.title, article.title);
      return sameUrl || sameTitle || titleSimilarity >= 0.88;
    });
    if (duplicate || byUrl.has(normalizedUrl)) continue;
    byUrl.add(normalizedUrl);
    unique.push(article);
  }
  return unique;
};
const queryMatchesArticle = (article: NewsArticle, query: string): boolean => {
  const normalized = query.toLowerCase();
  const haystack = `${article.title} ${article.description} ${article.content} ${article.source}`.toLowerCase();
  const terms = normalized.replace(/[()"']/g, " ").split(/\s+(?:or|and)\s+|\s+/).map((term) => term.trim()).filter((term) => term && term.length > 2 && !["and", "or"].includes(term));
  return terms.length === 0 || terms.some((term) => haystack.includes(term));
};
export async function fetchNews(input: PipelineInput = {}): Promise<FetchResult> {
  const query = input.query?.trim() || CATEGORY_QUERIES;
  const limit = input.limit ?? DEFAULT_LIMIT;
  const allowedSources = new Set((input.sources ?? []).map((value) => value.toLowerCase()));
  const now = new Date();
  const querySet = buildQuerySet(query);
  const sources = TRUSTED_SOURCE_REGISTRY.filter(
    (source) =>
      DEFAULT_ENABLED_SOURCE_IDS.has(source.id.toLowerCase()) &&
      source.enabled() &&
      (allowedSources.size === 0 || allowedSources.has(source.id.toLowerCase()))
  );
  const sourceStats: SourceStats[] = [];
  const collected: NewsArticle[] = [];
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const sourceStatsEntry: SourceStats = { sourceId: source.id, source: source.name, sourceType: source.providerType, fetched: 0, normalized: 0, errors: [] };
      try {
        const since = input.sourceLastFetchedAt?.[source.name] ?? input.sourceLastFetchedAt?.[source.id];
        const profileQueries = sourceQueries(source, query);
        const fetchQueries = source.kind === "rss" ? [profileQueries[0] ?? query] : profileQueries;
        const articlesByProfile = await Promise.all(
          fetchQueries.map((profileQuery) =>
            fetchSource(source, profileQuery, Math.ceil(limit / Math.max(1, fetchQueries.length)), since, now)
          )
        );
        const articles = articlesByProfile.flat();
        const matched = articles.filter((article) => isFocusedDomainArticle(article) && querySet.some((term) => queryMatchesArticle(article, term)));
        sourceStatsEntry.fetched = articles.length;
        sourceStatsEntry.normalized = matched.length;
        collected.push(...matched);
      } catch (error) {
        sourceStatsEntry.errors.push(error instanceof Error ? error.message : "Unknown source error");
      }
      return sourceStatsEntry;
    })
  );
  for (const result of results) {
    if (result.status === "fulfilled") {
      sourceStats.push(result.value);
    } else {
      sourceStats.push({ source: "unknown", fetched: 0, normalized: 0, errors: [result.reason instanceof Error ? result.reason.message : "Unknown source error"] });
    }
  }
  const articles = dedupeArticles(collected).sort((left, right) => new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime()).slice(0, limit);
  return { articles, sourceStats };
}
