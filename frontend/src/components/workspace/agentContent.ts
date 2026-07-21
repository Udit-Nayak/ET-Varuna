export const showcaseAgents = [
  {
    code: "GRIA",
    name: "Geopolitical Risk Intelligence",
    desc: "Ingests geopolitical news, AIS activity, sanctions, and market signals into corridor-specific risk intelligence.",
    longDesc:
      "GRIA continuously monitors foreign affairs, chokepoints, sanctions, shipping activity, oil markets, and India-linked trade exposure to surface the signals most likely to affect crude availability.",
  },
  {
    code: "DSM",
    name: "Disruption Scenario Modeller",
    desc: "Simulates closures, conflict shocks, export cuts, and route suspensions across downstream operations.",
    longDesc:
      "DSM converts live or drawn corridor tension into operational scenarios, estimating capacity loss, disruption duration, refinery stress, fuel-price pressure, power-sector exposure, and wider economic impact.",
  },
  {
    code: "APO",
    name: "Adaptive Procurement Orchestrator",
    desc: "Ranks alternate suppliers and logistics routes by cost, transit time, route risk, and refinery fit.",
    longDesc:
      "APO identifies alternate crude sources and shipping routes when a corridor is stressed, weighing landed cost, tanker availability, route congestion, geopolitical exposure, delivery time, and refinery compatibility.",
  },
  {
    code: "SROA",
    name: "Strategic Reserve Optimiser",
    desc: "Plans SPR drawdown schedules against supply gaps, safety floors, and replenishment windows.",
    longDesc:
      "SROA translates disruption pressure into reserve policy, calculating release volumes, remaining reserve days, safety-threshold risk, demand substitution needs, and replenishment timing under stress.",
  },
  {
    code: "SCDT",
    name: "Supply Chain Digital Twin",
    desc: "Maps India's energy supply network from source corridors to refinery and distribution nodes.",
    longDesc:
      "SCDT anchors the workflow on a geospatial supply-chain twin, letting operators test what-if disruptions across ports, vessels, corridors, refinery demand, inventories, and response options in one map-led view.",
  },
] as const;
