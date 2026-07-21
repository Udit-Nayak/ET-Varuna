import { runApoRecommendation } from "../apo/service";
import { ApoOutput } from "../apo/types";
import { runDsmSimulation } from "../dsm/service";
import { DsmSimulationOutput } from "../dsm/types";
import { queryVectorKnowledge } from "../gria/service";
import { runSroaOptimization } from "../sroa/service";
import { SroaOutput, SroaPolicy } from "../sroa/types";

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
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

const extractGroqText = (payload: any): string =>
  String(payload?.choices?.[0]?.message?.content ?? "").trim();

const callGroq = async (prompt: string, systemInstruction: string, maxOutputTokens = 1400): Promise<string | null> => {
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
        model: GROQ_MODEL,
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
