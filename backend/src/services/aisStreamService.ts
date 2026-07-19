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

class AisStreamService {
  private vessels = new Map<number, VesselState>();
  private staticDataByMmsi = new Map<number, StaticVesselData>();
  private listeners: Listener[] = [];
  private ws: WebSocket | null = null;
  private reconnectDelay = 2000;
  private lastCapWarningAt = 0;

  // diagnostics
  private positionReportCount = 0;
  private staticDataCount = 0;

  start() {
    const apiKey = process.env.AISSTREAM_API_KEY;
    if (!apiKey) {
      console.warn("AISSTREAM_API_KEY not set — live vessel streaming disabled.");
      return;
    }
    this.connect(apiKey);
    setInterval(() => this.broadcast(), BROADCAST_INTERVAL_MS);
    setInterval(() => this.cleanupStale(), 60000);
    setInterval(() => this.logStats(), 15000);
  }

  private connect(apiKey: string) {
    this.ws = new WebSocket(AIS_URL);

    this.ws.on("open", () => {
      console.log("AISStream connected");
      this.reconnectDelay = 2000;
      this.ws?.send(
        JSON.stringify({
          APIKey: apiKey,
          BoundingBoxes: BOUNDING_BOXES,
          FilterMessageTypes: [...POSITION_MESSAGE_TYPES, ...STATIC_MESSAGE_TYPES],
        })
      );
    });

    this.ws.on("message", (data) => {
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

    this.ws.on("close", (code, reason) => {
      console.warn(
        `AISStream disconnected (code ${code}, reason: ${reason || "none"}) — retrying in ${this.reconnectDelay}ms`
      );
      setTimeout(() => this.connect(apiKey), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
    });

    this.ws.on("error", (err) => {
      console.error("AISStream error:", err.message);
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
      if (now - v.lastUpdate > STALE_MS) this.vessels.delete(mmsi);
    }
  }

  private logStats() {
    const total = this.vessels.size;
    const tankers = Array.from(this.vessels.values()).filter((v) => v.isTanker).length;
    console.log(
      `[AIS stats] total vessels tracked: ${total} | tankers: ${tankers} | ` +
        `PositionReports received: ${this.positionReportCount} | ShipStaticData received: ${this.staticDataCount} | ` +
        `broadcast cap: ${MAX_BROADCAST_VESSELS}`
    );
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
