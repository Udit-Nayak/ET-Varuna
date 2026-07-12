import { DEFAULT_LIMIT, FETCH_RETRY_COUNT, FETCH_TIMEOUT_MS, GRIA_KEYWORDS, NEWS_SOURCES } from "./constants";
import { FetchResult, NewsArticle, NewsSourceConfig, PipelineInput } from "./type";

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const withTimeout = async (input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1] = {}): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

const buildUrl = (source: NewsSourceConfig, query: string, limit: number): string => {
  const url = new URL(source.endpoint);
  Object.entries(source.params ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));

  if (source.type === "newsapi") {
    url.searchParams.set("q", query);
    url.searchParams.set("pageSize", String(limit));
  } else if (source.type === "gdelt") {
    url.searchParams.set("query", query);
    url.searchParams.set("maxrecords", String(limit));
  } else if (source.type === "rss") {
    url.searchParams.set("q", query);
  }

  return url.toString();
};

const toKeywords = (article: Pick<NewsArticle, "title" | "description" | "content">): string[] => {
  const haystack = `${article.title} ${article.description} ${article.content}`.toLowerCase();
  return GRIA_KEYWORDS.filter((keyword) => haystack.includes(keyword.toLowerCase()));
};

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

const normalizeArticle = (article: Partial<NewsArticle> & { raw?: unknown }, fallbackSource: string): NewsArticle | null => {
  const title = stripHtml(article.title ?? "");
  const url = (article.url ?? "").trim();
  if (!title || !url) {
    return null;
  }

  const description = stripHtml(article.description ?? "");
  const content = stripHtml(article.content ?? "");
  const publishedAt = new Date(article.publishedAt ?? Date.now()).toISOString();
  const source = stripHtml(article.source ?? fallbackSource) || fallbackSource;

  return {
    id: `${source}-${Buffer.from(url).toString("base64url")}`,
    title,
    description,
    content,
    url,
    source,
    publishedAt,
    category: article.category ?? "general",
    language: article.language ?? "en",
    author: article.author,
    keywords: article.keywords ?? toKeywords({ title, description, content }),
    raw: article.raw,
  };
};

const normalizeNewsApi = (payload: unknown, source: NewsSourceConfig): NewsArticle[] => {
  const items = (payload as { articles?: Array<Record<string, unknown>> })?.articles ?? [];
  return items
    .map((item) =>
      normalizeArticle(
        {
          title: String(item.title ?? ""),
          description: String(item.description ?? ""),
          content: String(item.content ?? ""),
          url: String(item.url ?? ""),
          source: String((item.source as { name?: string } | undefined)?.name ?? source.name),
          publishedAt: String(item.publishedAt ?? item.publishedAt ?? new Date().toISOString()),
          author: String(item.author ?? ""),
          category: source.categories?.[0] ?? "general",
          language: String(item.language ?? "en"),
          raw: item,
        },
        source.name
      )
    )
    .filter((item): item is NewsArticle => Boolean(item));
};

const normalizeGdelt = (payload: unknown, source: NewsSourceConfig): NewsArticle[] => {
  const items = (payload as { articles?: Array<Record<string, unknown>> })?.articles ?? [];
  return items
    .map((item) =>
      normalizeArticle(
        {
          title: String(item.title ?? item.seendate ?? ""),
          description: String(item.description ?? item.snippet ?? ""),
          content: String(item.content ?? item.summary ?? ""),
          url: String(item.url ?? item.sourceUrl ?? ""),
          source: String(item.sourceCountry ?? source.name),
          publishedAt: String(item.seendate ?? new Date().toISOString()),
          author: String(item.author ?? ""),
          category: source.categories?.[0] ?? "general",
          language: String(item.language ?? "en"),
          raw: item,
        },
        source.name
      )
    )
    .filter((item): item is NewsArticle => Boolean(item));
};

const fetchSource = async (source: NewsSourceConfig, query: string, limit: number): Promise<NewsArticle[]> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= FETCH_RETRY_COUNT; attempt += 1) {
    try {
      const response = await withTimeout(buildUrl(source, query, limit), {
        headers: source.headers,
      });

      if (response.status === 429) {
        throw new Error(`Rate limited by ${source.name}`);
      }

      if (!response.ok) {
        throw new Error(`Source ${source.name} failed with status ${response.status}`);
      }

      const payload = (await response.json()) as unknown;
      if (source.type === "newsapi") {
        return normalizeNewsApi(payload, source);
      }
      if (source.type === "gdelt") {
        return normalizeGdelt(payload, source);
      }
      return [];
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_RETRY_COUNT) {
        await delay(250 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Unable to fetch from ${source.name}`);
};

const uniqueByUrl = (articles: NewsArticle[]): NewsArticle[] => {
  const seen = new Set<string>();
  return articles.filter((article) => {
    const key = article.url.trim().toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export async function fetchNews(input: PipelineInput = {}): Promise<FetchResult> {
  const query = input.query?.trim() || "geopolitics OR sanctions OR oil OR shipping OR energy";
  const limit = input.limit ?? DEFAULT_LIMIT;
  const allowedSources = new Set(input.sources ?? []);

  const sources = NEWS_SOURCES.filter((source) => source.enabled && (allowedSources.size === 0 || allowedSources.has(source.id)));
  const sourceStats: FetchResult["sourceStats"] = [];
  const collected: NewsArticle[] = [];

  for (const source of sources) {
    const stats = { source: source.name, fetched: 0, normalized: 0, errors: [] as string[] };
    try {
      const articles = await fetchSource(source, query, limit);
      stats.fetched = articles.length;
      stats.normalized = articles.length;
      collected.push(...articles);
    } catch (error) {
      stats.errors.push(error instanceof Error ? error.message : "Unknown source error");
    }
    sourceStats.push(stats);
  }

  return {
    articles: uniqueByUrl(collected),
    sourceStats,
  };
}
