import { runSroaOptimization } from "../sroa/service";
import { SroaOutput, SroaRemainingGapDay } from "../sroa/types";
import { normalizeApoWeights, routeRiskScoreFromEvents, scoreCandidate, summarizeGap } from "./engine";
import { explainApoRanking } from "./llm";
import { getApoLivePrice, getApoSuppliers, getRouteRiskEvents, logApoRun } from "./repository";
import { ApoCandidateScore, ApoInput, ApoOutput } from "./types";

const DEFAULT_TARGET_REFINERIES = ["jamnagar", "vadinar", "mangalore", "panipat", "paradip", "mathura", "koch"];

type SupplierRecord = Awaited<ReturnType<typeof getApoSuppliers>>[number];
type RouteRecord = SupplierRecord["route_options"][number];

const resolveSroaOutput = async (input: ApoInput): Promise<SroaOutput | null> => {
  if (input.sroa_output) return input.sroa_output;
  if (input.remaining_supply_gap) return null;
  return runSroaOptimization({
    corridor: input.corridor ?? "general maritime corridor",
    dsm_output: input.dsm_output,
    scenario_text: `APO requested SROA residual gap for ${input.corridor ?? "general maritime corridor"}`,
  });
};

const resolveRemainingGap = (input: ApoInput, sroa: SroaOutput | null): SroaRemainingGapDay[] => {
  if (input.remaining_supply_gap) return input.remaining_supply_gap;
  return sroa?.remaining_supply_gap ?? [];
};

const disruptionDuration = (input: ApoInput, sroa: SroaOutput | null, gap: SroaRemainingGapDay[]): number => {
  if (input.dsm_output?.duration_days) return input.dsm_output.duration_days;
  if (input.dsm_context?.duration_days) return input.dsm_context.duration_days;
  if (sroa?.drawdown_schedule?.length) return sroa.drawdown_schedule.length;
  return Math.max(1, gap.reduce((max, day) => Math.max(max, day.day), 0) || 21);
};

export const runApoRecommendation = async (input: ApoInput): Promise<ApoOutput> => {
  const sroa = await resolveSroaOutput(input);
  const remainingGap = resolveRemainingGap(input, sroa);
  const gapSummary = summarizeGap(remainingGap);
  const durationDays = disruptionDuration(input, sroa, remainingGap);
  const totalVolumeNeeded = gapSummary.totalVolumeNeeded;
  const corridor = input.corridor ?? sroa?.corridor ?? input.dsm_output?.corridor ?? "general maritime corridor";
  const weights = normalizeApoWeights(input.weights);
  const suppliers = await getApoSuppliers();
  const targetRefineries = (input.target_refineries ?? DEFAULT_TARGET_REFINERIES).map((value) => value.toLowerCase());

  const candidateInputs: Array<{
    supplier: SupplierRecord;
    route: RouteRecord;
    price: Awaited<ReturnType<typeof getApoLivePrice>>;
    events: Awaited<ReturnType<typeof getRouteRiskEvents>>;
    routeRiskScore: number;
    landedCost: number;
  }> = [];

  for (const supplier of suppliers) {
    const price = await getApoLivePrice(supplier.crude_grade, supplier.region);
    for (const route of supplier.route_options) {
      const query = [corridor, supplier.region, supplier.crude_grade, route.via, ...(route.risk_query_terms ?? [])].join(" ");
      const events = await getRouteRiskEvents(query, 5);
      const routeRiskScore = routeRiskScoreFromEvents(events);
      const landedCost = price.price_per_barrel * (1 + route.port_congestion_factor);
      candidateInputs.push({ supplier, route, price, events, routeRiskScore, landedCost });
    }
  }

  const cheapestPrice = Math.min(...candidateInputs.map((candidate) => candidate.landedCost), 1);
  const fastestTransitDays = Math.min(...candidateInputs.map((candidate) => candidate.route.transit_days), 1);
  const candidates = candidateInputs
    .map((candidate) => scoreCandidate({
      supplier: candidate.supplier,
      route: candidate.route,
      price: candidate.price,
      routeRiskScore: candidate.routeRiskScore,
      supportingEvents: candidate.events,
      cheapestPrice,
      fastestTransitDays,
      totalVolumeNeeded: Math.max(totalVolumeNeeded, 1),
      disruptionDurationDays: durationDays,
      targetRefineries,
      weights,
    }))
    .sort((left, right) => right.composite_score - left.composite_score);

  const maxOptions = Math.max(1, Math.min(10, Number(input.max_options ?? 5)));
  const ranked = candidates.slice(0, maxOptions);
  const reasoning = await explainApoRanking(input, ranked);
  const rankedWithExplanations: ApoCandidateScore[] = ranked.map((candidate) => ({
    ...candidate,
    explanation: reasoning.explanations[`${candidate.supplier_id}:${candidate.route_id}`] ?? candidate.explanation,
  }));

  const priceAsOf = candidateInputs.map((candidate) => candidate.price.timestamp).filter(Boolean).sort().at(-1);

  const output: ApoOutput = {
    corridor,
    based_on_sroa_gap: true,
    total_volume_needed: totalVolumeNeeded,
    urgency: {
      ...gapSummary,
      disruption_duration_days: durationDays,
    },
    scoring_weights: weights,
    price_as_of: priceAsOf,
    ranked_options: rankedWithExplanations,
    llm_flags: reasoning.flags,
    generated_at: new Date().toISOString(),
  };

  await logApoRun(input, candidates, output);
  return output;
};

export const getApoStatus = async () => {
  const suppliers = await getApoSuppliers();
  return {
    supplier_count: suppliers.length,
    route_count: suppliers.reduce((sum, supplier) => sum + supplier.route_options.length, 0),
    default_weights: normalizeApoWeights(),
    llm_enabled: process.env.APO_LLM_ENABLED !== "false",
  };
};
