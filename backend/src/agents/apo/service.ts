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
  "fujairah-arabian-sea": [[56.35, 25.12], [57.8, 24.6], [60.8, 23.2], [64.8, 21.0], [69.3, 19.4], WEST_INDIA_TERMINAL],
  "jebel-ali-hormuz": [[55.05, 25.02], [54.2, 25.35], [53.2, 25.85], [54.9, 26.2], [56.45, 26.45], [61.5, 23.6], [67.4, 20.6], WEST_INDIA_TERMINAL],
  "ras-tanura-hormuz-west-india": [[50.12, 26.65], [51.3, 26.85], [53.2, 26.55], [55.2, 26.45], [56.45, 26.45], [62.4, 23.4], [68.6, 20.1], WEST_INDIA_TERMINAL],
  "basrah-hormuz-india": [[48.7, 29.5], [49.5, 28.5], [51.6, 27.2], [54.5, 26.55], [56.45, 26.45], [63.5, 22.8], WEST_INDIA_TERMINAL],
  "vladivostok-malacca-india": [[131.9, 43.1], [130.0, 36.0], [124.0, 27.0], [119.0, 20.0], [111.0, 8.0], [104.2, 1.15], [102.2, 2.2], [100.7, 3.8], [99.4, 5.2], [96.2, 6.1], [90.0, 7.0], [84.0, 6.7], [80.8, 6.2], [78.5, 5.0], [76.5, 6.0], [74.8, 9.0], [73.4, 13.2], WEST_INDIA_TERMINAL],
  "kozmino-pacific-india": [[133.05, 42.65], [130.0, 35.0], [123.5, 25.5], [118.0, 18.5], [111.0, 8.0], [104.2, 1.15], [102.2, 2.2], [100.7, 3.8], [99.4, 5.2], [96.2, 6.1], [90.0, 7.0], [84.0, 6.7], [80.8, 6.2], [78.5, 5.0], [76.5, 6.0], [74.8, 9.0], [73.4, 13.2], WEST_INDIA_TERMINAL],
  "red-sea-cape-reroute": [[38.2, 24.1], [39.6, 18.0], [42.6, 12.5], [43.2, 5.0], [41.0, -6.0], [34.0, -18.0], [25.0, -31.0], [18.3, -34.4], [35.0, -27.0], [50.0, -12.0], [63.0, 2.0], WEST_INDIA_TERMINAL],
  "us-gulf-cape-india": [[-90.0, 29.0], [-82.0, 23.5], [-60.0, 10.0], [-35.0, -5.0], [-10.0, -25.0], [18.3, -34.4], [39.0, -22.0], [58.0, -4.0], WEST_INDIA_TERMINAL],
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

const bufferedBoundingPolygon = (polygon?: number[][], bufferDegrees = 0.65): number[][] | undefined => {
  if (!polygon || polygon.length < 3) return undefined;
  const lngs = polygon.map(([lng]) => lng);
  const lats = polygon.map(([, lat]) => lat);
  const minLng = Math.min(...lngs) - bufferDegrees;
  const maxLng = Math.max(...lngs) + bufferDegrees;
  const minLat = Math.min(...lats) - bufferDegrees;
  const maxLat = Math.max(...lats) + bufferDegrees;
  return [[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat]];
};

const blockedChokepointsFromContext = (corridor: string, polygon?: number[][]): string[] => {
  const lower = corridor.toLowerCase();
  const center = polygon && polygon.length > 0
    ? polygon.reduce(([lng, lat], point) => [lng + point[0], lat + point[1]], [0, 0]).map((value) => value / polygon.length)
    : null;
  const blocked = new Set<string>();
  if (/hormuz|persian gulf/.test(lower)) blocked.add("hormuz");
  if (/red sea|bab/.test(lower)) blocked.add("red sea").add("bab-el-mandeb");
  if (/suez/.test(lower)) blocked.add("suez");
  if (/malacca/.test(lower)) blocked.add("malacca");
  if (/panama/.test(lower)) blocked.add("panama");
  if (/gibraltar/.test(lower)) blocked.add("gibraltar");
  if (/bosphorus|black sea/.test(lower)) blocked.add("bosphorus");
  if (/south china/.test(lower)) blocked.add("south china sea");
  if (center) {
    const [lng, lat] = center;
    if (lng >= 54.5 && lng <= 58.5 && lat >= 24.0 && lat <= 28.5) blocked.add("hormuz");
    if (lng >= 48 && lng <= 56 && lat >= 24 && lat <= 30) blocked.add("hormuz");
    if (lng >= 42 && lng <= 45 && lat >= 11 && lat <= 14) blocked.add("bab-el-mandeb").add("red sea");
    if (lng >= 99 && lng <= 105 && lat >= 1 && lat <= 6) blocked.add("malacca");
    if (lng >= 108 && lng <= 121 && lat >= 6 && lat <= 20) blocked.add("south china sea");
  }
  return Array.from(blocked);
};

const routeText = (supplier: SupplierRecord, route: RouteRecord): string =>
  [route.route_id, route.via, supplier.region, supplier.supplier_name, supplier.crude_grade, ...(route.risk_query_terms ?? [])].join(" ").toLowerCase();

const routeUsesBlockedChokepoint = (supplier: SupplierRecord, route: RouteRecord, blockedChokepoints: string[]): string | null => {
  const text = routeText(supplier, route);
  const hit = blockedChokepoints.find((term) => text.includes(term));
  return hit ? `uses blocked chokepoint: ${hit}` : null;
};

const relevantRouteTerms = (supplier: SupplierRecord, route: RouteRecord): string[] =>
  [supplier.region, supplier.supplier_name, supplier.crude_grade, route.via, route.route_id, ...(route.risk_query_terms ?? [])]
    .flatMap((value) => String(value).toLowerCase().split(/[^a-z0-9]+/))
    .filter((term) => term.length >= 4 && !["route", "india", "west", "coast", "crude", "blend", "medium", "light", "tanker", "shipping"].includes(term));

const disqualifyingEvent = (supplier: SupplierRecord, route: RouteRecord, events: Awaited<ReturnType<typeof getRouteRiskEvents>>): string | null => {
  const criticalPattern = /war|armed conflict|missile|attack|blockade|closure|closed|sanction|sanctions|default|debt crisis|financial crisis|coup|civil unrest|embargo|foreign affairs|diplomatic crisis/i;
  const terms = relevantRouteTerms(supplier, route);
  const event = events.find((item) => {
    const text = `${item.headline} ${item.summary ?? ""} ${item.severity ?? ""}`.toLowerCase();
    const severity = String(item.severity ?? "").toLowerCase();
    const routeRelevant = terms.some((term) => text.includes(term));
    return routeRelevant && (item.riskScore >= 88 || severity === "critical" || (item.riskScore >= 72 && criticalPattern.test(text)));
  });
  return event ? `excluded by route-specific GRIA risk: ${event.headline}` : null;
};

const routeFeasibilityNotes = (
  supplier: SupplierRecord,
  route: RouteRecord,
  corridor: string,
  polygon?: number[][],
  events: Awaited<ReturnType<typeof getRouteRiskEvents>> = []
): { feasible: boolean; notes: string[] } => {
  const notes: string[] = [];
  const geometry = APO_ROUTE_COORDINATES[route.route_id];
  if (!geometry || geometry.length < 2) notes.push("missing vetted sea-route geometry");
  const blockedChokepoint = routeUsesBlockedChokepoint(supplier, route, blockedChokepointsFromContext(corridor, polygon));
  if (blockedChokepoint) notes.push(blockedChokepoint);
  if (routeIntersectsPolygon(route.route_id, polygon) || routeIntersectsPolygon(route.route_id, bufferedBoundingPolygon(polygon))) {
    notes.push("route crosses active disruption zone");
  }
  const riskNote = disqualifyingEvent(supplier, route, events);
  if (riskNote) notes.push(riskNote);
  return { feasible: notes.length === 0, notes };
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
    routeFeasibilityNotes: string[];
  }> = [];
  const excludedRouteNotes: string[] = [];

  for (const supplier of suppliers) {
    const price = await getApoLivePrice(supplier.crude_grade, supplier.region);
    for (const route of supplier.route_options) {
      const query = [supplier.region, supplier.crude_grade, route.via, ...(route.risk_query_terms ?? []), "route safety war sanctions financial crisis port disruption"].join(" ");
      const events = await getRouteRiskEvents(query, 5);
      const feasibility = routeFeasibilityNotes(supplier, route, corridor, input.disrupted_zone_polygon, events);
      if (!feasibility.feasible) {
        excludedRouteNotes.push(`${supplier.supplier_name} via ${route.via}: ${feasibility.notes.join("; ")}`);
        continue;
      }
      const routeRiskScore = routeRiskScoreFromEvents(events);
      if (routeRiskScore >= 82) {
        excludedRouteNotes.push(`${supplier.supplier_name} via ${route.via}: route risk ${routeRiskScore}/100 exceeds feasibility limit`);
        continue;
      }
      const landedCost = price.price_per_barrel * (1 + route.port_congestion_factor);
      candidateInputs.push({ supplier, route, price, events, routeRiskScore, landedCost, routeFeasibilityNotes: ["vetted sea route", "does not cross active disruption zone"] });
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
  const rankedWithExplanations: ApoCandidateScore[] = ranked.map((candidate) => {
    const source = candidateInputs.find((inputCandidate) => inputCandidate.supplier.supplier_id === candidate.supplier_id && inputCandidate.route.route_id === candidate.route_id);
    return {
      ...candidate,
      route_geometry: APO_ROUTE_COORDINATES[candidate.route_id],
      route_feasibility_notes: source?.routeFeasibilityNotes ?? [],
      explanation: reasoning.explanations[`${candidate.supplier_id}:${candidate.route_id}`] ?? candidate.explanation,
    };
  });

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
    llm_flags: [...excludedRouteNotes.slice(0, 8), ...reasoning.flags],
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
