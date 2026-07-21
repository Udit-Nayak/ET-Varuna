import { runApoRecommendation } from "../apo/service";
import { ApoOutput } from "../apo/types";
import { runDsmSimulation } from "../dsm/service";
import { DsmSimulationOutput } from "../dsm/types";
import { queryVectorKnowledge } from "../gria/service";
import { runSroaOptimization } from "../sroa/service";
import { SroaOutput, SroaPolicy } from "../sroa/types";

const GROQ_INSTANT_MODEL = "llama-3.1-8b-instant";
const GROQ_MODEL = GROQ_INSTANT_MODEL;
const GROQ_CHATBOT_MODEL = GROQ_INSTANT_MODEL;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface AgentChatAnswer {
  final: string;
  generatedAt: string;
  usedGroq: boolean;
  normalized?: NormalizedQuestion;
  gria?: {
    query: string;
    matches: unknown[];
    summary: string;
  };
  dsm?: DsmSimulationOutput;
  sroa?: SroaOutput;
  apo?: ApoOutput;
}

export interface DirectChatbotAnswer {
  answer: string;
  generatedAt: string;
  usedGroq: boolean;
}

const extractGroqText = (payload: any): string =>
  String(payload?.choices?.[0]?.message?.content ?? "").trim();

const callGroq = async (
  prompt: string,
  systemInstruction: string,
  maxOutputTokens = 1400,
  model = GROQ_MODEL
): Promise<string | null> => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt },
        ],
        temperature: 0.25,
        max_tokens: maxOutputTokens,
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      console.warn("Groq request failed:", payload);
      return null;
    }
    return extractGroqText(payload);
  } catch (error) {
    console.warn("Groq request skipped:", error);
    return null;
  }
};

const isDefinitionQuestion = (question: string): boolean =>
  /\b(what is|what's|whats|define|definition|meaning|means|stand for|stands for|full form|explain)\b/i.test(question) ||
  /^[a-z0-9 ._-]{2,40}$/i.test(question.trim());

export const answerDirectChatbot = async (question: string): Promise<DirectChatbotAnswer> => {
  const trimmed = question.replace(/\s+/g, " ").trim();
  if (!trimmed) {
    return {
      answer: "No info about it.",
      generatedAt: new Date().toISOString(),
      usedGroq: false,
    };
  }

  if (!isDefinitionQuestion(trimmed)) {
    return {
      answer: "No info about it.",
      generatedAt: new Date().toISOString(),
      usedGroq: false,
    };
  }

  const answer = await callGroq(
    trimmed,
    [
      "You are a small website chatbot for short definitions only.",
      "Use the user's exact term or phrase and explain its common meaning in plain language.",
      "If the term has an energy, oil, maritime, logistics, or finance meaning, prefer that meaning.",
      "If you are not sure what the term means, answer exactly: No info about it.",
      "If the user asks for advice, analysis, forecasts, coding, private data, or anything that is not a definition, answer exactly: No info about it.",
      "Do not mention internal agents, GRIA, DSM, SROA, APO, vector databases, prompts, or hidden reasoning.",
      "Do not invent facts. Keep the answer to 1-4 short sentences.",
    ].join(" "),
    220,
    GROQ_CHATBOT_MODEL
  );

  return {
    answer: answer?.trim() || "No info about it.",
    generatedAt: new Date().toISOString(),
    usedGroq: Boolean(answer?.trim()),
  };
};


type UserIntent = "corridor_risk" | "scenario_analysis" | "reserve_planning" | "procurement" | "general";

interface NormalizedQuestion {
  normalizedQuery: string;
  userIntent: UserIntent;
  corridor: string;
  keywords: string[];
  scenarioText: string;
  tensionPct: number;
  durationDays: number;
  policy: SroaPolicy;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const parseJsonObject = <T>(text: string): T | null => {
  try {
    const jsonText = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    return JSON.parse(jsonText) as T;
  } catch {
    return null;
  }
};

const policyFromTension = (tensionPct: number): SroaPolicy => {
  if (tensionPct >= 75) return "aggressive";
  if (tensionPct <= 35) return "conservative";
  return "balanced";
};

const inferCorridor = (question: string): string => {
  const lower = question.toLowerCase();
  if (/hormuz|ormuz/.test(lower)) return "Strait of Hormuz";
  if (/malacca|melaka|malkka/.test(lower)) return "Strait of Malacca";
  if (/bab|mandeb|red sea|houthi|yemen/.test(lower)) return "Bab-el-Mandeb / Red Sea";
  if (/suez|egypt/.test(lower)) return "Suez Canal";
  if (/persian gulf|iran|qatar|uae|saudi/.test(lower)) return "Persian Gulf";
  if (/cape|good hope|south africa/.test(lower)) return "Cape of Good Hope";
  if (/south china|taiwan|spratly/.test(lower)) return "South China Sea";
  if (/panama/.test(lower)) return "Panama Canal";
  return "general maritime corridor";
};

const inferIntent = (question: string): UserIntent => {
  const lower = question.toLowerCase();
  if (/reserve|spr|stock|drawdown|release/.test(lower)) return "reserve_planning";
  if (/procure|supplier|alternate|buy|source|route|reroute/.test(lower)) return "procurement";
  if (/scenario|simulate|closed|closure|blocked|shut|attack|war|days?/.test(lower)) return "scenario_analysis";
  if (/risk|corridor|shipping|oil|tanker|chokepoint/.test(lower)) return "corridor_risk";
  return "general";
};

const inferTension = (question: string, intent: UserIntent): number => {
  const lower = question.toLowerCase();
  if (/closed|blocked|war|attack|halt|shutdown|crisis/.test(lower)) return 78;
  if (/risk|tension|delay|sanction|conflict/.test(lower)) return 58;
  if (intent === "general") return 35;
  return 50;
};

const inferDuration = (question: string): number => {
  const match = question.match(/(\d{1,2})\s*(day|days|d)\b/i);
  if (!match) return 14;
  return clamp(Math.round(Number(match[1])), 1, 90);
};

const keywordsFromQuestion = (question: string, corridor: string): string[] => {
  const tokens = question
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 3)
    .slice(0, 8);
  return Array.from(new Set([corridor, "India", "oil", "shipping", "tanker", "geopolitics", ...tokens]));
};

const fallbackNormalizedQuestion = (question: string): NormalizedQuestion => {
  const normalizedQuery = question.replace(/\s+/g, " ").trim();
  const corridor = inferCorridor(normalizedQuery);
  const userIntent = inferIntent(normalizedQuery);
  const tensionPct = inferTension(normalizedQuery, userIntent);
  const durationDays = inferDuration(normalizedQuery);
  return {
    normalizedQuery,
    userIntent,
    corridor,
    keywords: keywordsFromQuestion(normalizedQuery, corridor),
    scenarioText: `${normalizedQuery}. Analyze implications for India's crude supply, shipping routes, reserves, procurement, and downstream energy resilience.`,
    tensionPct,
    durationDays,
    policy: policyFromTension(tensionPct),
  };
};

const normalizeQuestion = async (question: string): Promise<{ normalized: NormalizedQuestion; usedGroq: boolean }> => {
  const fallback = fallbackNormalizedQuestion(question);
  const text = await callGroq(
    question,
    [
      "You convert messy operator questions into inputs for an energy supply-chain risk system.",
      "Correct spelling mistakes and infer the intended corridor or topic.",
      "Return JSON only with keys: normalizedQuery, userIntent, corridor, keywords, scenarioText, tensionPct, durationDays, policy.",
      "userIntent must be one of corridor_risk, scenario_analysis, reserve_planning, procurement, general.",
      "policy must be conservative, balanced, or aggressive.",
      "tensionPct is 0-100 and durationDays is 1-90.",
      "Prefer India crude oil, maritime chokepoints, trade routes, foreign affairs, and supply-chain resilience context.",
    ].join(" "),
    700
  );

  const parsed = text ? parseJsonObject<Partial<NormalizedQuestion>>(text) : null;
  if (!parsed) return { normalized: fallback, usedGroq: false };

  const tensionPct = clamp(Number(parsed.tensionPct ?? fallback.tensionPct), 0, 100);
  const policy =
    parsed.policy === "conservative" || parsed.policy === "balanced" || parsed.policy === "aggressive"
      ? parsed.policy
      : policyFromTension(tensionPct);
  const userIntent =
    parsed.userIntent === "corridor_risk" ||
    parsed.userIntent === "scenario_analysis" ||
    parsed.userIntent === "reserve_planning" ||
    parsed.userIntent === "procurement" ||
    parsed.userIntent === "general"
      ? parsed.userIntent
      : fallback.userIntent;
  const corridor = String(parsed.corridor ?? fallback.corridor).trim() || fallback.corridor;
  const normalizedQuery = String(parsed.normalizedQuery ?? fallback.normalizedQuery).trim() || fallback.normalizedQuery;

  return {
    usedGroq: true,
    normalized: {
      normalizedQuery,
      userIntent,
      corridor,
      keywords: Array.isArray(parsed.keywords) && parsed.keywords.length > 0 ? parsed.keywords.map(String) : fallback.keywords,
      scenarioText: String(parsed.scenarioText ?? fallback.scenarioText),
      tensionPct,
      durationDays: clamp(Math.round(Number(parsed.durationDays ?? fallback.durationDays)), 1, 90),
      policy,
    },
  };
};

const summarizeGria = (matches: unknown[], normalized: NormalizedQuestion): string => {
  if (matches.length === 0) {
    return `GRIA found no stored vector matches for "${normalized.normalizedQuery}", so downstream agents used the normalized scenario and corridor heuristics instead of stopping.`;
  }
  return `GRIA retrieved ${matches.length} stored intelligence match${matches.length === 1 ? "" : "es"} for ${normalized.corridor}.`;
};

const summarizeApo = (apo: ApoOutput): string => {
  const top = apo.ranked_options[0];
  if (!top) return "APO found no feasible procurement alternative for the residual supply gap.";
  return "APO recommends " + top.supplier_name + " via " + top.via + ", covering " + Math.round(top.volume_offered).toLocaleString("en-US") + " barrels at USD " + top.landed_cost_per_barrel.toFixed(2) + "/bbl with " + top.transit_days + "d transit and route risk " + top.route_risk_score.toFixed(0) + "/100.";
};

const fallbackFinal = (normalized: NormalizedQuestion, griaSummary: string, dsm: DsmSimulationOutput, sroa: SroaOutput, apo: ApoOutput): string =>
  [
    `Answer for: ${normalized.normalizedQuery}`,
    "",
    `GRIA: ${griaSummary}`,
    `DSM: ${dsm.capacity_loss_pct}% capacity loss for ${dsm.duration_days} days on ${dsm.corridor}. ${dsm.summary}`,
    `SROA: ${sroa.policy} reserve policy releases ${Math.round(sroa.total_released_volume).toLocaleString("en-US")} barrels and leaves ${sroa.reserve_after_plan_days.toFixed(2)} reserve days. ${sroa.safety_threshold_breached ? "Safety threshold is under stress." : "Safety threshold remains protected."}`,
    summarizeApo(apo),
  ].join("\n");

const synthesizeFinal = async (
  question: string,
  normalized: NormalizedQuestion,
  griaSummary: string,
  dsm: DsmSimulationOutput,
  sroa: SroaOutput,
  apo: ApoOutput
): Promise<string | null> =>
  callGroq(
    JSON.stringify(
      {
        originalQuestion: question,
        normalized,
        griaSummary,
        dsm: {
          corridor: dsm.corridor,
          capacity_loss_pct: dsm.capacity_loss_pct,
          duration_days: dsm.duration_days,
          summary: dsm.summary,
          based_on_events: dsm.based_on_events,
        },
        sroa: {
          policy: sroa.policy,
          total_released_volume: sroa.total_released_volume,
          reserve_after_plan_days: sroa.reserve_after_plan_days,
          safety_threshold_breached: sroa.safety_threshold_breached,
          summary: sroa.summary,
        },
        apo,
      },
      null,
      2
    ),
    [
      "You are Sentrix's operator-facing analyst.",
      "Answer the user's question like a competent chat assistant, but ground the response in GRIA, DSM, SROA, and APO outputs.",
      "Be structured, concise, and actionable.",
      "Use headings: Direct answer, Agent outputs, Recommended next steps.",
      "Mention uncertainty when GRIA has sparse stored matches.",
    ].join(" "),
    1600
  );

export const answerAgentChat = async (question: string): Promise<AgentChatAnswer> => {
  try {
    const { normalized, usedGroq: usedGroqForNormalization } = await normalizeQuestion(question);
    const vectorQuery = [normalized.normalizedQuery, normalized.corridor, ...normalized.keywords].join(" ");
    const griaMatches = (await queryVectorKnowledge({ query: vectorQuery, limit: 6 }).catch((error) => {
      console.warn("Chat GRIA retrieval unavailable; continuing with deterministic agents:", error instanceof Error ? error.message : error);
      return [] as unknown[];
    })) as unknown[];
    const dsm = await runDsmSimulation({
      corridor: normalized.corridor,
      scenario_text: normalized.scenarioText,
      vector_query: vectorQuery,
      keywords: normalized.keywords,
      capacity_loss_pct: normalized.tensionPct,
      duration_days: normalized.durationDays,
    });
    const sroa = await runSroaOptimization({
      corridor: normalized.corridor,
      policy: normalized.policy,
      dsm_output: dsm,
      scenario_text: normalized.scenarioText,
    });
    const apo = await runApoRecommendation({
      corridor: normalized.corridor,
      sroa_output: sroa,
      dsm_output: dsm,
      max_options: 3,
    });
    const griaSummary = summarizeGria(griaMatches, normalized);
    const synthesized = await synthesizeFinal(question, normalized, griaSummary, dsm, sroa, apo);
    const final = synthesized?.trim() || fallbackFinal(normalized, griaSummary, dsm, sroa, apo);

    return {
      final,
      generatedAt: new Date().toISOString(),
      usedGroq: usedGroqForNormalization || Boolean(synthesized?.trim()),
      normalized,
      gria: {
        query: vectorQuery,
        matches: griaMatches,
        summary: griaSummary,
      },
      dsm,
      sroa,
      apo,
    };
  } catch (error) {
    console.warn("Agent chat workflow failed:", error);
    const normalized = fallbackNormalizedQuestion(question);
    return {
      final: [
        `Answer for: ${normalized.normalizedQuery}`,
        "",
        "The full agent workflow could not complete for this request, but the question was normalized successfully.",
        `Interpreted corridor/topic: ${normalized.corridor}`,
        `Intent: ${normalized.userIntent}`,
        "Please retry once the backend data services are connected.",
      ].join("\n"),
      generatedAt: new Date().toISOString(),
      usedGroq: false,
      normalized,
    };
  }
};

export type AgentOutputFormatTarget = "dsm" | "sroa" | "apo";
export type AgentQuestionTarget = AgentOutputFormatTarget | "tfm";

const formatNumber = (value: unknown, digits = 2): string => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : "n/a";
};

const formatBarrels = (value: unknown): string =>
  Math.round(Number(value) || 0).toLocaleString("en-US") + " bbl";

const selectRows = <T>(rows: T[] = [], count = 6): T[] => {
  if (rows.length <= count) return rows;
  const first = rows.slice(0, Math.ceil(count / 2));
  const last = rows.slice(-Math.floor(count / 2));
  return [...first, ...last];
};

const fallbackAgentOutputFormat = (agent: AgentOutputFormatTarget, payload: any): string => {
  const upper = agent.toUpperCase();
  const data = payload?.[agent] ?? payload;
  if (!data) return upper + " output is not available yet. Run the workflow first.";

  if (agent === "dsm") {
    const timeline = Array.isArray(data.impact_timeline) ? data.impact_timeline : [];
    const assumptions = data.assumptions ?? {};
    const timelineLines = selectRows(timeline, 8).map((day: any) =>
      "Day " + day.day + ": refinery output " + formatNumber(day.refinery_output_pct) + "%, price change " + formatNumber(day.price_change_pct) + "%, GDP impact " + formatNumber(day.gdp_impact_pct) + "%"
    );
    return [
      "DSM Detailed Output",
      "",
      "Snapshot",
      "Corridor: " + (data.corridor ?? payload?.corridor ?? "n/a"),
      "Scenario ID: " + (data.scenario_id ?? "n/a"),
      "Capacity loss: " + Number(data.capacity_loss_pct ?? 0) + "%",
      "Duration: " + Number(data.duration_days ?? 0) + " days",
      "Events used: " + (Array.isArray(data.based_on_events) ? data.based_on_events.length : 0),
      "",
      "Key Interpretation",
      data.summary ?? "No DSM summary returned.",
      "",
      "Impact Timeline",
      ...(timelineLines.length ? timelineLines : ["No timeline rows returned."]),
      timeline.length > timelineLines.length ? "Timeline condensed: showing first and last high-signal rows from " + timeline.length + " total days." : "",
      "",
      "Assumptions",
      "Baseline refinery output: " + formatNumber(assumptions.baselineRefineryOutputPct) + "%",
      "Import dependency: " + formatNumber(assumptions.importDependencyPct) + "%",
      "Affected import share: " + formatNumber(assumptions.affectedImportSharePct) + "%",
      "Price elasticity: " + formatNumber(assumptions.priceElasticity),
      "Reserve cushion: " + formatNumber(assumptions.reserveCushionDays) + " days",
      "Substitution ramp: " + formatNumber(assumptions.substitutionRampPctPerDay) + "% per day",
      "Max substitution: " + formatNumber(assumptions.maxSubstitutionPct) + "%",
      "",
      "Sanity / Formatting",
      "Input formatting: " + (data.input_formatting?.provider ?? "n/a"),
      "Sanity status: " + (data.sanity_check?.status ?? "n/a"),
      ...(Array.isArray(data.sanity_check?.warnings) ? data.sanity_check.warnings.map((warning: string) => "Warning: " + warning) : []),
    ].filter(Boolean).join("\n");
  }

  if (agent === "sroa") {
    const schedule = Array.isArray(data.drawdown_schedule) ? data.drawdown_schedule : [];
    const gaps = Array.isArray(data.remaining_supply_gap) ? data.remaining_supply_gap : [];
    const operational = data.operational_data ?? {};
    const scheduleLines = selectRows(schedule, 8).map((day: any) =>
      "Day " + day.day + ": release " + formatBarrels(day.release_volume) + ", forecast gap " + formatBarrels(day.forecast_gap_volume) + ", unfulfilled " + formatBarrels(day.unfulfilled_volume) + ", reserve after " + formatNumber(day.reserve_after_plan_days) + " days"
    );
    const gapTotal = gaps.reduce((sum: number, day: any) => sum + Math.max(0, Number(day.unfulfilled_volume)), 0);
    return [
      "SROA Detailed Output",
      "",
      "Snapshot",
      "Corridor: " + (data.corridor ?? payload?.corridor ?? "n/a"),
      "Policy: " + (data.policy ?? "n/a"),
      "Total reserve release: " + formatBarrels(data.total_released_volume),
      "Reserve after plan: " + formatNumber(data.reserve_after_plan_days) + " days",
      "Safety threshold: " + (data.safety_threshold_breached ? "breached" : "protected"),
      "Remaining procurement gap: " + formatBarrels(gapTotal),
      "",
      "Operational Data Used",
      "Current reserve: " + formatNumber(operational.current_reserve_days) + " days / " + formatBarrels(operational.current_reserve_volume),
      "Daily consumption: " + Math.round(Number(operational.daily_consumption_rate ?? 0)).toLocaleString("en-US") + " bpd",
      "Import volume: " + Math.round(Number(operational.recent_import_volume ?? 0)).toLocaleString("en-US") + " bpd",
      "Import dependency: " + formatNumber(operational.import_dependency_pct) + "%",
      "Commercial stock: " + formatNumber(operational.commercial_stock_days) + " days",
      "Current price: $" + formatNumber(operational.current_price_usd_per_barrel) + "/bbl",
      "Data as of: " + (operational.data_as_of ?? "n/a"),
      "",
      "Reserve Drawdown Schedule",
      ...(scheduleLines.length ? scheduleLines : ["No drawdown schedule returned."]),
      schedule.length > scheduleLines.length ? "Schedule condensed: showing first and last high-signal rows from " + schedule.length + " total days." : "",
      "",
      "Interpretation",
      data.summary ?? "No SROA summary returned.",
      "",
      "Sanity Check",
      "Status: " + (data.sanity_check?.status ?? "n/a"),
      ...(Array.isArray(data.sanity_check?.warnings) ? data.sanity_check.warnings.map((warning: string) => "Warning: " + warning) : []),
    ].filter(Boolean).join("\n");
  }

  const options = Array.isArray(data.ranked_options) ? data.ranked_options : [];
  const optionLines = options.slice(0, 6).flatMap((option: any, index: number) => [
    String(index + 1) + ". " + option.supplier_name + " via " + option.via,
    "   Grade: " + (option.crude_grade ?? "n/a") + " | Region: " + (option.region ?? "n/a"),
    "   Volume: " + formatBarrels(option.volume_offered) + " | Landed cost: $" + formatNumber(option.landed_cost_per_barrel) + "/bbl | Transit: " + Number(option.transit_days ?? 0) + " days | Route risk: " + formatNumber(option.route_risk_score, 0) + "/100 | Score: " + formatNumber(option.composite_score, 3),
    "   Reason: " + (option.explanation ?? "n/a"),
  ]);
  return [
    "APO Detailed Output",
    "",
    "Snapshot",
    "Corridor: " + (data.corridor ?? payload?.corridor ?? "n/a"),
    "Total volume needed: " + formatBarrels(data.total_volume_needed),
    "First gap day: " + (data.urgency?.first_gap_day ?? "n/a"),
    "Peak gap: " + formatBarrels(data.urgency?.peak_unfulfilled_volume) + " on day " + (data.urgency?.peak_gap_day ?? "n/a"),
    "Disruption duration: " + (data.urgency?.disruption_duration_days ?? "n/a") + " days",
    "",
    "Procurement Recommendation",
    data.formatted_recommendation ?? data.llm_summary ?? "No APO formatted recommendation returned.",
    "",
    "Ranked Options",
    ...(optionLines.length ? optionLines : ["No ranked procurement options returned."]),
    "",
    "Scoring Weights",
    "Price: " + formatNumber(data.scoring_weights?.price, 3) + ", transit: " + formatNumber(data.scoring_weights?.transit, 3) + ", route risk: " + formatNumber(data.scoring_weights?.route_risk, 3) + ", capacity: " + formatNumber(data.scoring_weights?.capacity, 3) + ", compatibility: " + formatNumber(data.scoring_weights?.compatibility, 3),
    "",
    "Flags / Caveats",
    ...(Array.isArray(data.llm_flags) && data.llm_flags.length ? data.llm_flags.map((flag: string) => "Flag: " + flag) : ["No APO LLM flags returned."]),
  ].join("\n");
};

export const formatAgentOutput = async (
  agent: AgentOutputFormatTarget,
  payload: any
): Promise<{ agent: AgentOutputFormatTarget; formatted: string; usedGemini: boolean; generatedAt: string }> => {
  const agentPayload = payload?.[agent] ?? payload;
  const fallback = fallbackAgentOutputFormat(agent, payload);
  const text = await callGroq(
    JSON.stringify(
      {
        agent,
        context: {
          corridor: payload?.corridor ?? payload?.normalized?.corridor,
          recommendation: payload?.recommendation ?? payload?.final,
          generatedAt: payload?.generatedAt,
        },
        agent_output: agentPayload,
      },
      null,
      2
    ).slice(0, 30000),
    [
      "You format raw agent output for the Sentrix dashboard.",
      "Use the language model only for formatting and explanation; do not recalculate, reorder, invent, or alter values.",
      "Write a detailed, readable operator page for the selected agent, suitable for a full right-panel page.",
      "Use clear section headings: Snapshot, What the agent decided, Key numbers, Timeline or schedule, Data used, Interpretation, Caveats / next actions.",
      "For DSM, explain the day-by-day impact timeline, assumptions, refinery output, price impact, and GDP/power stress meaning.",
      "For SROA, explain operational data used, reserve drawdown schedule, remaining gaps, safety floor, and why the chosen policy releases that amount.",
      "For APO, explain total volume needed, ranked suppliers/routes, cost, transit, route risk, compatibility, and why the top option wins.",
      "If arrays are long, summarize ranges and show representative first/peak/last rows with exact values.",
      "Do not use markdown tables. Use readable bullets and short paragraphs.",
    ].join(" "),
    3600
  );

  return {
    agent,
    formatted: text?.trim() || fallback,
    usedGemini: Boolean(text?.trim()),
    generatedAt: new Date().toISOString(),
  };
};

const dayFromQuestion = (question: string): number | null => {
  const match = question.match(/\bday\s*(\d+)(?:st|nd|rd|th)?\b|\b(\d+)(?:st|nd|rd|th)?\s*day\b/i);
  const value = Number(match?.[1] ?? match?.[2]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const rankFromQuestion = (question: string): number | null => {
  const normalized = question.toLowerCase();
  if (/\b(first|top|best|primary)\b/.test(normalized)) return 1;
  if (/\b(second)\b/.test(normalized)) return 2;
  if (/\b(third)\b/.test(normalized)) return 3;
  const match = normalized.match(/\brank\s*(\d+)\b|\boption\s*(\d+)\b/);
  const value = Number(match?.[1] ?? match?.[2]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const findDayRow = (rows: any[], day: number): any | null =>
  rows.find((row) => Number(row?.day) === day) ?? null;

const findDsmDayInText = (text: unknown, day: number): string | null => {
  if (typeof text !== "string") return null;
  const pattern = new RegExp(
    "Day\\s*" + day + "\\s*:\\s*refinery output\\s*([\\d.]+)%\\s*,\\s*price change\\s*([+-]?[\\d.]+)%\\s*,\\s*GDP impact\\s*([+-]?[\\d.]+)%",
    "i"
  );
  const match = text.match(pattern);
  if (!match) return null;
  return `Day ${day}: refinery output is ${match[1]}%, price change is ${match[2]}%, and GDP impact is ${match[3]}%.`;
};

const findSroaDayInText = (text: unknown, day: number): string | null => {
  if (typeof text !== "string") return null;
  const pattern = new RegExp(
    "Day\\s*" + day + "\\s*:\\s*release\\s*([^,]+),\\s*forecast gap\\s*([^,]+),\\s*unfulfilled\\s*([^,]+),\\s*reserve after\\s*([^\\n]+)",
    "i"
  );
  const match = text.match(pattern);
  if (!match) return null;
  return `Day ${day}: release ${match[1]}, unfulfilled gap ${match[3]}, reserve after ${match[4]}.`;
};

const fallbackAgentQuestionAnswer = (agent: AgentQuestionTarget, question: string, context: any): string => {
  const agentOutput = context?.agent_output ?? context?.snapshot ?? context?.workflow?.[agent] ?? context;
  if (!agentOutput) {
    return `${agent.toUpperCase()} output is not available yet.`;
  }

  const day = dayFromQuestion(question);

  if (agent === "dsm") {
    const timeline = Array.isArray(agentOutput.impact_timeline) ? agentOutput.impact_timeline : [];
    const assumptions = agentOutput.assumptions ?? {};
    if (day) {
      const row = findDayRow(timeline, day);
      const previous = findDayRow(timeline, day - 1);
      const next = findDayRow(timeline, day + 1);
      const textAnswer = findDsmDayInText(context?.formatted_output, day);
      if (row) {
        return [
          `Day ${day} in DSM`,
          "",
          `On day ${day}, DSM projects refinery output at ${formatNumber(row.refinery_output_pct)}%, fuel price change at ${formatNumber(row.price_change_pct)}%, and GDP impact at ${formatNumber(row.gdp_impact_pct)}%.`,
          previous
            ? `Compared with day ${day - 1}, refinery output moves from ${formatNumber(previous.refinery_output_pct)}% to ${formatNumber(row.refinery_output_pct)}%, while price pressure moves from ${formatNumber(previous.price_change_pct)}% to ${formatNumber(row.price_change_pct)}%.`
            : "",
          next
            ? `The next simulated day shows refinery output at ${formatNumber(next.refinery_output_pct)}% and price pressure at ${formatNumber(next.price_change_pct)}%, so this day sits inside the active disruption curve rather than being an isolated value.`
            : "",
          `Operational meaning: supply is constrained by the ${formatNumber(agentOutput.capacity_loss_pct, 0)}% capacity disruption over ${agentOutput.duration_days ?? "n/a"} days, so lower refinery output and higher fuel prices should be treated as linked effects.`,
          `Key assumptions behind this row: import dependency ${formatNumber(assumptions.importDependencyPct)}%, affected import share ${formatNumber(assumptions.affectedImportSharePct)}%, substitution ramp ${formatNumber(assumptions.substitutionRampPctPerDay)}% per day, max substitution ${formatNumber(assumptions.maxSubstitutionPct)}%, and reserve cushion ${formatNumber(assumptions.reserveCushionDays)} days.`,
          "Use this as a scenario estimate, not a live forecast. The output depends on the disruption severity, duration, substitution capacity, and reserve cushion used in the DSM run.",
        ].filter(Boolean).join("\n");
      }
      return textAnswer
        ? [
            `Day ${day} in DSM`,
            "",
            textAnswer,
            "This row was recovered from the formatted DSM output. The structured timeline was not available in the context payload, so no adjacent-day comparison can be made.",
          ].join("\n")
        : `DSM does not show Day ${day} in this output. Ask about a day that exists inside the displayed impact timeline.`;
    }
    if (/price/i.test(question)) {
      const peak = timeline.reduce(
        (best: any, row: any) => (Number(row?.price_change_pct) > Number(best?.price_change_pct ?? -Infinity) ? row : best),
        null
      );
      return [
        "DSM Price Impact",
        "",
        peak
          ? `The highest price pressure in the DSM timeline appears on day ${peak.day}, with fuel price change at ${formatNumber(peak.price_change_pct)}%.`
          : `Peak price change is ${formatNumber(agentOutput.summary_metrics?.peak_price_change_pct ?? agentOutput.peak_fuel_price_change_pct)}%.`,
        `This is driven by the modelled ${formatNumber(agentOutput.capacity_loss_pct, 0)}% capacity disruption and the assumption that substitution can only ramp at ${formatNumber(assumptions.substitutionRampPctPerDay)}% per day up to ${formatNumber(assumptions.maxSubstitutionPct)}%.`,
        "The practical reading is that price stress grows while replacement supply is still catching up, then eases only if substitution and reserves absorb enough of the gap.",
      ].join("\n");
    }
    if (/output|refinery/i.test(question)) {
      const lowest = timeline.reduce(
        (best: any, row: any) => (Number(row?.refinery_output_pct) < Number(best?.refinery_output_pct ?? Infinity) ? row : best),
        null
      );
      return [
        "DSM Refinery Output",
        "",
        lowest
          ? `The lowest refinery output in the DSM timeline appears on day ${lowest.day}, at ${formatNumber(lowest.refinery_output_pct)}%.`
          : `Lowest refinery output is ${formatNumber(agentOutput.summary_metrics?.lowest_refinery_output_pct ?? agentOutput.lowest_refinery_output_pct)}%.`,
        `The output drop follows the ${formatNumber(agentOutput.capacity_loss_pct, 0)}% corridor capacity loss, adjusted by substitution ramp, max substitution, import dependency, and reserve cushion assumptions.`,
        "Operationally, this is the point where downstream supply stress is strongest and where reserve release or alternate procurement decisions matter most.",
      ].join("\n");
    }
    return [
      "DSM Scenario Explanation",
      "",
      `DSM models ${agentOutput.capacity_loss_pct ?? "n/a"}% capacity loss for ${agentOutput.duration_days ?? "n/a"} days on ${agentOutput.corridor ?? "the selected corridor"}.`,
      agentOutput.summary ?? "No DSM summary is available in the current output.",
      `The timeline contains ${timeline.length} day rows. It should be read as a scenario-impact curve covering refinery output, fuel-price pressure, and GDP impact under the selected assumptions.`,
    ].join("\n");
  }

  if (agent === "sroa") {
    const schedule = Array.isArray(agentOutput.drawdown_schedule) ? agentOutput.drawdown_schedule : [];
    if (day) {
      const row = findDayRow(schedule, day);
      const previous = findDayRow(schedule, day - 1);
      const textAnswer = findSroaDayInText(context?.formatted_output, day);
      if (row) {
        return [
          `Day ${day} in SROA`,
          "",
          `On day ${day}, SROA schedules a reserve release of ${formatBarrels(row.release_volume)} against a forecast gap of ${formatBarrels(row.forecast_gap_volume)}.`,
          `After that release, the unfulfilled gap is ${formatBarrels(row.unfulfilled_volume)} and reserve cover is ${formatNumber(row.reserve_after_plan_days)} days.`,
          previous
            ? `Compared with day ${day - 1}, reserve cover moves from ${formatNumber(previous.reserve_after_plan_days)} days to ${formatNumber(row.reserve_after_plan_days)} days.`
            : "",
          `Policy context: this run uses a ${agentOutput.policy ?? "n/a"} reserve policy and leaves ${formatNumber(agentOutput.reserve_after_plan_days)} reserve days after the full plan.`,
          agentOutput.safety_threshold_breached
            ? "Safety reading: the threshold is under stress, so procurement support or demand-side action should be considered alongside reserve release."
            : "Safety reading: the reserve floor remains protected in this run, but the remaining gap should still be checked against APO procurement options.",
        ].filter(Boolean).join("\n");
      }
      return textAnswer
        ? [`Day ${day} in SROA`, "", textAnswer, "This row was recovered from the formatted SROA output. The structured schedule was not available in the context payload."].join("\n")
        : `SROA does not show Day ${day} in this output. Ask about a day that exists inside the drawdown schedule.`;
    }
    if (/safe|threshold/i.test(question)) {
      return [
        "SROA Safety Threshold",
        "",
        agentOutput.safety_threshold_breached ? "The safety threshold is breached or under stress in this output." : "The safety threshold is protected in this output.",
        `Total planned release is ${formatBarrels(agentOutput.total_released_volume)}, leaving ${formatNumber(agentOutput.reserve_after_plan_days)} reserve days.`,
        `The safety floor volume is ${formatBarrels(agentOutput.safety_floor_volume)}. If the remaining supply gap persists, reserve action should be paired with APO procurement alternatives.`,
      ].join("\n");
    }
    return [
      "SROA Reserve Plan",
      "",
      `SROA uses a ${agentOutput.policy ?? "n/a"} policy, releases ${formatBarrels(agentOutput.total_released_volume)}, and leaves ${formatNumber(agentOutput.reserve_after_plan_days)} reserve days.`,
      agentOutput.summary ?? "No SROA summary is available in this output.",
      `The schedule contains ${schedule.length} day rows showing forecast gap, release volume, unfulfilled volume, and reserve cover after each release.`,
    ].join("\n");
  }

  if (agent === "apo") {
    const options = Array.isArray(agentOutput.ranked_options) ? agentOutput.ranked_options : [];
    const rank = rankFromQuestion(question) ?? 1;
    const option = options[rank - 1];
    return option
      ? [
          `APO Rank ${rank}`,
          "",
          `${option.supplier_name} is ranked ${rank} and routes via ${option.via}.`,
          `It can cover ${formatBarrels(option.volume_offered)} at $${formatNumber(option.landed_cost_per_barrel)}/bbl, with ${option.transit_days ?? "n/a"} days transit and route risk ${formatNumber(option.route_risk_score, 0)}/100.`,
          `Crude grade: ${option.crude_grade ?? "n/a"}. Region: ${option.region ?? "n/a"}. Composite score: ${formatNumber(option.composite_score, 3)}.`,
          option.explanation ? `Why it ranks here: ${option.explanation}` : "",
          "Read this as a procurement option, not an automatic order. The operator should still verify commercial availability, refinery compatibility, insurance, sanctions exposure, and port congestion.",
        ].filter(Boolean).join("\n")
      : `APO does not show rank ${rank} in this output.`;
  }

  const metrics = agentOutput.metrics ?? agentOutput;
  if (/price/i.test(question)) return [`TFM Price Snapshot`, "", `Current crude price is ${metrics.current_price_usd_per_barrel ?? "n/a"} USD/bbl.`, `Month-to-date average is ${metrics.month_to_date_avg_usd ?? "n/a"} USD/bbl.`, "Use this as a live market context point for DSM, SROA, and APO decisions."].join("\n");
  if (/reserve/i.test(question)) return [`TFM Reserve Snapshot`, "", `Current reserve cover is ${metrics.current_reserve_days ?? "n/a"} days.`, `Commercial stock is ${metrics.commercial_stock_days ?? "n/a"} days and total oil availability is ${metrics.total_oil_availability_days ?? "n/a"} days.`, "This tells the operator how much buffer exists before reserve policy or procurement action becomes urgent."].join("\n");
  if (/import/i.test(question)) return [`TFM Import Snapshot`, "", `Current imports are ${metrics.total_import_volume_bpd ?? metrics.recent_import_volume ?? "n/a"} BPD.`, `Import dependency is ${metrics.import_dependency_pct ?? "n/a"}%.`, "Higher import dependency means corridor disruption has a stronger downstream impact on supply resilience."].join("\n");
  return [`TFM Snapshot`, "", `TFM shows price ${metrics.current_price_usd_per_barrel ?? "n/a"} USD/bbl, reserves ${metrics.current_reserve_days ?? "n/a"} days, and import dependency ${metrics.import_dependency_pct ?? "n/a"}%.`, "Ask about price, reserves, imports, supplier mix, or corridor exposure for a more specific breakdown."].join("\n");
};

export const answerAgentOutputQuestion = async (
  agent: AgentQuestionTarget,
  question: string,
  context: any
): Promise<{ agent: AgentQuestionTarget; answer: string; usedGemini: boolean; generatedAt: string }> => {
  const fallback = fallbackAgentQuestionAnswer(agent, question, context);
  const text = await callGroq(
    JSON.stringify(
      {
        agent,
        user_question: question,
        deterministic_context_answer: fallback,
        provided_context: context,
      },
      null,
      2
    ).slice(0, 32000),
    [
      "You answer operator questions about one selected Sentrix agent output.",
      "Use ONLY the provided context. Do not run new calculations, invent missing data, or use outside knowledge.",
      "Give a detailed, operator-useful answer with clear headings and short bullets or short paragraphs.",
      "Aim for 180-350 words when the context supports it.",
      "Use the agent's exact numbers, dates, days, ranks, route names, prices, volumes, reserve days, and assumptions when relevant.",
      "Explain what the number means operationally, why it matters, and what the operator should check next.",
      "If deterministic_context_answer directly answers the question, use it as the source of truth and only simplify wording if needed.",
      "If the user asks about a specific day, find that exact day row in the provided timeline/schedule and answer using those values.",
      "If the user asks about a rank/option, find that exact ranked option and answer using those values.",
      "Do not answer with the overall summary when a specific day, rank, price, reserve, gap, output, supplier, or route is requested.",
      "If the exact value is not in the context, say: This output does not show that clearly.",
    ].join(" "),
    1100
  );

  return {
    agent,
    answer: text?.trim() || fallback,
    usedGemini: Boolean(text?.trim()),
    generatedAt: new Date().toISOString(),
  };
};

