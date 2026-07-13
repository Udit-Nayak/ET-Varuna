import { DEFAULT_LIMIT, FETCH_RETRY_COUNT, FETCH_TIMEOUT_MS, GRIA_KEYWORDS } from "./constants";
import { FetchResult, NewsArticle, PipelineInput } from "./type";

type SourceKind = "json" | "rss";

type SourceAdapter = {
  id: string;
  name: string;
  kind: SourceKind;
  enabled: () => boolean;
  buildUrls: (query: string, limit: number) => string[];
  headers?: Record<string, string>;
  categories: string[];
};

type SourceStats = FetchResult["sourceStats"][number];
type NormalizedCandidate = Partial<NewsArticle> & { source?: string; raw?: unknown };

const CATEGORY_QUERIES = [
  '"India" OR India OR MEA OR "foreign relations" OR diplomacy',
  '(war OR conflict OR terror OR piracy OR blockade OR military)',
  '(oil OR petroleum OR LNG OR gas OR OPEC OR energy OR crude)',
  '(finance OR trade OR sanctions OR inflation OR rates OR currency)',
  '(shipping OR maritime OR ports OR chokepoint OR logistics OR supply chain)',
  '(Hormuz OR Suez OR "Bab-el-Mandeb" OR Malacca OR Panama OR "Black Sea" OR "Red Sea" OR "South China Sea")',
].join(" OR ");

const TRUSTED_SOURCE_REGISTRY: SourceAdapter[] = [
  {
    id: "reuters-world",
    name: "Reuters",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://www.reuters.com/world/feed/"],
    categories: ["geopolitics", "economy", "trade", "energy", "shipping"],
  },
  {
    id: "reuters-markets",
    name: "Reuters Markets",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://www.reuters.com/markets/feed/"],
    categories: ["markets", "finance", "economy", "trade"],
  },
  {
    id: "ap-world",
    name: "AP News",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://apnews.com/hub/world-news/rss"],
    categories: ["geopolitics", "conflict", "trade"],
  },
  {
    id: "bbc-world",
    name: "BBC World",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://feeds.bbci.co.uk/news/world/rss.xml", "https://feeds.bbci.co.uk/news/business/rss.xml"],
    categories: ["geopolitics", "finance", "economy", "trade"],
  },
  {
    id: "aljazeera-world",
    name: "Al Jazeera",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://www.aljazeera.com/xml/rss/all.xml"],
    categories: ["geopolitics", "conflict", "maritime"],
  },
  {
    id: "mea-india",
    name: "MEA India",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://www.mea.gov.in/rss-feeds.htm?xml=1"],
    categories: ["india", "diplomacy", "foreign relations"],
  },
  {
    id: "pib-india",
    name: "PIB",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://pib.gov.in/rssfeed.aspx"],
    categories: ["india", "government", "diplomacy"],
  },
  {
    id: "mopng-india",
    name: "Ministry of Petroleum",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://mopng.gov.in/rss"],
    categories: ["india", "oil", "lng", "gas", "energy"],
  },
  {
    id: "rbi",
    name: "RBI",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://www.rbi.org.in/scripts/Rss.aspx"],
    categories: ["india", "rates", "inflation", "finance"],
  },
  {
    id: "opec",
    name: "OPEC",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://www.opec.org/opec_web/en/press_room/rss.xml"],
    categories: ["oil", "energy", "opec"],
  },
  {
    id: "iea",
    name: "IEA",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://www.iea.org/newsroom/rss/news.xml"],
    categories: ["energy", "oil", "gas", "lng"],
  },
  {
    id: "imf",
    name: "IMF",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://www.imf.org/en/News/RSS"],
    categories: ["finance", "economy", "inflation", "rates"],
  },
  {
    id: "world-bank",
    name: "World Bank",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://www.worldbank.org/en/news/all?format=rss"],
    categories: ["finance", "economy", "trade"],
  },
  {
    id: "bloomberg-markets",
    name: "Bloomberg",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://feeds.bloomberg.com/markets/news.rss"],
    categories: ["markets", "finance", "economy", "energy", "trade"],
  },
  {
    id: "ft-markets",
    name: "Financial Times",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://www.ft.com/rss/world"],
    categories: ["markets", "finance", "economy", "trade"],
  },
  {
    id: "maritime-executive",
    name: "Maritime Executive",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://www.maritime-executive.com/rss/news"],
    categories: ["maritime", "shipping", "ports", "security"],
  },
  {
    id: "marinelink",
    name: "MarineLink",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://www.marinelink.com/rss"],
    categories: ["maritime", "shipping", "ports"],
  },
  {
    id: "lloyds-list",
    name: "Lloyd's List",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://www.lloydslist.com/rss"],
    categories: ["maritime", "shipping", "ports"],
  },
  {
    id: "splash247",
    name: "Splash247",
    kind: "rss",
    enabled: () => true,
    buildUrls: () => ["https://splash247.com/feed/"],
    categories: ["maritime", "shipping", "ports"],
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
          source: String((item.source as { name?: string } | undefined)?.name ?? item.source ?? source.name),
          publishedAt: String(item.publishedAt ?? item.published_at ?? item.date ?? item.published ?? new Date().toISOString()),
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
  GRIA_KEYWORDS.slice(0, 24).forEach((keyword) => querySet.add(keyword));
  return [...querySet];
};
const matchesSourceCategories = (article: NewsArticle, categories: string[]): boolean => {
  if (categories.length === 0) return true;
  const text = `${article.title} ${article.description} ${article.content} ${article.source}`.toLowerCase();
  return categories.some((category) => text.includes(category.toLowerCase()));
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
const fetchSource = async (source: SourceAdapter, query: string, limit: number): Promise<NewsArticle[]> => {
  const urls = source.buildUrls(query, limit);
  const collected: NewsArticle[] = [];
  for (const url of urls) {
    const articles = await fetchWithRetry(async () => {
      if (source.kind === "json") return normalizeJsonSource(await fetchJson(url, source.headers), source, source.categories[0] ?? "general");
      return normalizeRssSource(await fetchText(url, source.headers), source, source.categories[0] ?? "general");
    });
    collected.push(...articles);
  }
  return collected.filter((article) => matchesSourceCategories(article, source.categories));
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
  const querySet = buildQuerySet(query);
  const sources = TRUSTED_SOURCE_REGISTRY.filter((source) => source.enabled() && (allowedSources.size === 0 || allowedSources.has(source.id.toLowerCase())));
  const sourceStats: SourceStats[] = [];
  const collected: NewsArticle[] = [];
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      const sourceStatsEntry: SourceStats = { source: source.name, fetched: 0, normalized: 0, errors: [] };
      try {
        const articles = await fetchSource(source, query, limit);
        const matched = articles.filter((article) => querySet.some((term) => queryMatchesArticle(article, term)));
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
