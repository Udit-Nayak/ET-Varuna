import { ALLOWED_COUNTRIES, ALLOWED_ORGANIZATIONS, ALLOWED_TRADE_CORRIDORS, GRIA_KEYWORDS, IRRELEVANT_KEYWORDS, TRUSTED_DOMAINS } from "./constants";
import { NewsArticle, PreprocessResult } from "./type";

const stripHtml = (value: string): string =>
  value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, " ").trim();

const normalizeDate = (value: string | undefined): string => {
  const parsed = new Date(value ?? "");
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

const normalizeSource = (value: string): string => normalizeWhitespace(value).toLowerCase();

const normalizeUrl = (value: string): string => {
  try {
    return new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const matchesAllowList = (article: NewsArticle): boolean => {
  const text = `${article.title} ${article.description} ${article.content} ${article.source}`.toLowerCase();
  const host = normalizeUrl(article.url);
  const trustedDomain = Boolean(host) && TRUSTED_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  const countryHit = ALLOWED_COUNTRIES.some((country) => text.includes(country));
  const organizationHit = ALLOWED_ORGANIZATIONS.some((organization) => text.includes(organization));
  const corridorHit = ALLOWED_TRADE_CORRIDORS.some((corridor) => text.includes(corridor.toLowerCase()));
  const keywordHit = GRIA_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
  return Boolean(trustedDomain && (countryHit || organizationHit || corridorHit || keywordHit));
};

const similarity = (left: string, right: string): number => {
  const a = new Set(left.toLowerCase().split(/\W+/).filter(Boolean));
  const b = new Set(right.toLowerCase().split(/\W+/).filter(Boolean));
  const shared = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : shared / union;
};

const isRelevant = (article: NewsArticle): boolean => {
  const text = `${article.title} ${article.description} ${article.content}`.toLowerCase();
  const positiveHit = GRIA_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
  const negativeHit = IRRELEVANT_KEYWORDS.some((keyword) => text.includes(keyword.toLowerCase()));
  return matchesAllowList(article) && positiveHit && !negativeHit;
};

const isDuplicate = (candidate: NewsArticle, existing: NewsArticle[]): boolean => {
  const candidateUrl = candidate.url.trim().toLowerCase();
  const candidateTitle = candidate.title.trim().toLowerCase();
  const candidateContent = candidate.content.trim().toLowerCase();

  return existing.some((article) => {
    const sameUrl = article.url.trim().toLowerCase() === candidateUrl;
    const titleSimilarity = similarity(article.title, candidate.title);
    const contentSimilarity = similarity(article.content, candidate.content);
    return sameUrl || titleSimilarity >= 0.85 || contentSimilarity >= 0.8 || article.title.trim().toLowerCase() === candidateTitle || article.content.trim().toLowerCase() === candidateContent;
  });
};

export function preprocessArticles(articles: NewsArticle[]): PreprocessResult {
  const cleaned = articles
    .map((article) => {
      if (!article.title || !article.url) {
        return null;
      }

      return {
        ...article,
        title: normalizeWhitespace(stripHtml(article.title)),
        description: normalizeWhitespace(stripHtml(article.description)),
        content: normalizeWhitespace(stripHtml(article.content)),
        source: normalizeSource(article.source),
        publishedAt: normalizeDate(article.publishedAt),
        keywords: Array.from(new Set(article.keywords.map((keyword) => normalizeWhitespace(keyword.toLowerCase())))),
      };
    })
    .filter((article): article is NewsArticle => Boolean(article));

  const unique: NewsArticle[] = [];
  let duplicateCount = 0;
  let irrelevantCount = 0;
  let malformedCount = articles.length - cleaned.length;

  for (const article of cleaned) {
    if (!isRelevant(article)) {
      irrelevantCount += 1;
      continue;
    }

    if (isDuplicate(article, unique)) {
      duplicateCount += 1;
      continue;
    }

    unique.push({
      ...article,
      keywords: Array.from(new Set([...article.keywords, ...GRIA_KEYWORDS.filter((keyword) => `${article.title} ${article.content}`.toLowerCase().includes(keyword.toLowerCase()))])),
    });
  }

  return {
    articles: unique,
    removed: {
      duplicate: duplicateCount,
      irrelevant: irrelevantCount,
      malformed: malformedCount,
    },
  };
}
