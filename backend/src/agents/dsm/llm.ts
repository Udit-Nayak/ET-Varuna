import {
  DsmInputFormattingResult,
  DsmEventClassification,
  DsmHistoricalAnalysis,
  DsmSanityCheckResult,
  DsmPredictionRecord,
  DsmRetrievedContext,
  DsmSimulationInput,
  DsmSimulationOutput,
  DsmWorkflowInput,
} from "./types";

const apiKey = process.env.DSM_API_KEY || process.env.DSM_LLM_API_KEY || process.env.OPENAI_API_KEY || "";
const model = process.env.DSM_LLM_MODEL || "gpt-4o-mini";

const extractJson = <T>(text: string): T | null => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
};

const callLlm = async (system: string, user: string): Promise<string | null> => {
  if (!apiKey) return null;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (!response.ok) return null;
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content ?? null;
};

export const classifyDsmEvent = async (
  input: DsmWorkflowInput,
  context: DsmRetrievedContext
): Promise<DsmEventClassification | null> => {
  const system = [
    "You classify market-impacting events from news.",
    "Return only JSON.",
    "Identify if the event is major enough to affect markets.",
    "Use concise values for event_type, affected_market, expected_impact, direction, confidence, rationale.",
    "Allowed directions: up, down, mixed, flat.",
  ].join(" ");
  const user = JSON.stringify({ input, context });
  const text = await callLlm(system, user);
  const parsed = text ? extractJson<Partial<DsmEventClassification>>(text) : null;
  if (!parsed?.event_type || !parsed?.affected_market || !parsed?.expected_impact) {
    return null;
  }
  return {
    event_type: String(parsed.event_type),
    severity: ["low", "medium", "high", "critical"].includes(String(parsed.severity))
      ? (String(parsed.severity) as DsmEventClassification["severity"])
      : context.aggregated_severity,
    affected_market: String(parsed.affected_market),
    expected_impact: String(parsed.expected_impact),
    direction: ["up", "down", "mixed", "flat"].includes(String(parsed.direction))
      ? (String(parsed.direction) as DsmEventClassification["direction"])
      : "mixed",
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.6))),
    rationale: String(parsed.rationale ?? "LLM classification unavailable; used deterministic fallback."),
  };
};

export const summarizeHistoricalAnalysis = async (
  classification: DsmEventClassification,
  analysis: DsmHistoricalAnalysis
): Promise<string | null> => {
  const system = [
    "You summarize historical market reactions to a classified event.",
    "Return only JSON with keys summary and recommendation.",
    "Do not invent prices.",
  ].join(" ");
  const text = await callLlm(system, JSON.stringify({ classification, analysis }));
  const parsed = text ? extractJson<{ summary?: string; recommendation?: string }>(text) : null;
  return parsed?.summary ?? null;
};

export const buildDsmConfidence = (record: DsmPredictionRecord): number => {
  const base = Number(record.event_details.confidence ?? 0.5);
  const historyBoost = Math.min(0.2, record.historical_analysis.sample_size * 0.03);
  return Number(Math.min(0.98, base + historyBoost).toFixed(2));
};

export const formatDsmInput = async (
  input: DsmSimulationInput
): Promise<{ input: DsmSimulationInput; formatting: DsmInputFormattingResult }> => ({
  input,
  formatting: {
    used_llm: false,
    provider: "disabled",
    inferred_fields: [],
    missing_fields: [],
    notes: ["Legacy formatting retained for backward compatibility."],
  },
});

export const explainDsmOutput = async (
  _input: DsmSimulationInput,
  _context: DsmRetrievedContext,
  output: DsmSimulationOutput
): Promise<{ summary: string; sanity_check: DsmSanityCheckResult }> => ({
  summary: output.summary,
  sanity_check: {
    used_llm: false,
    provider: "disabled",
    status: "pass",
    warnings: [],
    notes: ["Legacy explanation retained for backward compatibility."],
  },
});
