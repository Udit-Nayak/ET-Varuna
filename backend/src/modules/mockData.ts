import {
  ApoOutput,
  DsmOutput,
  GriaOutput,
  ScdtOutput,
  SroaOutput,
  TfmOutput,
} from "./contracts";

export const mockGria: GriaOutput = {
  corridor: "Red Sea / Bab-el-Mandeb",
  risk_score: 78,
  trend: "rising",
  explanation:
    "Recent vessel rerouting and repeated attacks near the Bab-el-Mandeb corridor have tightened shipping capacity and lifted risk sharply.",
  contributing_signals: [
    "Houthi activity near key transit lanes",
    "Insurance premiums up 35%",
    "Refiner spot purchases increased",
  ],
};

export const mockDsm: DsmOutput = {
  corridor: "Red Sea / Bab-el-Mandeb",
  scenario_id: "red-sea-suspension",
  impact_timeline: [
    { day: 1, refinery_output_pct: 94, price_change_pct: 4.8, gdp_impact_pct: 0.2 },
    { day: 7, refinery_output_pct: 88, price_change_pct: 7.1, gdp_impact_pct: 0.5 },
    { day: 14, refinery_output_pct: 81, price_change_pct: 10.3, gdp_impact_pct: 0.9 },
  ],
};

export const mockApo: ApoOutput = {
  corridor: "Red Sea / Bab-el-Mandeb",
  ranked_options: [
    {
      source: "West Africa Blend",
      route: "Cape of Good Hope → Jebel Ali",
      landed_cost: 84.7,
      eta_days: 16,
      score: 92,
      explanation:
        "This option best balances availability, compatibility, and lower exposure to the disrupted corridor.",
    },
    {
      source: "North Sea Forties",
      route: "North Sea → Suez reroute",
      landed_cost: 88.3,
      eta_days: 12,
      score: 79,
      explanation:
        "Higher cost but faster arrival, useful for urgent near-term cover.",
    },
    {
      source: "Middle East Replacement",
      route: "Gulf loading → alternate terminal",
      landed_cost: 91.4,
      eta_days: 9,
      score: 67,
      explanation:
        "Fast delivery but reliability is lower and margins are compressed under current stress.",
    },
  ],
};

export const mockSroa: SroaOutput = {
  drawdown_schedule: [
    { day: 1, release_rate: 0.12 },
    { day: 7, release_rate: 0.18 },
    { day: 14, release_rate: 0.1 },
  ],
  safety_threshold_breached: false,
};

export const mockTfm: TfmOutput = {
  corridor: "Red Sea / Bab-el-Mandeb",
  fulfillment_pct: 63,
  price_delta_pct: 8.4,
  baseline_volume: 240000,
  current_volume: 151200,
};

export const mockScdt: ScdtOutput = {
  corridor: "Red Sea / Bab-el-Mandeb",
  risk_level: "red",
  active_scenario: "red-sea-suspension",
  corridor_share_pct: 28,
  map_points: [
    { name: "Jeddah", lat: 21.4858, lng: 39.1925, role: "refinery" },
    { name: "Bab-el-Mandeb", lat: 12.5, lng: 43.3, role: "chokepoint" },
    { name: "Aden", lat: 12.8, lng: 45.0, role: "port" },
    { name: "Jebel Ali", lat: 25.2, lng: 55.3, role: "terminal" },
  ],
};
