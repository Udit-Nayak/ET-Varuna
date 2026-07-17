export type FacilityType = "port" | "refinery" | "spr";

export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  coordinates: [number, number]; // [lng, lat]
}

export const indiaFacilities: Facility[] = [
  { id: "mundra", name: "Mundra Port", type: "port", coordinates: [69.72, 22.75] },
  { id: "kandla", name: "Kandla (Deendayal) Port", type: "port", coordinates: [70.22, 23.03] },
  { id: "jnpt", name: "JNPT (Mumbai)", type: "port", coordinates: [72.95, 18.95] },
  { id: "paradip", name: "Paradip Port", type: "port", coordinates: [86.67, 20.27] },
  { id: "haldia", name: "Haldia Port", type: "port", coordinates: [88.09, 22.03] },
  { id: "vizag", name: "Visakhapatnam Port", type: "port", coordinates: [83.28, 17.68] },
  { id: "chennai", name: "Chennai Port", type: "port", coordinates: [80.29, 13.1] },
  { id: "ennore", name: "Ennore Port", type: "port", coordinates: [80.33, 13.22] },
  { id: "tuticorin", name: "Tuticorin Port", type: "port", coordinates: [78.15, 8.75] },
  { id: "kochi", name: "Kochi Port", type: "port", coordinates: [76.24, 9.95] },
  { id: "new-mangalore", name: "New Mangalore Port", type: "port", coordinates: [74.8, 12.92] },

  { id: "jamnagar", name: "Jamnagar Refinery (Reliance)", type: "refinery", coordinates: [70.0, 22.34] },
  { id: "panipat", name: "IOC Panipat Refinery", type: "refinery", coordinates: [76.97, 29.39] },
  { id: "bina", name: "Bina Refinery (BPCL)", type: "refinery", coordinates: [78.18, 24.17] },
  { id: "hpcl-mumbai", name: "HPCL Mumbai Refinery", type: "refinery", coordinates: [72.85, 19.0] },
  { id: "vizag-refinery", name: "HPCL Vizag Refinery", type: "refinery", coordinates: [83.22, 17.65] },

  { id: "spr-visakhapatnam", name: "SPR Visakhapatnam", type: "spr", coordinates: [83.3, 17.7] },
  { id: "spr-mangaluru", name: "SPR Mangaluru", type: "spr", coordinates: [74.85, 12.9] },
  { id: "spr-padur", name: "SPR Padur", type: "spr", coordinates: [74.75, 13.45] },
];
