export interface Corridor {
  id: string;
  name: string;
  risk: number; // 0-100, static for now — Part 2/AI agent will make this live
  coordinates: [number, number][]; // [lng, lat] pairs, MapLibre order
}

// Coordinates are simplified chokepoint paths — good enough for a
// visual corridor line at this zoom level. Not navigational data.
export const corridors: Corridor[] = [
  {
    id: "hormuz",
    name: "Strait of Hormuz",
    risk: 82,
    coordinates: [
      [56.9, 27.0],
      [56.55, 26.7],
      [56.25, 26.55],
      [56.0, 26.4],
    ],
  },
  {
    id: "bab-el-mandeb",
    name: "Bab-el-Mandeb",
    risk: 71,
    coordinates: [
      [43.55, 12.9],
      [43.4, 12.65],
      [43.3, 12.5],
    ],
  },
  {
    id: "malacca",
    name: "Strait of Malacca",
    risk: 24,
    coordinates: [
      [98.6, 6.2],
      [100.3, 3.8],
      [101.4, 2.6],
      [103.5, 1.3],
    ],
  },
  {
    id: "suez",
    name: "Suez Canal",
    risk: 33,
    coordinates: [
      [32.58, 31.27],
      [32.55, 30.6],
      [32.53, 29.93],
      [32.57, 29.5],
    ],
  },
  {
    id: "cape-of-good-hope",
    name: "Cape of Good Hope (reroute)",
    risk: 9,
    coordinates: [
      [18.4, -34.35],
      [16.0, -33.5],
      [12.0, -28.0],
    ],
  },
];