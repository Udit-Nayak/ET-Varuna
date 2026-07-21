const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface AgentChatAnswer {
  final: string;
  generatedAt: string;
  usedGroq: boolean;
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


const directAnswerFromGroq = async (question: string): Promise<string | null> =>
  callGroq(
    question,
    [
      "You are a direct answer assistant.",
      "Answer the user's question plainly and briefly.",
      "Do not mention internal agents, analysis pipelines, JSON, or hidden reasoning.",
      "If the user asks for a definition or state, provide the plain-language meaning in one short paragraph.",
    ].join(" "),
    500
  );

export const answerAgentChat = async (question: string): Promise<AgentChatAnswer> => {
  const final = (await directAnswerFromGroq(question)) ?? "I could not generate an answer right now.";

  return {
    final,
    generatedAt: new Date().toISOString(),
    usedGroq: true,
  };
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
      "You format raw agent output for the Aegis SCR dashboard.",
      "Use Gemini only for formatting and explanation; do not recalculate, reorder, invent, or alter values.",
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
