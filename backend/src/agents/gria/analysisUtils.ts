import { NewsArticle, RiskInputs, RiskRecord } from "./types";

export const deriveRiskInputs = (article: NewsArticle): RiskInputs => {
  const text = `${article.title} ${article.description} ${article.content}`.toLowerCase();
  return {
    severity: text.includes("critical") ? "critical" : text.includes("high") ? "high" : text.includes("medium") ? "medium" : "low",
    aisDisruption: text.includes("ais") ? 85 : 0,
    oilPriceChange: text.includes("oil") ? 12 : 0,
    sanctions: text.includes("sanction") ? 95 : 0,
    eventType: article.category || article.title,
    confidence: 0.7,
  };
};

type RiskCountSource = NewsArticle | RiskRecord;

const getText = (article: RiskCountSource): string => {
  if ("title" in article) {
    return `${article.title} ${article.content}`;
  }
  return `${article.event} ${article.summary}`;
};

export const getHighRiskCount = (articles: RiskCountSource[]): number =>
  articles.filter((article) => /sanction|oil|shipping|war|conflict/i.test(getText(article))).length;
