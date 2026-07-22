import { DsmSimulationInput } from "../dsm/types";
import {
  SroaInput,
  SroaInputFormattingResult,
  SroaOperationalData,
  SroaOutput,
  SroaPolicy,
  SroaSanityCheckResult,
} from "./types";
import { invokeGroqChatWithLangChain, SENTRIX_GROQ_MODEL } from "../langchain/llm";

interface SroaLlmFormatResponse {
  corridor?: string;
  policy?: SroaPolicy;
  safety_floor_days?: number;
  max_daily_release_volume?: number;
  dsm_request?: DsmSimulationInput;
  inferred_fields?: string[];
  missing_fields?: string[];
  notes?: string[];
}

interface SroaLlmReviewResponse {
  summary?: string;
  status?: "pass" | "warning";
  warnings?: string[];
  notes?: string[];
}

const provider = process.env.SROA_LLM_PROVIDER ?? process.env.DSM_LLM_PROVIDER ?? "huggingface";
const model = process.env.SROA_LLM_MODEL ?? process.env.DSM_LLM_MODEL ?? "mistralai/Mistral-7B-Instruct-v0.3";

const llmEnabled = (): boolean => process.env.SROA_LLM_ENABLED !== "false";

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
    if (provider === "groq" || provider === "langchain-groq") {
      const result = await invokeGroqChatWithLangChain({
        model: process.env.SROA_LLM_MODEL || process.env.GROQ_MODEL || SENTRIX_GROQ_MODEL,
        systemInstruction: [
          "You normalize or review SROA agent input/output for Sentrix.",
          "Use the language model only for formatting, validation, and explanation.",
          "Never recalculate reserve releases or invent operational data.",
        ].join(" "),
        prompt,
        maxOutputTokens: 900,
        temperature: 0.1,
        traceName: "sroa-llm",
      });
      return result?.text ?? null;
    }
    if (provider === "huggingface") {
      return await invokeHuggingFace(prompt);
    }
  } catch (error) {
    console.warn("SROA LLM unavailable, using deterministic fallback:", error instanceof Error ? error.message : error);
  }
  return null;
};

const normalizePolicy = (value: unknown): SroaPolicy | undefined => {
  if (value === "conservative" || value === "balanced" || value === "aggressive") {
    return value;
  }
  return undefined;
};

const inferPolicy = (text: string): SroaPolicy | undefined => {
  const normalized = text.toLowerCase();
  if (/aggressive|fast|maximum|urgent|release more/.test(normalized)) return "aggressive";
  if (/conservative|preserve|protect|slow|cautious/.test(normalized)) return "conservative";
  if (/balanced|smooth|gradual/.test(normalized)) return "balanced";
  return undefined;
};

const inferCorridor = (text: string, fallback?: string): string | undefined => {
  const normalized = text.toLowerCase();
  if (normalized.includes("hormuz")) return "Strait of Hormuz";
  if (normalized.includes("red sea") || normalized.includes("bab-el-mandeb") || normalized.includes("bab el mandeb")) return "Red Sea";
  if (normalized.includes("suez")) return "Suez Canal";
  if (normalized.includes("black sea")) return "Black Sea";
  return fallback;
};

const fallbackFormat = (input: SroaInput): { input: SroaInput; formatting: SroaInputFormattingResult } => {
  const scenarioText = input.scenario_text ?? input.dsm_request?.scenario_text ?? "";
  const inferredFields: string[] = [];
  const formatted: SroaInput = { ...input };

  if (!formatted.policy) {
    const inferredPolicy = inferPolicy(scenarioText);
    if (inferredPolicy) {
      formatted.policy = inferredPolicy;
      inferredFields.push("policy");
    }
  }
  if (!formatted.corridor) {
    const inferredCorridor = inferCorridor(scenarioText, formatted.dsm_request?.corridor);
    if (inferredCorridor) {
      formatted.corridor = inferredCorridor;
      inferredFields.push("corridor");
    }
  }
  if (!formatted.dsm_output && !formatted.dsm_request) {
    formatted.dsm_request = {
      corridor: formatted.corridor ?? "general",
      scenario_text: scenarioText || "Run DSM before SROA reserve optimization",
    };
    inferredFields.push("dsm_request");
  }

  return {
    input: formatted,
    formatting: {
      used_llm: false,
      provider: "fallback_rules",
      inferred_fields: inferredFields,
      missing_fields: formatted.dsm_output || formatted.dsm_request ? [] : ["dsm_output_or_dsm_request"],
      notes: ["SROA LLM formatting was disabled or unavailable; deterministic fallback formatting was used."],
    },
  };
};

export const formatSroaInput = async (
  input: SroaInput
): Promise<{ input: SroaInput; formatting: SroaInputFormattingResult }> => {
  const prompt = `You format input for SROA, a deterministic Strategic Reserve Optimization agent.
Return ONLY JSON. Do not calculate reserve releases, supply gaps, or drawdown schedules.
Operational data such as reserves, consumption, imports, prices, and supplier mix comes from MongoDB, not from you.

Expected output keys:
{
  "corridor": "optional string",
  "policy": "conservative" | "balanced" | "aggressive",
  "safety_floor_days": optional number,
  "max_daily_release_volume": optional number,
  "dsm_request": optional object matching { "corridor": string, "scenario_text": string, "keywords": string[] },
  "inferred_fields": ["field names you inferred"],
  "missing_fields": ["required fields that cannot be inferred"],
  "notes": ["short notes"]
}

Rules:
- Use the LLM only to normalize messy request shape.
- Never invent current reserve, consumption, import, price, or supplier data.
- If dsm_output is already provided, do not replace it.
- If no dsm_output is provided, prepare a dsm_request from scenario/corridor text.
- Never create drawdown_schedule or remaining_supply_gap.

Raw SROA request:
${JSON.stringify(input)}`;

  const text = await invokeLlm(prompt);
  const parsed = text ? extractJson<SroaLlmFormatResponse>(text) : null;
  if (!parsed) {
    return fallbackFormat(input);
  }

  const formatted: SroaInput = {
    ...input,
    corridor: parsed.corridor ?? input.corridor,
    policy: normalizePolicy(parsed.policy) ?? input.policy,
    safety_floor_days: parseNumber(parsed.safety_floor_days) ?? input.safety_floor_days,
    max_daily_release_volume: parseNumber(parsed.max_daily_release_volume) ?? input.max_daily_release_volume,
    dsm_request: input.dsm_output ? input.dsm_request : parsed.dsm_request ?? input.dsm_request,
  };

  return {
    input: fallbackFormat(formatted).input,
    formatting: {
      used_llm: true,
      provider,
      inferred_fields: parsed.inferred_fields ?? [],
      missing_fields: parsed.missing_fields ?? [],
      notes: parsed.notes ?? [],
    },
  };
};

const localSanityCheck = (output: SroaOutput): SroaSanityCheckResult => {
  const warnings: string[] = [];
  output.drawdown_schedule.forEach((day) => {
    if (day.release_volume < 0) warnings.push(`Day ${day.day} release_volume is negative.`);
    if (day.release_rate_pct > 100) warnings.push(`Day ${day.day} release_rate_pct exceeds daily consumption.`);
    if (day.reserve_after_release < 0) warnings.push(`Day ${day.day} reserve_after_release is negative.`);
    if (day.release_volume > day.forecast_gap_volume) warnings.push(`Day ${day.day} release exceeds forecast gap.`);
  });
  if (output.total_released_volume > output.initial_reserve_volume) {
    warnings.push("Total release exceeds initial reserve volume.");
  }

  return {
    used_llm: false,
    provider: "local_rules",
    status: warnings.length > 0 ? "warning" : "pass",
    warnings,
    notes: ["Local deterministic SROA sanity checks were applied."],
  };
};

export const explainSroaOutput = async (
  input: SroaInput,
  operationalData: SroaOperationalData,
  output: SroaOutput
): Promise<{ summary: string; sanity_check: SroaSanityCheckResult }> => {
  const localCheck = localSanityCheck(output);
  const prompt = `You review SROA output for an energy dashboard.
The optimization math is already complete. Do NOT recalculate or change any numbers.
Return ONLY JSON:
{
  "summary": "plain English explanation using provided values",
  "status": "pass" | "warning",
  "warnings": ["logical issues only"],
  "notes": ["brief notes"]
}

Check only for obvious inconsistencies:
- release exceeds reserve
- release exceeds daily consumption
- reserve goes negative
- output claims safety is preserved when safety_threshold_breached is true

SROA request:
${JSON.stringify(input)}

Operational Mongo data:
${JSON.stringify(operationalData)}

Deterministic SROA output:
${JSON.stringify(output)}`;

  const text = await invokeLlm(prompt);
  const parsed = text ? extractJson<SroaLlmReviewResponse>(text) : null;
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
