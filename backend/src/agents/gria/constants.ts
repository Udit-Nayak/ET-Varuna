import { NewsSourceConfig } from "./types";

export const RISK_LEVEL_THRESHOLDS = {
  low: 35,
  medium: 65,
  high: 85,
  critical: 100,
} as const;

export const RISK_SCORE_WEIGHTS = {
  severity: 0.3,
  aisDisruption: 0.2,
  oilPriceChange: 0.15,
  sanctions: 0.15,
  eventType: 0.2,
  confidenceMultiplier: 0.25,
} as const;

export const IMPORTANT_SHIPPING_CORRIDORS = [
  "Strait of Hormuz",
  "Suez Canal",
  "Bab-el-Mandeb",
  "Panama Canal",
  "Malacca Strait",
  "Turkish Straits",
  "Danish Straits",
  "Cape of Good Hope",
] as const;

export const SUPPORTED_COUNTRIES_AND_REGIONS = [
  "United States",
  "China",
  "Russia",
  "Iran",
  "Iraq",
  "Israel",
  "Saudi Arabia",
  "United Arab Emirates",
  "Qatar",
  "Kuwait",
  "Oman",
  "Yemen",
  "Egypt",
  "Turkey",
  "India",
  "Pakistan",
  "Ukraine",
  "Red Sea",
  "Persian Gulf",
  "Mediterranean",
  "Black Sea",
] as const;

export const GEOPOLITICAL_EVENT_CATEGORIES = [
  "military escalation",
  "sanctions",
  "trade restriction",
  "maritime disruption",
  "pipeline disruption",
  "port closure",
  "cyber attack",
  "blockade",
  "piracy",
  "diplomatic conflict",
  "terror attack",
  "oil spill",
] as const;

export const NEWS_FILTER_KEYWORDS = [
  "oil",
  "sanctions",
  "conflict",
  "navy",
  "shipping",
  "energy",
  "ports",
  "port",
  "lng",
  "crude",
  "freight",
  "maritime",
  "blockade",
  "attack",
  "war",
  "missile",
  "pipeline",
] as const;

export const GRIA_KEYWORDS = [
  "geopolitical",
  "international relations",
  "shipping",
  "sanctions",
  "energy",
  "oil",
  "trade",
  "maritime",
  "opec",
  "lng",
  "crude",
  "freight",
  "embargo",
  ...NEWS_FILTER_KEYWORDS,
];

export const IRRELEVANT_KEYWORDS = [
  "sports",
  "entertainment",
  "celebrity",
  "lifestyle",
  "fashion",
  "gossip",
  "music video",
];

export const DEFAULT_LIMIT = 50;
export const FETCH_TIMEOUT_MS = 10000;
export const FETCH_RETRY_COUNT = 2;

export const NEWS_SOURCES: NewsSourceConfig[] = [
  {
    id: "newsapi-energy",
    name: "NewsAPI",
    type: "newsapi",
    enabled: Boolean(process.env.NEWSAPI_KEY),
    endpoint: "https://newsapi.org/v2/everything",
    categories: ["energy", "oil", "shipping", "sanctions", "geopolitics"],
    headers: {
      "X-Api-Key": process.env.NEWSAPI_KEY ?? "",
    },
    params: {
      language: "en",
      sortBy: "publishedAt",
    },
  },
  {
    id: "gdelt",
    name: "GDELT",
    type: "gdelt",
    enabled: true,
    endpoint: "https://api.gdeltproject.org/api/v2/doc/doc",
    categories: ["geopolitics", "international relations", "energy", "shipping"],
    params: {
      format: "json",
      mode: "ArtList",
      sort: "datedesc",
      maxrecords: "50",
    },
  },
];
