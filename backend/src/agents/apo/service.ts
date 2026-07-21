import { runSroaOptimization } from "../sroa/service";
import { SroaOutput, SroaRemainingGapDay } from "../sroa/types";
import { normalizeApoWeights, routeRiskScoreFromEvents, scoreCandidate, summarizeGap } from "./engine";
import { explainApoRanking } from "./llm";
import { getApoLivePrice, getApoSuppliers, getRouteRiskEvents, logApoRun } from "./repository";
import { ApoCandidateScore, ApoInput, ApoOutput } from "./types";

const DEFAULT_TARGET_REFINERIES = ["jamnagar", "vadinar", "mangalore", "panipat", "paradip", "mathura", "koch"];

type SupplierRecord = Awaited<ReturnType<typeof getApoSuppliers>>[number];
type RouteRecord = SupplierRecord["route_options"][number];

const WEST_INDIA_TERMINAL: [number, number] = [72.85, 18.95];

const APO_ROUTE_COORDINATES: Record<string, [number, number][]> = {
  "fujairah-arabian-sea": [[56.35, 25.12], [57.2, 24.7], [59.5, 23.4], [63.8, 21.4], [68.8, 19.6], WEST_INDIA_TERMINAL],
  "jebel-ali-hormuz": [[55.05, 25.02], [54.2, 25.35], [53.2, 25.85], [54.9, 26.2], [56.45, 26.45], [61.5, 23.6], [67.4, 20.6], WEST_INDIA_TERMINAL],
  "ras-tanura-hormuz-west-india": [[50.12, 26.65], [51.3, 26.85], [53.2, 26.55], [55.2, 26.45], [56.45, 26.45], [62.4, 23.4], [68.6, 20.1], WEST_INDIA_TERMINAL],
  "basrah-hormuz-india": [[48.7, 29.5], [49.5, 28.5], [51.6, 27.2], [54.5, 26.55], [56.45, 26.45], [63.5, 22.8], WEST_INDIA_TERMINAL],
  "vladivostok-malacca-india": [[131.9, 43.1], [126.5, 35.0], [119.0, 22.0], [104.0, 1.25], [95.0, 5.0], [84.0, 11.0], WEST_INDIA_TERMINAL],
  "kozmino-pacific-india": [[133.05, 42.65], [126.0, 34.0], [118.5, 19.5], [104.0, 1.25], [96.0, 5.2], [84.0, 11.0], WEST_INDIA_TERMINAL],
  "red-sea-cape-reroute": [[38.2, 24.1], [42.6, 12.5], [44.0, 0.0], [38.0, -16.0], [25.0, -31.0], [18.3, -34.4], [36.0, -25.0], [55.0, -6.0], WEST_INDIA_TERMINAL],
  "us-gulf-cape-india": [[-90.0, 29.0], [-75.0, 20.0], [-35.0, 0.0], [5.0, -31.0], [18.3, -34.4], [39.0, -22.0], [58.0, -4.0], WEST_INDIA_TERMINAL],
  "bonny-cape-india": [[7.2, 4.4], [5.0, -6.0], [10.0, -21.0], [18.3, -34.4], [39.0, -22.0], [58.0, -4.0], WEST_INDIA_TERMINAL],
  "santos-cape-india": [[-46.3, -24.0], [-30.0, -30.0], [2.0, -35.0], [18.3, -34.4], [39.0, -22.0], [58.0, -4.0], WEST_INDIA_TERMINAL],
};

const pointInPolygon = (point: [number, number], polygon: number[][]): boolean => {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

const orientation = (a: [number, number], b: [number, number], c: [number, number]) =>
  (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);

const isOnSegment = (a: [number, number], b: [number, number], c: [number, number]) =>
  b[0] <= Math.max(a[0], c[0]) && b[0] >= Math.min(a[0], c[0]) && b[1] <= Math.max(a[1], c[1]) && b[1] >= Math.min(a[1], c[1]);

const segmentsIntersect = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) => {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  const eps = 1e-9;
  if (Math.abs(o1) < eps && isOnSegment(a, c, b)) return true;
  if (Math.abs(o2) < eps && isOnSegment(a, d, b)) return true;
  if (Math.abs(o3) < eps && isOnSegment(c, a, d)) return true;
  if (Math.abs(o4) < eps && isOnSegment(c, b, d)) return true;
  return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0);
};

const routeIntersectsPolygon = (routeId: string, polygon?: number[][]): boolean => {
  if (!polygon || polygon.length < 3) return false;
  const coordinates = APO_ROUTE_COORDINATES[routeId];
  if (!coordinates || coordinates.length < 2) return false;
  if (coordinates.some((point) => pointInPolygon(point, polygon))) return true;
  const edges = polygon.map((point, index) => [point, polygon[(index + 1) % polygon.length]] as [[number, number], [number, number]]);
  for (let i = 0; i < coordinates.length - 1; i += 1) {
    const start = coordinates[i];
    const end = coordinates[i + 1];
    if (edges.some(([edgeStart, edgeEnd]) => segmentsIntersect(start, end, edgeStart, edgeEnd))) return true;
  }
  return false;
};

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
      if (routeIntersectsPolygon(route.route_id, input.disrupted_zone_polygon)) {
        continue;
      }
      const query = [corridor, supplier.region, supplier.crude_grade, route.via, ...(route.risk_query_terms ?? [])].join(" ");
      const events = await getRouteRiskEvents(query, 5);
      const routeRiskScore = routeRiskScoreFromEvents(events);
      const landedCost = price.price_per_barrel * (1 + route.port_congestion_factor);
      candidateInputs.push({ supplier, route, price, events, routeRiskScore, landedCost });
    }
  }

  const cheapestPrice = candidateInputs.length > 0 ? Math.min(...candidateInputs.map((candidate) => candidate.landedCost), 1) : 1;
  const fastestTransitDays = candidateInputs.length > 0 ? Math.min(...candidateInputs.map((candidate) => candidate.route.transit_days), 1) : 1;
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
    llm_used: reasoning.used_llm,
    llm_provider: reasoning.provider,
    llm_summary: reasoning.summary,
    formatted_recommendation: reasoning.formatted_recommendation,
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
    llm_provider: process.env.APO_LLM_PROVIDER ?? (process.env.GEMINI_API_KEY ? "gemini" : "huggingface"),
  };
};
