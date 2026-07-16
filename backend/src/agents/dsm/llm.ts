import {
  DsmInputFormattingResult,
  DsmRetrievedContext,
  DsmSanityCheckResult,
  DsmSimulationInput,
  DsmSimulationOutput,
} from "./types";

interface DsmLlmFormatResponse {
  corridor?: string;
  scenario_id?: string;
  capacity_loss_pct?: number;
  duration_days?: number;
  vector_query?: string;
  keywords?: string[];
  inferred_fields?: string[];
  missing_fields?: string[];
  notes?: string[];
}

interface DsmLlmReviewResponse {
  summary?: string;
  status?: "pass" | "warning";
  warnings?: string[];
  notes?: string[];
}

const provider = process.env.DSM_LLM_PROVIDER ?? "huggingface";
const model = process.env.DSM_LLM_MODEL ?? "mistralai/Mistral-7B-Instruct-v0.3";

const llmEnabled = (): boolean => process.env.DSM_LLM_ENABLED !== "false";

const parseNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const extractJson = <T>(text: string): T | null => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) {
    return null;
  }
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
};

const invokeHuggingFace = async (prompt: string): Promise<string | null> => {
  const token = process.env.HF_TOKEN;
  if (!token) {
    return null;
  }

  const response = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 500,
        temperature: 0.1,
        return_full_text: false,
      },
    }),
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as unknown;
  if (Array.isArray(payload)) {
    const first = payload[0] as { generated_text?: unknown };
    return typeof first?.generated_text === "string" ? first.generated_text : null;
  }
  if (payload && typeof payload === "object") {
    const objectPayload = payload as { generated_text?: unknown };
    return typeof objectPayload.generated_text === "string" ? objectPayload.generated_text : null;
  }
  return null;
};

const invokeLlm = async (prompt: string): Promise<string | null> => {
  if (!llmEnabled()) {
    return null;
  }
  try {
    if (provider === "huggingface") {
      return await invokeHuggingFace(prompt);
    }
  } catch (error) {
    console.warn("DSM LLM unavailable, using deterministic fallback:", error instanceof Error ? error.message : error);
  }
  return null;
};

const inferCorridor = (text: string, fallback?: string): string => {
  const normalized = text.toLowerCase();
  if (normalized.includes("hormuz")) return "Strait of Hormuz";
  if (normalized.includes("red sea") || normalized.includes("bab-el-mandeb") || normalized.includes("bab el mandeb")) return "Red Sea";
  if (normalized.includes("suez")) return "Suez Canal";
  if (normalized.includes("black sea")) return "Black Sea";
  return fallback || "general";
};

const inferDurationDays = (text: string): number | undefined => {
  const dayMatch = text.match(/(\d+)\s*(day|days|d)\b/i);
  if (dayMatch) return Number(dayMatch[1]);
  const weekMatch = text.match(/(\d+)\s*(week|weeks|w)\b/i);
  if (weekMatch) return Number(weekMatch[1]) * 7;
  if (/about\s+3\s+weeks|three\s+weeks/i.test(text)) return 21;
  if (/about\s+2\s+weeks|two\s+weeks/i.test(text)) return 14;
  return undefined;
};

const inferCapacityLossPct = (text: string): number | undefined => {
  const percentMatch = text.match(/(\d+(?:\.\d+)?)\s*(%|percent)/i);
  if (percentMatch) return Number(percentMatch[1]);
  if (/blocked|blockade|closure|suspension|shutdown|halt/i.test(text)) return 60;
  if (/delay|reroute|congestion/i.test(text)) return 30;
  return undefined;
};

const fallbackFormat = (input: DsmSimulationInput): { input: DsmSimulationInput; formatting: DsmInputFormattingResult } => {
  const scenarioText = input.scenario_text ?? input.vector_query ?? "";
  const inferredFields: string[] = [];
  const normalized: DsmSimulationInput = { ...input };

  if (!normalized.corridor) {
    normalized.corridor = inferCorridor(scenarioText);
    inferredFields.push("corridor");
  }
  if (normalized.capacity_loss_pct === undefined) {
    const inferred = inferCapacityLossPct(scenarioText);
    if (inferred !== undefined) {
      normalized.capacity_loss_pct = inferred;
      inferredFields.push("capacity_loss_pct");
    }
  }
  if (normalized.duration_days === undefined) {
    const inferred = inferDurationDays(scenarioText);
    if (inferred !== undefined) {
      normalized.duration_days = inferred;
      inferredFields.push("duration_days");
    }
  }

  return {
    input: normalized,
    formatting: {
      used_llm: false,
      provider: "fallback_rules",
      inferred_fields: inferredFields,
      missing_fields: normalized.corridor ? [] : ["corridor"],
      notes: ["LLM formatting was disabled or unavailable; deterministic fallback normalization was used."],
    },
  };
};

export const formatDsmInput = async (
  input: DsmSimulationInput
): Promise<{ input: DsmSimulationInput; formatting: DsmInputFormattingResult }> => {
  const prompt = `You are formatting input for DSM, a deterministic disruption simulation engine.
Return ONLY JSON. Do not calculate the simulation.
Required output keys:
{
  "corridor": "string",
  "scenario_id": "optional string",
  "capacity_loss_pct": optional number,
  "duration_days": optional number,
  "vector_query": "optional string",
  "keywords": ["optional strings"],
  "inferred_fields": ["field names you inferred"],
  "missing_fields": ["required fields that cannot be inferred"],
  "notes": ["short notes"]
}
Rules:
- Infer corridor from scenario text when possible.
- Convert phrases like "about 3 weeks" into duration_days: 21.
- Convert phrases like "60 percent disruption" into capacity_loss_pct: 60.
- If not inferable, omit optional numeric fields rather than inventing a crisis.
- Never create the impact timeline. That is done by math code.

Raw input:
${JSON.stringify(input)}`;

  const text = await invokeLlm(prompt);
  const parsed = text ? extractJson<DsmLlmFormatResponse>(text) : null;
  if (!parsed) {
    return fallbackFormat(input);
  }

  const normalized: DsmSimulationInput = {
    ...input,
    corridor: parsed.corridor ?? input.corridor,
    scenario_id: parsed.scenario_id ?? input.scenario_id,
    vector_query: parsed.vector_query ?? input.vector_query,
    keywords: parsed.keywords ?? input.keywords,
    capacity_loss_pct: parseNumber(parsed.capacity_loss_pct) ?? input.capacity_loss_pct,
    duration_days: parseNumber(parsed.duration_days) ?? input.duration_days,
  };

  if (!normalized.corridor) {
    normalized.corridor = inferCorridor(input.scenario_text ?? input.vector_query ?? "");
  }

  return {
    input: normalized,
    formatting: {
      used_llm: true,
      provider,
      inferred_fields: parsed.inferred_fields ?? [],
      missing_fields: parsed.missing_fields ?? [],
      notes: parsed.notes ?? [],
    },
  };
};

const localSanityCheck = (output: DsmSimulationOutput): DsmSanityCheckResult => {
  const warnings: string[] = [];
  if (output.impact_timeline.length !== output.duration_days) {
    warnings.push("impact_timeline length does not match duration_days.");
  }
  output.impact_timeline.forEach((day) => {
    if (day.refinery_output_pct < 0 || day.refinery_output_pct > 100) {
      warnings.push(`Day ${day.day} refinery_output_pct is outside 0-100.`);
    }
    if (day.price_change_pct < 0) {
      warnings.push(`Day ${day.day} price_change_pct is negative.`);
    }
  });

  return {
    used_llm: false,
    provider: "local_rules",
    status: warnings.length > 0 ? "warning" : "pass",
    warnings,
    notes: ["Local deterministic sanity checks were applied."],
  };
};

export const explainDsmOutput = async (
  input: DsmSimulationInput,
  context: DsmRetrievedContext,
  output: DsmSimulationOutput
): Promise<{ summary: string; sanity_check: DsmSanityCheckResult }> => {
  const localCheck = localSanityCheck(output);
  const prompt = `You are reviewing DSM output for a dashboard.
The math is already complete. Do NOT recalculate numbers or change the timeline.
Return ONLY JSON:
{
  "summary": "plain English explanation using the numbers provided",
  "status": "pass" or "warning",
  "warnings": ["logical issues only, if any"],
  "notes": ["brief explanation notes"]
}
Check only for obvious inconsistencies such as refinery output outside 0-100, negative price changes, or timeline length mismatch.

Input:
${JSON.stringify(input)}

Retrieved GRIA context:
${JSON.stringify(context)}

Deterministic DSM output:
${JSON.stringify(output)}`;

  const text = await invokeLlm(prompt);
  const parsed = text ? extractJson<DsmLlmReviewResponse>(text) : null;
  if (!parsed) {
    return { summary: output.summary, sanity_check: localCheck };
  }

  return {
    summary: parsed.summary || output.summary,
    sanity_check: {
      used_llm: true,
      provider,
      status: parsed.status ?? localCheck.status,
      warnings: [...localCheck.warnings, ...(parsed.warnings ?? [])],
      notes: parsed.notes ?? [],
    },
  };
};
