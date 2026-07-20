export const showcaseAgents = [
  {
    code: "GRIA",
    name: "Geopolitical Risk Intelligence",
    desc: "Ingests news, AIS vessel data, sanctions, and prices into a live disruption score per corridor.",
    longDesc:
      "GRIA keeps the intelligence layer moving, matching corridor activity against shipping, oil, sanctions, conflict, and India supply-chain risk signals so the map never feels detached from the world outside it.",
  },
  {
    code: "DSM",
    name: "Disruption Scenario Modeller",
    desc: "Simulates events - closures, cuts, suspensions - and projects cascading downstream impact.",
    longDesc:
      "DSM converts a drawn or preset tension zone into operational pressure: capacity loss, duration, severity signals, and a scenario narrative the rest of the workflow can reason from.",
  },
  {
    code: "SROA",
    name: "Strategic Reserve Optimiser",
    desc: "Models optimal SPR drawdown against supply gaps without breaching the safety floor.",
    longDesc:
      "SROA turns DSM pressure into reserve policy, release volume, remaining reserve days, and a safety-threshold check so the operator can see whether the plan holds.",
  },
  {
    code: "APO",
    name: "Adaptive Procurement Orchestrator",
    desc: "Ranks alternate sourcing routes by cost, risk, and time-to-delivery when a corridor fails.",
    longDesc:
      "APO is shown as the next orchestration layer for alternate sourcing and logistics. The current repository does not include a live APO backend yet, so workspace output marks it honestly as coming soon.",
  },
] as const;
