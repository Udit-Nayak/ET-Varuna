import mongoose from "mongoose";
import { LivePriceSnapshot, NationalStateSnapshot, SroaOperationalData } from "./types";

const NATIONAL_STATE_COLLECTION = "nationalStateHistory";
const LIVE_PRICE_COLLECTION = "livePriceSnapshot";

const asNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const objectIdString = (value: unknown): string => String(value ?? "");

const cleanMix = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, raw]) => raw !== null && raw !== undefined)
      .map(([key, raw]) => [key, asNumber(raw, NaN)] as const)
      .filter(([, raw]) => Number.isFinite(raw))
  );
};

const cleanCorridorSupply = (value: unknown): SroaOperationalData["corridor_supply"] => {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, Record<string, unknown>>).map(([key, raw]) => [
      key,
      {
        volume_bpd: raw?.volume_bpd === null || raw?.volume_bpd === undefined ? null : asNumber(raw.volume_bpd),
        share_pct: raw?.share_pct === null || raw?.share_pct === undefined ? null : asNumber(raw.share_pct),
      },
    ])
  );
};

const mapNationalState = (doc: Record<string, unknown>): NationalStateSnapshot => ({
  id: objectIdString(doc._id),
  month: String(doc.month ?? ""),
  total_consumption_bpd: asNumber(doc.total_consumption_bpd),
  domestic_production_bpd: asNumber(doc.domestic_production_bpd),
  total_import_volume_bpd: asNumber(doc.total_import_volume_bpd),
  import_dependency_pct: asNumber(doc.import_dependency_pct),
  reserve_capacity_days_full: asNumber(doc.reserve_capacity_days_full),
  reserve_fill_percentage: asNumber(doc.reserve_fill_percentage),
  reserve_remaining_days: asNumber(doc.reserve_remaining_days),
  commercial_stock_days: asNumber(doc.commercial_stock_days),
  total_oil_availability_days: asNumber(doc.total_oil_availability_days),
  current_price_usd_per_barrel: doc.current_price_usd_per_barrel === null ? null : asNumber(doc.current_price_usd_per_barrel, NaN),
  price_last_updated: doc.price_last_updated ? String(doc.price_last_updated) : null,
  basket_composition: cleanMix(doc.basket_composition),
  corridor_supply: cleanCorridorSupply(doc.corridor_supply),
  top_suppliers_pct: cleanMix(doc.top_suppliers_pct),
  data_as_of: doc.data_as_of ? String(doc.data_as_of) : undefined,
  note: doc.note ? String(doc.note) : undefined,
});

const mapLivePrice = (doc: Record<string, unknown>): LivePriceSnapshot => ({
  id: objectIdString(doc._id),
  current_price_usd_per_barrel: asNumber(doc.current_price_usd_per_barrel),
  month_to_date_avg_usd: asNumber(doc.month_to_date_avg_usd, NaN),
  basket_ratio_sour_pct: asNumber(doc.basket_ratio_sour_pct, NaN),
  basket_ratio_sweet_pct: asNumber(doc.basket_ratio_sweet_pct, NaN),
  fetched_at: doc.fetched_at ? String(doc.fetched_at) : undefined,
  ppac_last_updated: doc.ppac_last_updated ? String(doc.ppac_last_updated) : undefined,
  source: doc.source ? String(doc.source) : undefined,
});

export const getLatestOperationalData = async (): Promise<SroaOperationalData> => {
  if (mongoose.connection.readyState !== 1) {
    throw new Error("MongoDB is not connected; SROA requires nationalStateHistory/livePriceSnapshot data");
  }

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("MongoDB database handle is unavailable");
  }

  const nationalDoc = await db.collection(NATIONAL_STATE_COLLECTION).findOne({}, { sort: { month: -1, data_as_of: -1 } });
  if (!nationalDoc) {
    throw new Error("No nationalStateHistory document found for SROA operational data");
  }

  const priceDoc = await db.collection(LIVE_PRICE_COLLECTION).findOne({}, { sort: { fetched_at: -1, ppac_last_updated: -1 } });
  const national = mapNationalState(nationalDoc as Record<string, unknown>);
  const livePrice = priceDoc ? mapLivePrice(priceDoc as Record<string, unknown>) : null;

  const currentReserveDays = national.reserve_capacity_days_full * (national.reserve_fill_percentage / 100);
  const dailyConsumption = national.total_consumption_bpd;
  const reserveVolume = currentReserveDays * dailyConsumption;

  return {
    current_reserve_days: Number(currentReserveDays.toFixed(2)),
    current_reserve_volume: Math.round(reserveVolume),
    daily_consumption_rate: dailyConsumption,
    recent_import_volume: national.total_import_volume_bpd,
    recent_export_volume: Math.max(0, national.domestic_production_bpd + national.total_import_volume_bpd - national.total_consumption_bpd),
    current_price_usd_per_barrel: livePrice?.current_price_usd_per_barrel ?? national.current_price_usd_per_barrel ?? null,
    import_dependency_pct: national.import_dependency_pct,
    baseline_import_source_mix: national.top_suppliers_pct ?? {},
    corridor_supply: national.corridor_supply ?? {},
    commercial_stock_days: national.commercial_stock_days,
    total_oil_availability_days: national.total_oil_availability_days,
    data_as_of: national.data_as_of,
    sources: {
      national_state_history_id: national.id,
      live_price_snapshot_id: livePrice?.id,
      national_state_month: national.month,
      live_price_source: livePrice?.source,
    },
  };
};
