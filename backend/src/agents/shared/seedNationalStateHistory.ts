import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { connectDB } from "../../config/db";
import { seedNationalStateHistoryMonth, type NationalStateHistory } from "./nationalStateRepository";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const history: NationalStateHistory[] = [
  {
    month: "2026-03",
    total_consumption_bpd: 5_500_000,
    domestic_production_bpd: 952_000,
    total_import_volume_bpd: 4_500_000,
    import_dependency_pct: 85,
    reserve_capacity_days_full: 9.5,
    reserve_fill_percentage: 64,
    reserve_remaining_days: 5,
    commercial_stock_days: 69,
    total_oil_availability_days: 74,
    basket_composition: { sour_pct: 78.71, sweet_pct: 21.29 },
    current_price_usd_per_barrel: 125.7,
    price_last_updated: "2026-03-25",
    corridor_supply: {
      Hormuz: { volume_bpd: 1_180_000, share_pct: 26.3 },
      Russia_non_Hormuz: { volume_bpd: 2_250_000, share_pct: 50 },
      Other_diversified: { volume_bpd: 1_070_000, share_pct: 23.7 },
    },
    top_suppliers_pct: { Russia: 50, Iraq: null, "Saudi Arabia": null, UAE: null },
    data_as_of: "2026-03-25",
    is_hardcoded: true,
    note: "Hormuz military strikes crisis peak. Basket composition ratio per ICRA report for this period (78.71:21.29, differs slightly from standard 75.62:24.38).",
  },
  {
    month: "2026-04",
    total_consumption_bpd: 5_500_000,
    domestic_production_bpd: 952_000,
    total_import_volume_bpd: 4_500_000,
    import_dependency_pct: 85,
    reserve_capacity_days_full: 9.5,
    reserve_fill_percentage: 64,
    reserve_remaining_days: 78,
    commercial_stock_days: 78,
    total_oil_availability_days: 78,
    basket_composition: { sour_pct: 75.62, sweet_pct: 24.38 },
    current_price_usd_per_barrel: null,
    price_last_updated: null,
    corridor_supply: {
      Hormuz: { volume_bpd: 247_000, share_pct: 5.5 },
      Russia_non_Hormuz: { volume_bpd: 2_100_000, share_pct: 46.7 },
      Other_diversified: { volume_bpd: 2_153_000, share_pct: 47.8 },
    },
    top_suppliers_pct: { Russia: 46.7, Iraq: null, "Saudi Arabia": 15.2, UAE: null },
    data_as_of: "2026-04-23",
    is_hardcoded: true,
    note: "Petroleum Minister Hardeep Singh Puri stated reserves (oil+gas combined) would cover 76-80 days as of this period - used 78 as midpoint, overriding the 74-day estimate used for other months since this is a direct government statement specific to April. Hormuz-route supply collapsed to 247,000 bpd (from 2.8M bpd in February) per Kpler/CNBC. Saudi Arabia shipped 684,190 bpd this month; share % calculated against total import volume.",
  },
  {
    month: "2026-05",
    total_consumption_bpd: 5_500_000,
    domestic_production_bpd: 952_000,
    total_import_volume_bpd: 4_990_000,
    import_dependency_pct: 85,
    reserve_capacity_days_full: 9.5,
    reserve_fill_percentage: 64,
    reserve_remaining_days: 5,
    commercial_stock_days: 69,
    total_oil_availability_days: 74,
    basket_composition: { sour_pct: 75.62, sweet_pct: 24.38 },
    current_price_usd_per_barrel: null,
    price_last_updated: null,
    corridor_supply: {
      Hormuz: { volume_bpd: null, share_pct: null },
      Russia_non_Hormuz: { volume_bpd: 1_920_000, share_pct: 38.6 },
      Other_diversified: { volume_bpd: 3_070_000, share_pct: 61.4 },
    },
    top_suppliers_pct: { Russia: 38.6, Iraq: null, "Saudi Arabia": null, UAE: null },
    data_as_of: "2026-05-29",
    is_hardcoded: true,
    note: "Recovery phase, Russian share moderating from March peak. Price and Hormuz-specific volume not found in available sources for this month.",
  },
  {
    month: "2026-06",
    total_consumption_bpd: 5_500_000,
    domestic_production_bpd: 952_000,
    total_import_volume_bpd: 5_600_000,
    import_dependency_pct: 85,
    reserve_capacity_days_full: 9.5,
    reserve_fill_percentage: 64,
    reserve_remaining_days: 5,
    commercial_stock_days: 69,
    total_oil_availability_days: 74,
    basket_composition: { sour_pct: 75.62, sweet_pct: 24.38 },
    current_price_usd_per_barrel: null,
    price_last_updated: null,
    corridor_supply: {
      Hormuz: { volume_bpd: null, share_pct: 38 },
      Russia_non_Hormuz: { volume_bpd: 2_600_000, share_pct: 46 },
      Other_diversified: { volume_bpd: 1_505_000, share_pct: 16 },
    },
    top_suppliers_pct: { Russia: 46, Iraq: 17.77, "Saudi Arabia": 8.93, UAE: null },
    data_as_of: "2026-06-30",
    is_hardcoded: true,
    note: "Record Russian crude volume, Middle East share at record low 38%. Iraq/Saudi percentages derived from reported volumes (995,000 and 500,000 bpd) against total 5,600,000 bpd import volume.",
  },
];

const seed = async (): Promise<void> => {
  await connectDB();
  for (const month of history) {
    const inserted = await seedNationalStateHistoryMonth(month);
    console.log(inserted ? `Seeded national state history for ${month.month}.` : `National state history for ${month.month} already exists; skipping.`);
  }
};

void seed()
  .catch((error: unknown) => {
    console.error("Failed to seed national petroleum state history:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
