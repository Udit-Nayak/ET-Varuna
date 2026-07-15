import { DsmRetrievedEvent } from "./types";

export const dsmMockEventsByCorridor: Record<string, DsmRetrievedEvent[]> = {
  "red sea": [
    {
      id: "mock-red-sea-1",
      headline: "Shipping suspension expands around Bab-el-Mandeb after tanker security alerts",
      riskScore: 78,
      severity: "high",
      publishedAt: new Date().toISOString(),
      eventType: "shipping_suspension",
      confidence: 0.86,
      summary: "Major carriers pause Red Sea movement, forcing longer tanker routes and tighter delivery windows.",
    },
    {
      id: "mock-red-sea-2",
      headline: "Insurance premiums rise for crude cargoes transiting Red Sea corridor",
      riskScore: 66,
      severity: "high",
      publishedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      eventType: "maritime_insurance_shock",
      confidence: 0.74,
    },
  ],
  hormuz: [
    {
      id: "mock-hormuz-1",
      headline: "Strait of Hormuz disruption risk rises after naval incident near tanker lane",
      riskScore: 84,
      severity: "critical",
      publishedAt: new Date().toISOString(),
      eventType: "chokepoint_escalation",
      confidence: 0.82,
    },
  ],
  suez: [
    {
      id: "mock-suez-1",
      headline: "Suez schedule delays build after convoy restrictions",
      riskScore: 58,
      severity: "medium",
      publishedAt: new Date().toISOString(),
      eventType: "shipping_delay",
      confidence: 0.72,
    },
  ],
};

export const getMockDsmEvents = (corridor: string): DsmRetrievedEvent[] => {
  const key = corridor.toLowerCase();
  const exact = dsmMockEventsByCorridor[key];
  if (exact) {
    return exact;
  }
  const partial = Object.entries(dsmMockEventsByCorridor).find(([name]) => key.includes(name) || name.includes(key));
  return partial?.[1] ?? [
    {
      id: "mock-general-1",
      headline: `${corridor} monitored with elevated but unconfirmed supply-chain disruption risk`,
      riskScore: 48,
      severity: "medium",
      publishedAt: new Date().toISOString(),
      eventType: "scenario_assumption",
      confidence: 0.65,
    },
  ];
};
