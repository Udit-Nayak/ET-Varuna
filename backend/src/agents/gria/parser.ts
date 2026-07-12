import { extractModelText } from "./model";
import { GeopoliticalExtraction, GeopoliticalExtractionResponse } from "./type";

const SEVERITIES: GeopoliticalExtraction["severity"][] = ["low", "medium", "high", "critical"];

const emptyExtraction = (): GeopoliticalExtraction => ({
  country: "",
  corridor: "",
  event: "",
  severity: "low",
  actors: [],
  summary: "",
  confidence: 0,
  affectedRoutes: [],
});

const safeJsonParse = (input: string): unknown => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Empty model output");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model output is not valid JSON");
  }
};

const asString = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return fallback;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => asString(item)).filter(Boolean);
};

const asSeverity = (value: unknown): GeopoliticalExtraction["severity"] => {
  const normalized = asString(value, "low").toLowerCase();
  return SEVERITIES.includes(normalized as GeopoliticalExtraction["severity"])
    ? (normalized as GeopoliticalExtraction["severity"])
    : "low";
};

const asConfidence = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric > 1) {
    return Math.max(0, Math.min(1, numeric / 100));
  }
  return Math.max(0, Math.min(1, numeric));
};

const normalizeItem = (value: unknown): GeopoliticalExtraction => {
  const item = (value ?? {}) as Record<string, unknown>;
  return {
    country: asString(item.country),
    corridor: asString(item.corridor),
    event: asString(item.event),
    severity: asSeverity(item.severity),
    actors: Array.from(new Set(asStringArray(item.actors))),
    summary: asString(item.summary),
    confidence: asConfidence(item.confidence),
    affectedRoutes: Array.from(new Set(asStringArray(item.affectedRoutes))),
  };
};

const ensureItems = (value: unknown): unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === "object") {
    const obj = value as { items?: unknown; data?: unknown; result?: unknown };
    if (Array.isArray(obj.items)) {
      return obj.items;
    }
    if (Array.isArray(obj.data)) {
      return obj.data;
    }
    if (Array.isArray(obj.result)) {
      return obj.result;
    }
    return [value];
  }
  return [];
};

export function parseHuggingFaceOutput(rawOutput: unknown): GeopoliticalExtractionResponse {
  const rawText = extractModelText(rawOutput);
  const parsed = safeJsonParse(rawText);
  const items = ensureItems(parsed).map(normalizeItem);

  const structuredItems = items.filter((item) => item.country || item.event || item.summary);
  return {
    items: structuredItems.length > 0 ? structuredItems : [emptyExtraction()],
    raw: parsed,
  };
}

