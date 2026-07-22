import WebSocket from "ws";

export interface VesselState {
  mmsi: number;
  lat: number;
  lon: number;
  cog?: number;
  sog?: number;
  heading?: number;
  name?: string;
  type?: number;
  callSign?: string;
  destination?: string;
  imoNumber?: number;
  draught?: number;
  isTanker: boolean;
  lastUpdate: number;
}

type Listener = (vessels: VesselState[]) => void;
type BoundingBox = [[number, number], [number, number]];
type StaticVesselData = Pick<
  VesselState,
  "name" | "type" | "callSign" | "destination" | "imoNumber" | "draught" | "isTanker"
>;

const AIS_URL = "wss://stream.aisstream.io/v0/stream";

// Global commercial shipping regions. AISStream requires bounded boxes, so this
// covers the busiest tanker/cargo lanes instead of subscribing to open ocean noise.
// Format per AISStream docs: [[[lat1, lon1], [lat2, lon2]], ...]
const BOUNDING_BOXES: BoundingBox[] = [
  [[-38, -82], [48, -35]], // Atlantic and US east coast
  [[18, -100], [52, -60]], // North America / Gulf / Caribbean
  [[-8, -84], [18, -74]], // Panama approaches
  [[30, -10], [46, 36]], // Mediterranean / Suez approach
  [[48, -8], [62, 12]], // North Sea / English Channel
  [[10, 32], [32, 62]], // Red Sea / Gulf / Hormuz
  [[-36, 35], [28, 82]], // East Africa / Arabian Sea / India west
  [[-15, 76], [24, 100]], // Bay of Bengal / Malacca west
  [[-12, 95], [24, 122]], // Malacca / South China Sea
  [[20, 118], [42, 146]], // China / Korea / Japan
  [[-12, 105], [10, 130]], // Indonesia lanes
  [[-45, 108], [-10, 156]], // Australia lanes
  [[-42, 12], [-24, 34]], // Cape of Good Hope
  [[-45, -78], [-8, -35]], // South America east/west approaches
];

const POSITION_MESSAGE_TYPES = [
  "PositionReport",
  "StandardClassBPositionReport",
  "ExtendedClassBPositionReport",
];
const STATIC_MESSAGE_TYPES = ["ShipStaticData", "StaticDataReport"];

const isTankerType = (type?: number) => type !== undefined && type >= 80 && type <= 89;
const isTradingVesselType = (type?: number) => type !== undefined && type >= 70 && type <= 89;

const STALE_MS = 15 * 60 * 1000;
const BROADCAST_INTERVAL_MS = 4000;
const MAX_BROADCAST_VESSELS = 5000;
const AIS_CONNECT_TIMEOUT_MS = Number(process.env.AISSTREAM_CONNECT_TIMEOUT_MS ?? 15000);
const AIS_RECONNECT_MIN_MS = Number(process.env.AISSTREAM_RECONNECT_MIN_MS ?? 5000);
const AIS_RECONNECT_MAX_MS = Number(process.env.AISSTREAM_RECONNECT_MAX_MS ?? 120000);
const AIS_FAILURE_COOLDOWN_MS = Number(process.env.AISSTREAM_FAILURE_COOLDOWN_MS ?? 300000);
const AIS_FAILURES_BEFORE_COOLDOWN = Number(process.env.AISSTREAM_FAILURES_BEFORE_COOLDOWN ?? 5);
const SIMULATION_ENABLED =
  process.env.AIS_SIMULATION_ENABLED === "true" ||
  (!process.env.AISSTREAM_API_KEY && process.env.AIS_SIMULATION_ENABLED !== "false");
const AISSTREAM_ENABLED = process.env.AISSTREAM_ENABLED !== "false";

const SIMULATED_ROUTES: [number, number][][] = [
  // Route 1: Persian Gulf to Mumbai, held offshore through Hormuz and the Arabian Sea.
  [
    [51.2, 27.7],
    [53.8, 26.9],
    [56.5, 26.45],
    [58.3, 25.2],
    [61.8, 22.8],
    [66.5, 20.4],
    [70.8, 18.9],
    [72.7, 18.6]
  ],
  // Route 2: Suez and Red Sea to India's west coast via open Gulf of Aden / Arabian Sea.
  [
    [32.55, 30.1],
    [33.4, 27.5],
    [36.8, 21.8],
    [40.6, 16.0],
    [43.3, 12.55],
    [47.5, 11.4],
    [55.5, 12.8],
    [64.5, 11.3],
    [72.2, 9.7],
    [76.1, 9.5]
  ],
  // Route 3: Singapore/Malacca to Chennai, with waypoints south/east of Sri Lanka.
  [
    [104.0, 1.25],
    [102.0, 2.4],
    [100.2, 4.0],
    [96.8, 6.2],
    [90.5, 7.1],
    [84.3, 7.4],
    [81.0, 8.6],
    [80.2, 12.6]
  ],
  // Route 4: Cape of Good Hope to Mumbai, offshore around South Africa and east of Madagascar.
  [
    [16.4, -35.4],
    [20.2, -37.0],
    [27.8, -36.4],
    [35.0, -33.0],
    [43.2, -25.8],
    [50.8, -17.2],
    [56.6, -6.8],
    [62.8, 3.6],
    [68.6, 12.4],
    [72.7, 18.6]
  ],
  // Route 5: Red Sea to Mumbai, avoiding the Horn of Africa coastline.
  [
    [33.0, 27.8],
    [36.5, 22.4],
    [40.0, 16.6],
    [43.25, 12.55],
    [48.0, 11.6],
    [56.0, 13.2],
    [64.4, 15.5],
    [70.8, 18.2],
    [72.7, 18.6]
  ],
  // Route 6: Persian Gulf to Chennai, via Arabian Sea and around Sri Lanka.
  [
    [51.2, 27.7],
    [54.0, 26.8],
    [56.5, 26.45],
    [59.4, 23.7],
    [64.8, 17.0],
    [70.5, 10.0],
    [76.8, 6.0],
    [80.4, 6.0],
    [82.0, 8.4],
    [80.2, 12.6]
  ]
];

interface SimulatedVessel {
  mmsi: number;
  name: string;
  routeIndex: number;
  progress: number;
  speed: number;
  isForward: boolean;
  type: number;
  callSign: string;
  destination: string;
  imoNumber: number;
  draught: number;
  isTanker: boolean;
}

function interpolatePath(path: [number, number][], progress: number): { lat: number; lon: number; bearing: number } {
  const n = path.length;
  if (n === 0) return { lat: 0, lon: 0, bearing: 0 };
  if (n === 1) return { lat: path[0][1], lon: path[0][0], bearing: 0 };

  const segments: number[] = [];
  let totalDist = 0;
  for (let i = 0; i < n - 1; i++) {
    const p1 = path[i];
    const p2 = path[i+1];
    const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    segments.push(d);
    totalDist += d;
  }

  let targetDist = progress * totalDist;
  let currentDist = 0;
  for (let i = 0; i < n - 1; i++) {
    const d = segments[i];
    if (currentDist + d >= targetDist) {
      const ratio = d === 0 ? 0 : (targetDist - currentDist) / d;
      const p1 = path[i];
      const p2 = path[i+1];
      const lon = p1[0] + (p2[0] - p1[0]) * ratio;
      const lat = p1[1] + (p2[1] - p1[1]) * ratio;

      const dLon = p2[0] - p1[0];
      const dLat = p2[1] - p1[1];
      let angle = Math.atan2(dLon, dLat) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      return { lat, lon, bearing: angle };
    }
    currentDist += d;
  }

  const end = path[n - 1];
  return { lat: end[1], lon: end[0], bearing: 0 };
}

const VESSEL_NAMES_TANKER = [
  "MT INDUS STAR", "MARAN CENTAURUS", "AL-KHAFJI", "OCEAN LEOPARD", "BHARAT RATNA",
  "SAURASHTRA QUEEN", "MT EVEREST", "PIONEER SPIRIT", "ARABIAN DISCOVERY", "GULF HORIZON",
  "SWARNA KAMAL", "MT KANCHENJUNGA", "NEELKANTH", "DESH SHAKTI", "DESH VIRAT"
];

const VESSEL_NAMES_CARGO = [
  "PACIFIC TRADER", "GOLDEN GATE", "SHANGHAI VOYAGER", "SINGAPORE FLIER", "CAPE PATRIOT",
  "ATLANTIC RULER", "CMA CGM COROMANDEL", "MSC GOA", "MAERSK JAMNAGAR", "ORIENT CLIPPER",
  "HALDIA PIONEER", "GANGA RIDER", "SINDHU EXPRESS", "CHENNAI EXPRESS", "VISHVA PREET"
];

const DESTINATIONS = [
  "MUMBAI, IN", "NHAVA SHEVA, IN", "KOCHI, IN", "CHENNAI, IN", "SUEZ, EG",
  "SINGAPORE, SG", "FUJAIRAH, AE", "ROTTERDAM, NL", "HORMUZ, IR", "BAB-EL-MANDEB"
];

class AisStreamService {
  private vessels = new Map<number, VesselState>();
  private liveMmsis = new Set<number>();
  private simulatedMmsis = new Set<number>();
  private staticDataByMmsi = new Map<number, StaticVesselData>();
  private listeners: Listener[] = [];
  private ws: WebSocket | null = null;
  private reconnectDelay = AIS_RECONNECT_MIN_MS;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private consecutiveConnectionFailures = 0;
  private lastConnectionError = "";
  private lastCapWarningAt = 0;
  private lastDiagnosticWarningAt = 0;
  private simulatedFleet: SimulatedVessel[] = [];

  // diagnostics
  private positionReportCount = 0;
  private staticDataCount = 0;

  start() {
    if (SIMULATION_ENABLED) {
      this.initSimulatedFleet();
    }

    const apiKey = process.env.AISSTREAM_API_KEY;
    if (!AISSTREAM_ENABLED) {
      console.warn("AISStream disabled by AISSTREAM_ENABLED=false. Operating with simulator data only.");
    } else if (!apiKey) {
      console.warn("AISSTREAM_API_KEY not set — operating in simulation mode only.");
    } else {
      this.connect(apiKey);
    }

    // Periodically update simulated fleet and broadcast
    setInterval(() => {
      if (SIMULATION_ENABLED) {
        this.updateSimulatedFleet();
      }
      this.broadcast();
    }, BROADCAST_INTERVAL_MS);

    setInterval(() => this.cleanupStale(), 60000);
    setInterval(() => this.logStats(), 15000);
  }

  private initSimulatedFleet() {
    const totalSimulated = 80;
    const mids = [419, 412, 563, 403, 461, 351, 338, 232]; // India, China, SG, Saudi, Oman, Panama, USA, UK

    for (let i = 0; i < totalSimulated; i++) {
      const isTanker = i % 2 === 0;
      const routeIndex = i % SIMULATED_ROUTES.length;
      const progress = 0.05 + Math.random() * 0.9;
      const speed = 11 + Math.random() * 6; // 11-17 knots
      const isForward = true;

      const mid = mids[i % mids.length];
      const mmsi = mid * 1000000 + Math.floor(100000 + Math.random() * 899999);

      const nameArray = isTanker ? VESSEL_NAMES_TANKER : VESSEL_NAMES_CARGO;
      const name = nameArray[i % nameArray.length] + " " + (10 + Math.floor(Math.random() * 90));
      const type = isTanker ? (80 + (i % 10)) : (70 + (i % 10));

      const callSign = String.fromCharCode(
        65 + Math.floor(Math.random() * 26),
        65 + Math.floor(Math.random() * 26),
        65 + Math.floor(Math.random() * 26),
        65 + Math.floor(Math.random() * 26)
      ) + Math.floor(1000 + Math.random() * 9000);

      const destination = DESTINATIONS[i % DESTINATIONS.length];
      const imoNumber = 9000000 + Math.floor(Math.random() * 999999);
      const draught = Number((6 + Math.random() * 10).toFixed(1));

      this.simulatedFleet.push({
        mmsi,
        name,
        routeIndex,
        progress,
        speed,
        isForward,
        type,
        callSign,
        destination,
        imoNumber,
        draught,
        isTanker
      });
      this.simulatedMmsis.add(mmsi);
    }
  }

  private updateSimulatedFleet() {
    this.simulatedFleet.forEach((v) => {
      const speedFactor = 0.0003 + (v.speed / 15) * 0.0002;
      const step = speedFactor;

      v.progress += step;
      if (v.progress >= 1.0) {
        v.progress -= 1.0;
      }

      const path = SIMULATED_ROUTES[v.routeIndex];
      const pos = interpolatePath(path, v.progress);

      this.vessels.set(v.mmsi, {
        mmsi: v.mmsi,
        lat: pos.lat,
        lon: pos.lon,
        cog: Math.round(pos.bearing),
        sog: v.speed,
        heading: Math.round(pos.bearing),
        name: v.name,
        type: v.type,
        callSign: v.callSign,
        destination: v.destination,
        imoNumber: v.imoNumber,
        draught: v.draught,
        isTanker: v.isTanker,
        lastUpdate: Date.now(),
      });
    });
  }

  private buildSubscriptionMessage(apiKey: string) {
    return {
      APIKey: apiKey,
      BoundingBoxes: BOUNDING_BOXES,
      FilterMessageTypes: [...POSITION_MESSAGE_TYPES, ...STATIC_MESSAGE_TYPES],
    };
  }

  private scheduleReconnect(apiKey: string, reason: string) {
    if (!AISSTREAM_ENABLED || this.reconnectTimer) return;

    const cooldown = this.consecutiveConnectionFailures >= AIS_FAILURES_BEFORE_COOLDOWN;
    const delay = cooldown ? AIS_FAILURE_COOLDOWN_MS : this.reconnectDelay;
    const fallback = SIMULATION_ENABLED ? " Simulator fallback remains active." : "";
    console.warn(`AISStream unavailable (${reason}).${fallback} Retrying in ${delay}ms.`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect(apiKey);
    }, delay);

    this.reconnectDelay = cooldown ? AIS_RECONNECT_MAX_MS : Math.min(this.reconnectDelay * 2, AIS_RECONNECT_MAX_MS);
  }

  private logConnectionDiagnostic(error: Error & { code?: string }) {
    const now = Date.now();
    if (now - this.lastDiagnosticWarningAt < 60000) return;
    this.lastDiagnosticWarningAt = now;

    const code = error.code ? `${error.code}: ` : "";
    console.warn(
      `${code}${error.message}. AISStream is a remote beta websocket service; if this repeats, check outbound wss/443 access, VPN/firewall/proxy rules, DNS, and whether https://stream.aisstream.io is reachable from this machine or deployment host.`
    );
  }

  private connect(apiKey: string) {
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      this.ws.terminate();
    }

    const socket = new WebSocket(AIS_URL, {
      handshakeTimeout: AIS_CONNECT_TIMEOUT_MS,
      perMessageDeflate: false,
    });
    this.ws = socket;

    socket.on("open", () => {
      console.log("AISStream connected");
      this.reconnectDelay = AIS_RECONNECT_MIN_MS;
      this.consecutiveConnectionFailures = 0;
      this.lastConnectionError = "";
      socket.send(JSON.stringify(this.buildSubscriptionMessage(apiKey)));
    });

    socket.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.error) {
          console.error("AISStream returned an error:", parsed.error);
          return;
        }
        this.handleMessage(parsed);
      } catch (err) {
        console.error("Failed to parse AIS message:", err);
      }
    });

    socket.on("close", (code, reason) => {
      if (this.ws === socket) {
        this.ws = null;
      }
      this.consecutiveConnectionFailures += 1;
      this.scheduleReconnect(apiKey, reason?.toString() || this.lastConnectionError || `close code ${code}`);
    });

    socket.on("error", (err) => {
      const error = err as Error & { code?: string };
      this.lastConnectionError = error.code ? `${error.code} ${error.message}` : error.message;
      this.logConnectionDiagnostic(error);
    });
  }

  private handleMessage(msg: any) {
    const mmsi = msg?.MetaData?.MMSI;
    if (!mmsi) return;
    const existing = this.vessels.get(mmsi);

    if (POSITION_MESSAGE_TYPES.includes(msg.MessageType)) {
      this.positionReportCount++;
      const pr = msg.Message?.[msg.MessageType];
      if (!Number.isFinite(pr?.Latitude) || !Number.isFinite(pr?.Longitude)) return;

      const staticData = this.staticDataByMmsi.get(mmsi);
      const type = existing?.type ?? staticData?.type ?? pr.Type;
      this.vessels.set(mmsi, {
        mmsi,
        lat: pr.Latitude,
        lon: pr.Longitude,
        cog: pr.Cog,
        sog: pr.Sog,
        heading: pr.TrueHeading,
        name: existing?.name ?? staticData?.name ?? pr.Name?.trim() ?? msg.MetaData.ShipName?.trim(),
        type,
        callSign: existing?.callSign ?? staticData?.callSign,
        destination: existing?.destination ?? staticData?.destination,
        imoNumber: existing?.imoNumber ?? staticData?.imoNumber,
        draught: existing?.draught ?? staticData?.draught,
        isTanker: isTankerType(type),
        lastUpdate: Date.now(),
      });
      this.liveMmsis.add(mmsi);
    }

    if (STATIC_MESSAGE_TYPES.includes(msg.MessageType)) {
      this.staticDataCount++;
      const sd = msg.Message?.[msg.MessageType];
      const name = sd?.Name?.trim() || sd?.ReportA?.Name?.trim() || existing?.name;
      const type = sd?.Type ?? sd?.ReportB?.ShipType;
      const staticData = {
        name,
        type,
        callSign: sd?.CallSign?.trim() || sd?.ReportB?.CallSign?.trim() || existing?.callSign,
        destination: sd?.Destination?.trim() || existing?.destination,
        imoNumber: sd?.ImoNumber || existing?.imoNumber,
        draught: sd?.MaximumStaticDraught || existing?.draught,
        isTanker: isTankerType(type),
      };

      this.staticDataByMmsi.set(mmsi, staticData);
      this.liveMmsis.add(mmsi);

      if (!existing) return;

      this.vessels.set(mmsi, {
        mmsi,
        lat: existing.lat,
        lon: existing.lon,
        cog: existing.cog,
        sog: existing.sog,
        heading: existing.heading,
        name: staticData.name,
        type: staticData.type,
        callSign: staticData.callSign,
        destination: staticData.destination,
        imoNumber: staticData.imoNumber,
        draught: staticData.draught,
        isTanker: staticData.isTanker,
        lastUpdate: existing.lastUpdate,
      });
    }
  }

  private cleanupStale() {
    const now = Date.now();
    for (const [mmsi, v] of this.vessels) {
      const isSimulated = this.simulatedMmsis.has(mmsi);
      if (!isSimulated && now - v.lastUpdate > STALE_MS) {
        this.vessels.delete(mmsi);
        this.liveMmsis.delete(mmsi);
      }
    }
  }

  private logStats() {
    const total = this.vessels.size;
    const live = Array.from(this.liveMmsis).filter((mmsi) => this.vessels.has(mmsi)).length;
    const simulated = Array.from(this.simulatedMmsis).filter((mmsi) => this.vessels.has(mmsi)).length;
    const tankers = Array.from(this.vessels.values()).filter((v) => v.isTanker).length;
    console.log(
      `[AIS stats] total vessels tracked: ${total} | live: ${live} | simulated: ${simulated} | tankers: ${tankers} | ` +
        `PositionReports received: ${this.positionReportCount} | ShipStaticData received: ${this.staticDataCount} | ` +
        `broadcast cap: ${MAX_BROADCAST_VESSELS}`
    );
  }

  getSnapshot() {
    const vessels = Array.from(this.vessels.values()).filter(
      (v) => isTradingVesselType(v.type) || Boolean(v.destination) || Boolean(v.draught)
    );
    return {
      total: vessels.length,
      live: vessels.filter((v) => this.liveMmsis.has(v.mmsi)).length,
      simulated: vessels.filter((v) => this.simulatedMmsis.has(v.mmsi)).length,
      tankers: vessels.filter((v) => v.isTanker).length,
      position_reports_received: this.positionReportCount,
      static_reports_received: this.staticDataCount,
      last_update: vessels.reduce<string | null>((latest, vessel) => {
        if (!latest || vessel.lastUpdate > new Date(latest).getTime()) return new Date(vessel.lastUpdate).toISOString();
        return latest;
      }, null),
      source: process.env.AISSTREAM_API_KEY ? "AISStream + simulator" : "AIS simulator",
    };
  }

  private broadcast() {
    const all = Array.from(this.vessels.values()).filter(
      (v) => isTradingVesselType(v.type) || Boolean(v.destination) || Boolean(v.draught)
    );
    const output =
      all.length > MAX_BROADCAST_VESSELS
        ? [...all].sort((a, b) => b.lastUpdate - a.lastUpdate).slice(0, MAX_BROADCAST_VESSELS)
        : all;

    if (all.length > MAX_BROADCAST_VESSELS && Date.now() - this.lastCapWarningAt > 60000) {
      console.warn(
        `[AIS stats] broadcasting ${MAX_BROADCAST_VESSELS} most recent vessels out of ${all.length} tracked`
      );
      this.lastCapWarningAt = Date.now();
    }

    this.listeners.forEach((fn) => fn(output));
  }

  onUpdate(fn: Listener) {
    this.listeners.push(fn);
  }
}

export const aisStreamService = new AisStreamService();
