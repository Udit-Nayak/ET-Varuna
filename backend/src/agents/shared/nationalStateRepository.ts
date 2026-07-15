import mongoose from "mongoose";

const COLLECTION_NAME = "nationalPetroleumState";
const HISTORY_COLLECTION_NAME = "nationalStateHistory";

export interface BasketComposition {
  sour_pct: number;
  sweet_pct: number;
}

export interface CorridorSupply {
  volume_bpd: number;
  share_pct: number;
}

export interface NationalState {
  total_consumption_bpd: number;
  domestic_production_bpd: number;
  total_import_volume_bpd: number;
  import_dependency_pct: number;
  reserve_capacity_days_full: number;
  reserve_fill_percentage: number;
  reserve_remaining_days: number;
  commercial_stock_days: number;
  total_oil_availability_days: number;
  basket_composition: BasketComposition;
  current_price_usd_per_barrel: number;
  price_last_updated: string;
  corridor_supply: {
    Hormuz: CorridorSupply;
    Russia_non_Hormuz: CorridorSupply;
    Other_diversified: CorridorSupply;
  };
  top_suppliers_pct: {
    Russia: number;
    Iraq: number;
    "Saudi Arabia": number;
    UAE: number;
  };
  data_as_of: string;
  is_hardcoded: boolean;
  note: string;
}

export interface NationalStateHistory extends Omit<NationalState, "current_price_usd_per_barrel" | "price_last_updated" | "corridor_supply" | "top_suppliers_pct"> {
  month: string;
  current_price_usd_per_barrel: number | null;
  price_last_updated: string | null;
  corridor_supply: {
    Hormuz: NullableCorridorSupply;
    Russia_non_Hormuz: NullableCorridorSupply;
    Other_diversified: NullableCorridorSupply;
  };
  top_suppliers_pct: {
    Russia: number | null;
    Iraq: number | null;
    "Saudi Arabia": number | null;
    UAE: number | null;
  };
}

export interface NullableCorridorSupply {
  volume_bpd: number | null;
  share_pct: number | null;
}

const collection = () => {
  const database = mongoose.connection.db;
  if (!database) {
    throw new Error("MongoDB is not connected");
  }
  return database.collection(COLLECTION_NAME);
};

const historyCollection = () => {
  const database = mongoose.connection.db;
  if (!database) {
    throw new Error("MongoDB is not connected");
  }
  return database.collection(HISTORY_COLLECTION_NAME);
};

export async function getNationalState(): Promise<NationalState | null> {
  const state = await collection().findOne({});
  return (state as unknown as NationalState | null) ?? null;
}

export async function updateNationalState(fields: Partial<NationalState>): Promise<void> {
  await collection().updateOne({}, { $set: fields }, { upsert: true });
}

export async function getNationalStateHistory(): Promise<NationalStateHistory[]> {
  const history = await historyCollection().find({}).sort({ month: 1 }).toArray();
  return history as unknown as NationalStateHistory[];
}

export async function seedNationalStateHistoryMonth(state: NationalStateHistory): Promise<boolean> {
  const existing = await historyCollection().findOne({ month: state.month });
  if (existing) {
    return false;
  }

  await historyCollection().insertOne(state);
  return true;
}
