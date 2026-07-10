export interface GriaOutput {
  corridor: string;
  risk_score: number;
  trend: "rising" | "falling" | "stable";
  explanation: string;
  contributing_signals: string[];
}

export interface DsmOutput {
  corridor: string;
  scenario_id: string;
  impact_timeline: Array<{
    day: number;
    refinery_output_pct: number;
    price_change_pct: number;
    gdp_impact_pct: number;
  }>;
}

export interface ApoOutput {
  corridor: string;
  ranked_options: Array<{
    source: string;
    route: string;
    landed_cost: number;
    eta_days: number;
    score: number;
    explanation: string;
  }>;
}

export interface SroaOutput {
  drawdown_schedule: Array<{
    day: number;
    release_rate: number;
  }>;
  safety_threshold_breached: boolean;
}

export interface TfmOutput {
  corridor: string;
  fulfillment_pct: number;
  price_delta_pct: number;
  baseline_volume: number;
  current_volume: number;
}

export interface ScdtOutput {
  corridor: string;
  risk_level: "green" | "yellow" | "red";
  active_scenario: string;
  corridor_share_pct: number;
  map_points: Array<{
    name: string;
    lat: number;
    lng: number;
    role: string;
  }>;
}
