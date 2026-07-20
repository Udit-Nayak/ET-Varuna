import { ApoLivePrice, ApoSupplier } from "./types";

export const seededApoSuppliers: ApoSupplier[] = [
  {
    supplier_id: "supplier-russia-espo",
    supplier_name: "Russian Far East ESPO Blend",
    region: "Russia Far East",
    crude_grade: "ESPO Blend",
    refinery_compatibility: ["jamnagar", "vadinar", "paradip", "panipat"],
    base_capacity_volume_per_day: 520000,
    route_options: [
      { route_id: "vladivostok-malacca-india", via: "Vladivostok - Malacca - Indian west coast", transit_days: 17, port_congestion_factor: 0.1, risk_query_terms: ["Russia Far East", "Malacca", "sanctions", "tanker"] },
      { route_id: "kozmino-pacific-india", via: "Kozmino - Pacific - Malacca - India", transit_days: 19, port_congestion_factor: 0.12, risk_query_terms: ["Kozmino", "Pacific", "Malacca", "oil tanker"] },
    ],
  },
  {
    supplier_id: "supplier-saudi-arab-light",
    supplier_name: "Saudi Aramco Arab Light",
    region: "Saudi Arabia",
    crude_grade: "Arab Light",
    refinery_compatibility: ["jamnagar", "mangalore", "panipat", "mathura", "paradip"],
    base_capacity_volume_per_day: 780000,
    route_options: [
      { route_id: "ras-tanura-hormuz-west-india", via: "Ras Tanura - Strait of Hormuz - west India", transit_days: 6, port_congestion_factor: 0.08, risk_query_terms: ["Saudi Arabia", "Hormuz", "Persian Gulf", "oil tanker"] },
      { route_id: "red-sea-cape-reroute", via: "Yanbu - Red Sea - Cape of Good Hope - India", transit_days: 24, port_congestion_factor: 0.16, risk_query_terms: ["Red Sea", "Cape of Good Hope", "Saudi crude", "shipping"] },
    ],
  },
  {
    supplier_id: "supplier-uae-murban",
    supplier_name: "ADNOC Murban",
    region: "United Arab Emirates",
    crude_grade: "Murban",
    refinery_compatibility: ["mangalore", "koch", "panipat", "vadinar"],
    base_capacity_volume_per_day: 430000,
    route_options: [
      { route_id: "fujairah-arabian-sea", via: "Fujairah - Arabian Sea - India", transit_days: 5, port_congestion_factor: 0.07, risk_query_terms: ["Fujairah", "Arabian Sea", "UAE", "oil tanker"] },
      { route_id: "jebel-ali-hormuz", via: "Jebel Ali - Hormuz - west India", transit_days: 7, port_congestion_factor: 0.11, risk_query_terms: ["Jebel Ali", "Hormuz", "UAE", "shipping"] },
    ],
  },
  {
    supplier_id: "supplier-iraq-basrah-medium",
    supplier_name: "Iraq Basrah Medium",
    region: "Iraq",
    crude_grade: "Basrah Medium",
    refinery_compatibility: ["jamnagar", "vadinar", "paradip", "mangalore"],
    base_capacity_volume_per_day: 610000,
    route_options: [
      { route_id: "basrah-hormuz-india", via: "Basrah - Strait of Hormuz - India", transit_days: 8, port_congestion_factor: 0.13, risk_query_terms: ["Basrah", "Iraq", "Hormuz", "oil exports"] },
    ],
  },
  {
    supplier_id: "supplier-us-wti-midland",
    supplier_name: "US Gulf WTI Midland",
    region: "United States Gulf Coast",
    crude_grade: "WTI Midland",
    refinery_compatibility: ["jamnagar", "panipat", "mathura"],
    base_capacity_volume_per_day: 350000,
    route_options: [
      { route_id: "us-gulf-cape-india", via: "US Gulf - Cape of Good Hope - India", transit_days: 34, port_congestion_factor: 0.18, risk_query_terms: ["US Gulf", "Cape of Good Hope", "crude exports", "shipping"] },
    ],
  },
  {
    supplier_id: "supplier-west-africa-bonny-light",
    supplier_name: "Nigeria Bonny Light",
    region: "West Africa",
    crude_grade: "Bonny Light",
    refinery_compatibility: ["mangalore", "koch", "panipat"],
    base_capacity_volume_per_day: 280000,
    route_options: [
      { route_id: "bonny-cape-india", via: "Bonny - Cape of Good Hope - India", transit_days: 26, port_congestion_factor: 0.17, risk_query_terms: ["Nigeria", "Bonny Light", "Gulf of Guinea", "Cape of Good Hope"] },
    ],
  },
  {
    supplier_id: "supplier-brazil-tupi",
    supplier_name: "Brazil Tupi Crude",
    region: "Brazil",
    crude_grade: "Tupi",
    refinery_compatibility: ["jamnagar", "vadinar"],
    base_capacity_volume_per_day: 240000,
    route_options: [
      { route_id: "santos-cape-india", via: "Santos - Cape of Good Hope - India", transit_days: 31, port_congestion_factor: 0.14, risk_query_terms: ["Brazil", "Santos", "Cape of Good Hope", "oil export"] },
    ],
  },
];

export const seededApoPrices: ApoLivePrice[] = [
  { grade: "ESPO Blend", region: "Russia Far East", price_per_barrel: 78.4, timestamp: new Date().toISOString(), source: "seeded APO reference" },
  { grade: "Arab Light", region: "Saudi Arabia", price_per_barrel: 83.2, timestamp: new Date().toISOString(), source: "seeded APO reference" },
  { grade: "Murban", region: "United Arab Emirates", price_per_barrel: 84.1, timestamp: new Date().toISOString(), source: "seeded APO reference" },
  { grade: "Basrah Medium", region: "Iraq", price_per_barrel: 81.6, timestamp: new Date().toISOString(), source: "seeded APO reference" },
  { grade: "WTI Midland", region: "United States Gulf Coast", price_per_barrel: 79.8, timestamp: new Date().toISOString(), source: "seeded APO reference" },
  { grade: "Bonny Light", region: "West Africa", price_per_barrel: 85.4, timestamp: new Date().toISOString(), source: "seeded APO reference" },
  { grade: "Tupi", region: "Brazil", price_per_barrel: 82.7, timestamp: new Date().toISOString(), source: "seeded APO reference" },
];
