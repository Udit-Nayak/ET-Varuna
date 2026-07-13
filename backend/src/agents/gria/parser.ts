import { extractModelText } from "./model";
import { GeopoliticalIntelligence } from "./types";

const SEVERITIES: GeopoliticalIntelligence["severity"][] = ["low", "medium", "high", "critical"];

const stripCodeFences = (input: string): string =>
  input
    .replace(/```(?:json)?/gi, " ")
    .replace(/```/g, " ")
    .trim();

const extractBalancedJson = (input: string): string | null => {
  const text = stripCodeFences(input);
  const startIndex = text.search(/[\[{]/);
  if (startIndex < 0) {
    return null;
  }

  const openChar = text[startIndex];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return text.slice(startIndex, index + 1);
      }
    }
  }

  return null;
};

const safeJsonParse = (input: string): unknown => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Empty model output");
  }

  const candidates = [trimmed, stripCodeFences(trimmed)];
  const balanced = extractBalancedJson(trimmed);
  if (balanced) {
    candidates.push(balanced);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  throw new Error("Model output is not valid JSON");
};

const findField = (text: string, label: string): string => {
  const patterns = [
    new RegExp(`"${label}"\\s*:\\s*"([^"]*)"`, "i"),
    new RegExp(`'${label}'\\s*:\\s*'([^']*)'`, "i"),
    new RegExp(`${label}\\s*:\\s*([^,\\n\\r\\}]+)`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }

  return "";
};

const findArrayField = (text: string, label: string): string[] => {
  const arrayPattern = new RegExp(`"${label}"\\s*:\\s*\\[(.*?)\\]`, "is");
  const quotedPattern = new RegExp(`'${label}'\\s*:\\s*\\[(.*?)\\]`, "is");
  const match = text.match(arrayPattern) ?? text.match(quotedPattern);

  if (match?.[1]) {
    return match[1]
      .split(",")
      .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
  }

  const fallback = findField(text, label);
  return fallback ? fallback.split(/[,;/|]/).map((item) => item.trim()).filter(Boolean) : [];
};

const coerceStructuredText = (input: string): GeopoliticalIntelligence => {
  const text = stripCodeFences(input);
  return {
    countriesInvolved: findArrayField(text, "countriesInvolved"),
    relationWithIndia: findField(text, "relationWithIndia"),
    oilPetroleumImpact: findField(text, "oilPetroleumImpact"),
    financeEconomicImpact: findField(text, "financeEconomicImpact"),
    shippingMaritimeImpact: findField(text, "shippingMaritimeImpact"),
    tradeCorridorsAffected: findArrayField(text, "tradeCorridorsAffected"),
    eventType: findField(text, "eventType"),
    severity: asSeverity(findField(text, "severity")),
    confidence: asConfidence(findField(text, "confidence")),
    shortSummary: findField(text, "shortSummary"),
    longTermImplications: findField(text, "longTermImplications"),
    isPermanent: asBoolean(findField(text, "isPermanent")),
  };
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
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return [];
};

const asSeverity = (value: unknown): GeopoliticalIntelligence["severity"] => {
  const normalized = asString(value, "low").toLowerCase();
  return SEVERITIES.includes(normalized as GeopoliticalIntelligence["severity"])
    ? (normalized as GeopoliticalIntelligence["severity"])
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

const asBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return ["true", "1", "yes"].includes(value.trim().toLowerCase());
  }
  return false;
};

const normalizeItem = (value: unknown): GeopoliticalIntelligence => {
  const item = (value ?? {}) as Record<string, unknown>;
  return {
    countriesInvolved: Array.from(new Set(asStringArray(item.countriesInvolved ?? item.countries ?? item.country))),
    relationWithIndia: asString(item.relationWithIndia ?? item.indiaRelation),
    oilPetroleumImpact: asString(item.oilPetroleumImpact ?? item.oilImpact),
    financeEconomicImpact: asString(item.financeEconomicImpact ?? item.economicImpact),
    shippingMaritimeImpact: asString(item.shippingMaritimeImpact ?? item.maritimeImpact),
    tradeCorridorsAffected: Array.from(new Set(asStringArray(item.tradeCorridorsAffected ?? item.corridorsAffected))),
    eventType: asString(item.eventType ?? item.event),
    severity: asSeverity(item.severity),
    confidence: asConfidence(item.confidence),
    shortSummary: asString(item.shortSummary ?? item.summary),
    longTermImplications: asString(item.longTermImplications ?? item.implications),
    isPermanent: asBoolean(item.isPermanent),
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

const validateItem = (item: GeopoliticalIntelligence): GeopoliticalIntelligence => ({
  countriesInvolved: item.countriesInvolved,
  relationWithIndia: item.relationWithIndia,
  oilPetroleumImpact: item.oilPetroleumImpact,
  financeEconomicImpact: item.financeEconomicImpact,
  shippingMaritimeImpact: item.shippingMaritimeImpact,
  tradeCorridorsAffected: item.tradeCorridorsAffected,
  eventType: item.eventType,
  severity: item.severity,
  confidence: item.confidence,
  shortSummary: item.shortSummary,
  longTermImplications: item.longTermImplications,
  isPermanent: item.isPermanent,
});

export function parseHuggingFaceOutput(rawOutput: unknown): { raw: unknown; items: GeopoliticalIntelligence[] } {
  const rawText = extractModelText(rawOutput);
  let parsed: unknown;
  try {
    parsed = safeJsonParse(rawText);
  } catch {
    parsed = coerceStructuredText(rawText);
  }

  const items = ensureItems(parsed).map((item) => validateItem(normalizeItem(item)));
  const structuredItems = items.filter((item) => item.shortSummary || item.eventType || item.relationWithIndia);
  return {
    items: structuredItems.length > 0 ? structuredItems : [validateItem(normalizeItem({}))],
    raw: parsed,
  };
}
