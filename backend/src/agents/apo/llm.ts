import { ApoCandidateScore, ApoInput, ApoLlmReasoning } from "./types";

const geminiModel = process.env.APO_GEMINI_MODEL ?? process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
const hfModel = process.env.APO_LLM_MODEL ?? "mistralai/Mistral-7B-Instruct-v0.3";
const provider = process.env.APO_LLM_PROVIDER ?? (process.env.GEMINI_API_KEY ? "gemini" : "huggingface");
const enabled = (): boolean => process.env.APO_LLM_ENABLED !== "false";

const extractJson = (text: string): Record<string, unknown> | null => {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) return null;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const extractGeminiText = (payload: any): string =>
  String(payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text ?? "").join("") ?? "").trim();

const callGemini = async (prompt: string): Promise<string | null> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + geminiModel + ":generateContent", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{
          text: [
            "You are APO, the Adaptive Procurement Orchestrator for an energy supply-chain dashboard.",
            "The deterministic engine has already calculated and ranked procurement options.",
            "Never change, recalculate, reorder, round aggressively, or invent numbers.",
            "Your job is output formatting, plain-English reasoning, and sanity flags only.",
            "Return strict JSON only.",
          ].join(" "),
        }],
      },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 1400,
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    console.warn("Gemini APO LLM failed:", payload);
    return null;
  }
  return extractGeminiText(payload);
};

const callHuggingFace = async (prompt: string): Promise<string | null> => {
  const token = process.env.HF_TOKEN;
  if (!token) return null;

  const response = await fetch(`https://api-inference.huggingface.co/models/${hfModel}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: { max_new_tokens: 650, temperature: 0.2, return_full_text: false },
    }),
  });

  if (!response.ok) throw new Error(`HuggingFace APO LLM failed: ${response.status}`);
  const payload = (await response.json()) as unknown;
  if (Array.isArray(payload) && payload[0] && typeof payload[0] === "object" && "generated_text" in payload[0]) {
    return String((payload[0] as { generated_text?: unknown }).generated_text ?? "");
  }
  if (typeof payload === "object" && payload && "generated_text" in payload) {
    return String((payload as { generated_text?: unknown }).generated_text ?? "");
  }
  return JSON.stringify(payload);
};

const callConfiguredLlm = async (prompt: string): Promise<{ raw: string | null; usedProvider: string }> => {
  if (provider === "gemini") {
    const raw = await callGemini(prompt);
    return { raw, usedProvider: raw ? "gemini" : "fallback_rules" };
  }
  if (provider === "huggingface") {
    const raw = await callHuggingFace(prompt);
    return { raw, usedProvider: raw ? "huggingface" : "fallback_rules" };
  }
  return { raw: null, usedProvider: "fallback_rules" };
};

const fallbackFormattedRecommendation = (candidates: ApoCandidateScore[], totalVolumeNeeded: number): string => {
  const top = candidates[0];
  if (!top) return "APO found no feasible procurement option for the remaining supply gap.";
  const lines = [
    "APO recommendation",
    "Primary action: activate " + top.supplier_name + " via " + top.via + ".",
    "Coverage: " + Math.round(top.volume_offered).toLocaleString("en-US") + " bbl of " + Math.round(totalVolumeNeeded || top.volume_offered).toLocaleString("en-US") + " bbl required.",
    "Commercials: $" + top.landed_cost_per_barrel.toFixed(2) + "/bbl landed cost, " + top.transit_days + "d transit, route risk " + top.route_risk_score.toFixed(0) + "/100.",
    "Why this ranks first: fastest feasible coverage with the best price, capacity, refinery compatibility, and route-risk tradeoff.",
  ];
  const backups = candidates.slice(1, 3);
  if (backups.length > 0) {
    lines.push("Backups:");
    backups.forEach((option, index) => {
      lines.push(String(index + 2) + ". " + option.supplier_name + " via " + option.via + " - " + option.transit_days + "d, $" + option.landed_cost_per_barrel.toFixed(2) + "/bbl, risk " + option.route_risk_score.toFixed(0) + "/100.");
    });
  }
  return lines.join("\n");
};

const fallbackExplanation = (option: ApoCandidateScore, index: number): string => {
  const rankLabel = index === 0 ? "Top recommendation" : `Rank ${index + 1}`;
  const riskPhrase = option.route_risk_score >= 65 ? "elevated route risk" : option.route_risk_score >= 35 ? "moderate route risk" : "low route risk";
  return `${rankLabel}: ${option.supplier_name} via ${option.via} offers ${option.volume_offered.toLocaleString()} barrels at about $${option.landed_cost_per_barrel}/bbl with ${option.transit_days} day transit and ${riskPhrase}. Its score reflects price, capacity, refinery compatibility, and current GRIA route-risk evidence.`;
};

export const explainApoRanking = async (input: ApoInput, candidates: ApoCandidateScore[]): Promise<ApoLlmReasoning> => {
  const top = candidates.slice(0, 3);
  const fallback: ApoLlmReasoning = {
    used_llm: false,
    provider: "fallback_rules",
    flags: [],
    explanations: Object.fromEntries(top.map((option, index) => [`${option.supplier_id}:${option.route_id}`, fallbackExplanation(option, index)])),
    summary: top[0]
      ? `${top[0].supplier_name} is currently the highest-ranked procurement alternative based on deterministic APO scoring.`
      : "No APO procurement alternatives were available for ranking.",
    formatted_recommendation: fallbackFormattedRecommendation(top, input.sroa_output?.remaining_supply_gap?.reduce((sum, day) => sum + Math.max(0, Number(day.unfulfilled_volume)), 0) ?? input.remaining_supply_gap?.reduce((sum, day) => sum + Math.max(0, Number(day.unfulfilled_volume)), 0) ?? top[0]?.volume_offered ?? 0),
  };

  if (!enabled() || top.length === 0) return fallback;

  const prompt = `You are APO, the Adaptive Procurement Orchestrator. The deterministic engine has already ranked candidate crude suppliers and routes. Do not reorder them. Write procurement-team explanations and flag if the ranking should be reviewed due to route/geopolitical concerns visible in the provided evidence.

Return strict JSON only with keys: summary, formatted_recommendation, flags, explanations.

Formatting rules for formatted_recommendation:
- Write a compact dashboard card with line breaks, not a long paragraph.
- Start with "APO recommendation".
- Include Primary action, Coverage, Commercials, Why this ranks first, Backups, and Flags/Caveat when relevant.
- Do not reorder candidates or change any numbers.
- Do not invent suppliers, prices, volumes, route risks, transit days, or scores.
- explanations must be keyed by candidate key.

Request context: ${JSON.stringify({ corridor: input.corridor, target_refineries: input.target_refineries, has_sroa_output: Boolean(input.sroa_output) }).slice(0, 1200)}

Ranked candidates: ${JSON.stringify(top.map((candidate) => ({
    key: `${candidate.supplier_id}:${candidate.route_id}`,
    supplier_name: candidate.supplier_name,
    region: candidate.region,
    crude_grade: candidate.crude_grade,
    via: candidate.via,
    landed_cost_per_barrel: candidate.landed_cost_per_barrel,
    transit_days: candidate.transit_days,
    route_risk_score: candidate.route_risk_score,
    composite_score: candidate.composite_score,
    volume_offered: candidate.volume_offered,
    score_breakdown: candidate.score_breakdown,
    supporting_events: candidate.supporting_event_details?.slice(0, 3).map((event) => ({ headline: event.headline, riskScore: event.riskScore, severity: event.severity, summary: event.summary })),
  })), null, 2).slice(0, 9000)}`;

  try {
    const { raw, usedProvider } = await callConfiguredLlm(prompt);
    if (!raw) return fallback;
    const parsed = extractJson(raw);
    if (!parsed) return fallback;
    const parsedExplanations = parsed.explanations && typeof parsed.explanations === "object"
      ? Object.fromEntries(Object.entries(parsed.explanations as Record<string, unknown>).map(([key, value]) => [key, String(value)]))
      : fallback.explanations;
    return {
      used_llm: true,
      provider: usedProvider,
      flags: Array.isArray(parsed.flags) ? parsed.flags.map(String) : [],
      explanations: { ...fallback.explanations, ...parsedExplanations },
      summary: parsed.summary ? String(parsed.summary) : fallback.summary,
      formatted_recommendation: parsed.formatted_recommendation ? String(parsed.formatted_recommendation) : fallback.formatted_recommendation,
    };
  } catch (error) {
    console.warn("APO LLM unavailable, using deterministic explanations:", error instanceof Error ? error.message : error);
    return fallback;
  }
};
