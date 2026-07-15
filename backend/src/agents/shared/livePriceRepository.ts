import mongoose from "mongoose";
import { fetchLivePriceFromPPAC } from "./ppacScraper";

const COLLECTION_NAME = "livePriceSnapshot";

export interface LivePriceSnapshot {
  current_price_usd_per_barrel: number | null;
  month_to_date_avg_usd: number | null;
  basket_ratio_sweet_pct: number | null;
  basket_ratio_sour_pct: number | null;
  source: "PPAC";
  fetched_at: Date;
  ppac_last_updated: string | null;
}

const collection = () => {
  const database = mongoose.connection.db;
  if (!database) throw new Error("MongoDB is not connected");
  return database.collection(COLLECTION_NAME);
};

export async function updateLivePriceSnapshot(): Promise<LivePriceSnapshot> {
  const price = await fetchLivePriceFromPPAC();
  const snapshot: LivePriceSnapshot = {
    ...price,
    source: "PPAC",
    fetched_at: new Date(),
  };

  // An empty filter intentionally maintains this collection as one current
  // snapshot, distinct from the append-only nationalStateHistory collection.
  await collection().updateOne({}, { $set: snapshot }, { upsert: true });
  return snapshot;
}

export async function getLivePriceSnapshot(): Promise<LivePriceSnapshot | null> {
  const snapshot = await collection().findOne({});
  return (snapshot as unknown as LivePriceSnapshot | null) ?? null;
}
