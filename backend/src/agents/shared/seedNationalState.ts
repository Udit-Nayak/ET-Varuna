import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { connectDB } from "../../config/db";
import { getNationalState, updateNationalState, type NationalState } from "./nationalStateRepository";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const nationalState: NationalState = {
  total_consumption_bpd: 5_500_000,
  domestic_production_bpd: 952_000,
  total_import_volume_bpd: 4_548_000,
  import_dependency_pct: 85,
  reserve_capacity_days_full: 9.5,
  reserve_fill_percentage: 64,
  reserve_remaining_days: 5,
  commercial_stock_days: 69,
  total_oil_availability_days: 74,
  basket_composition: { sour_pct: 75.62, sweet_pct: 24.38 },
  current_price_usd_per_barrel: 67.2,
  price_last_updated: "2026-07-02",
  corridor_supply: {
    Hormuz: { volume_bpd: 1_180_000, share_pct: 26.3 },
    Russia_non_Hormuz: { volume_bpd: 2_600_000, share_pct: 52 },
    Other_diversified: { volume_bpd: 768_000, share_pct: 15.4 },
  },
  top_suppliers_pct: { Russia: 52, Iraq: 19.89, "Saudi Arabia": 16.03, UAE: 11.00 },
  data_as_of: "2026-06-01",
  is_hardcoded: true,
  note: "Static seed data for hackathon demo. To be replaced with live feeds in later stages.",
};

const seed = async (): Promise<void> => {
  await connectDB();
  const existing = await getNationalState();

  if (existing) {
    console.log("National petroleum state already exists; skipping seed.");
    return;
  }

  await updateNationalState(nationalState);
  console.log("National petroleum state seeded.");
};

void seed()
  .catch((error: unknown) => {
    console.error("Failed to seed national petroleum state:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
