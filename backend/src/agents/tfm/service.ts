import { getLivePriceSnapshot } from "../shared/livePriceRepository";
import { getNationalState, getNationalStateHistory } from "../shared/nationalStateRepository";
import { aisStreamService } from "../../services/aisStreamService";

const asNumber = (value: unknown, fallback: number | null = null): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const freshness = (timestamp?: string | Date | null) => {
  if (!timestamp) return { label: "snapshot", age_seconds: null as number | null };
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return { label: String(timestamp), age_seconds: null as number | null };
  const ageSeconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (ageSeconds < 90) return { label: "live", age_seconds: ageSeconds };
  if (ageSeconds < 3600) return { label: `${Math.round(ageSeconds / 60)} min old`, age_seconds: ageSeconds };
  if (ageSeconds < 86400) return { label: `${Math.round(ageSeconds / 3600)} hr old`, age_seconds: ageSeconds };
  return { label: `${Math.round(ageSeconds / 86400)} days old`, age_seconds: ageSeconds };
};

const latestHistory = async () => {
  const history = await getNationalStateHistory();
  return [...history].sort((a, b) => String(b.month ?? b.data_as_of ?? "").localeCompare(String(a.month ?? a.data_as_of ?? "")))[0] ?? null;
};

export const getTfmLiveSnapshot = async () => {
  const [state, history, price] = await Promise.all([
    getNationalState().catch(() => null),
    latestHistory().catch(() => null),
    getLivePriceSnapshot().catch(() => null),
  ]);

  const base: any = state ?? history ?? {};
  const consumption = asNumber(base.total_consumption_bpd ?? base.daily_consumption_rate, 0) ?? 0;
  const production = asNumber(base.domestic_production_bpd, 0) ?? 0;
  const imports = asNumber(base.total_import_volume_bpd ?? base.recent_import_volume, 0) ?? 0;
  const exports = Math.max(0, production + imports - consumption);
  const reserveDays = asNumber(base.current_reserve_days) ?? ((asNumber(base.reserve_capacity_days_full, 0) ?? 0) * (asNumber(base.reserve_fill_percentage, 0) ?? 0)) / 100;
  const reserveVolume = asNumber(base.current_reserve_volume) ?? reserveDays * consumption;
  const ais = aisStreamService.getSnapshot();

  return {
    generated_at: new Date().toISOString(),
    mode: "live-dashboard",
    country: "India",
    sources: {
      price: {
        source: price?.source ?? "PPAC/livePriceSnapshot",
        endpoint: "/api/live-price",
        freshness: freshness(price?.fetched_at),
        ppac_last_updated: price?.ppac_last_updated ?? base.price_last_updated ?? null,
      },
      petroleum_state: {
        source: state ? "nationalPetroleumState" : "nationalStateHistory",
        endpoint: state ? "/api/national-state" : "/api/national-state/history",
        freshness: freshness((base as any).data_as_of ?? (base as any).month ?? null),
        data_as_of: (base as any).data_as_of ?? (base as any).month ?? null,
      },
      vessels: {
        source: ais.source,
        endpoint: "Socket.io vessels:update / AISStream",
        freshness: freshness(ais.last_update),
      },
    },
    metrics: {
      current_price_usd_per_barrel: price?.current_price_usd_per_barrel ?? base.current_price_usd_per_barrel ?? null,
      month_to_date_avg_usd: price?.month_to_date_avg_usd ?? null,
      total_consumption_bpd: consumption,
      domestic_production_bpd: production,
      total_import_volume_bpd: imports,
      estimated_export_or_surplus_bpd: exports,
      import_dependency_pct: asNumber(base.import_dependency_pct),
      reserve_capacity_days_full: asNumber(base.reserve_capacity_days_full),
      reserve_fill_percentage: asNumber(base.reserve_fill_percentage),
      current_reserve_days: Number(reserveDays.toFixed(2)),
      current_reserve_volume_bbl: Math.round(reserveVolume),
      commercial_stock_days: asNumber(base.commercial_stock_days),
      total_oil_availability_days: asNumber(base.total_oil_availability_days),
      basket_composition: base.basket_composition ?? {
        sour_pct: price?.basket_ratio_sour_pct ?? null,
        sweet_pct: price?.basket_ratio_sweet_pct ?? null,
      },
      top_suppliers_pct: base.top_suppliers_pct ?? {},
      corridor_supply: base.corridor_supply ?? {},
      ais_trade_vessels: ais.total,
      ais_tankers: ais.tankers,
      ais_live_vessels: ais.live,
      ais_simulated_vessels: ais.simulated,
    },
    caveats: [
      "TFM auto-refreshes live dashboard data, but some official India petroleum fields are published daily/monthly rather than second-by-second.",
      "AIS vessel exposure is the most real-time stream; national reserves/import mix depend on latest available MongoDB snapshots.",
    ],
    note: base.note ?? null,
  };
};
