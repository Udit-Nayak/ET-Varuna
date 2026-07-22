export const showcaseAgents = [
  {
    code: "GRIA",
    name: "Geopolitical Risk Intelligence",
    desc: "Builds the live intelligence layer by combining geopolitical news, AIS vessel movement, sanctions signals, oil-market shifts, and India-linked corridor exposure into a focused risk picture.",
    longDesc:
      "GRIA acts as the system's sensing layer. It continuously scans foreign affairs, maritime chokepoints, sanctions, vessel behavior, oil-market stress, and India-facing trade exposure, then turns that noisy signal stream into corridor-specific intelligence. Instead of asking the operator to read raw news or vessel feeds, GRIA highlights which events are most likely to affect crude availability, tanker movement, route reliability, and downstream supply confidence.",
  },
  {
    code: "DSM",
    name: "Disruption Scenario Modeller",
    desc: "Converts corridor closures, conflict shocks, export cuts, and route suspensions into day-by-day downstream impact curves for refineries, prices, power stress, and GDP sensitivity.",
    longDesc:
      "DSM is the what-if engine. When a user draws a tension zone or asks about a disruption, DSM converts that situation into a structured scenario with capacity loss, duration, affected import share, substitution ramp, reserve cushion, refinery output, price pressure, and GDP impact. Its purpose is to make the disruption measurable day by day, so the response team can see when stress peaks and what assumptions are driving the result.",
  },
  {
    code: "APO",
    name: "Adaptive Procurement Orchestrator",
    desc: "Ranks alternate crude suppliers, grades, ports, and logistics routes using landed cost, transit time, route risk, tanker capacity, congestion, and refinery compatibility.",
    longDesc:
      "APO turns residual supply gaps into procurement options. It evaluates alternate crude sources and shipping routes when a corridor is stressed, comparing supplier capacity, crude grade, landed cost, tanker availability, port congestion, transit time, geopolitical exposure, route risk, and refinery compatibility. The output is a ranked set of options that explains not only which route is best, but why it wins and what caveats the operator should still verify.",
  },
  {
    code: "SROA",
    name: "Strategic Reserve Optimiser",
    desc: "Designs strategic reserve drawdown schedules against forecast supply gaps, safety floors, release-rate limits, demand substitution, and replenishment timing.",
    longDesc:
      "SROA is the reserve-policy layer. It takes DSM's disruption pressure and calculates how much strategic reserve should be released, when it should be released, what supply gap remains after support, and whether the reserve safety floor is protected. It also exposes the tradeoff between aggressive response, reserve depletion, demand substitution, and replenishment timing, helping operators avoid solving today's disruption by creating tomorrow's vulnerability.",
  },
  {
    code: "SCDT",
    name: "Supply Chain Digital Twin",
    desc: "Maps India's energy supply chain from overseas sourcing corridors through vessels, ports, refineries, reserve sites, inventories, and distribution nodes for live what-if planning.",
    longDesc:
      "SCDT provides the geospatial operating picture. It connects source corridors, vessel flows, ports, refineries, reserve sites, inventories, and distribution nodes into a map-led supply-chain twin. This lets the operator test disruptions visually, compare affected routes, inspect exposed assets, and keep GRIA, DSM, SROA, and APO outputs grounded in the same physical network rather than scattered across separate reports.",
  },
] as const;
