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
  isTanker: boolean;
  lastUpdate: number;
}

type Listener = (vessels: VesselState[]) => void;

const AIS_URL = "wss://stream.aisstream.io/v0/stream";

// Red Sea + Persian Gulf/Hormuz + Arabian Sea + Bay of Bengal.
// Format per AISStream docs: [[[lat1, lon1], [lat2, lon2]]]
const BOUNDING_BOXES = [[[0, 30], [30, 100]]];

// TEMP DEBUG SWITCH — set to false once you confirm tankers are flowing,
// to go back to tanker-only filtering for the demo.
const DEBUG_SHOW_ALL_VESSELS = true;

const isTankerType = (type?: number) => type !== undefined && type >= 80 && type <= 89;

const STALE_MS = 15 * 60 * 1000;
const BROADCAST_INTERVAL_MS = 4000;

class AisStreamService {
  private vessels = new Map<number, VesselState>();
  private listeners: Listener[] = [];
  private ws: WebSocket | null = null;
  private reconnectDelay = 2000;

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
          FilterMessageTypes: ["PositionReport", "ShipStaticData"],
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

    if (msg.MessageType === "PositionReport") {
      this.positionReportCount++;
      const pr = msg.Message.PositionReport;
      this.vessels.set(mmsi, {
        mmsi,
        lat: pr.Latitude,
        lon: pr.Longitude,
        cog: pr.Cog,
        sog: pr.Sog,
        heading: pr.TrueHeading,
        name: existing?.name ?? msg.MetaData.ShipName?.trim(),
        type: existing?.type,
        isTanker: existing?.isTanker ?? false,
        lastUpdate: Date.now(),
      });
    }

    if (msg.MessageType === "ShipStaticData") {
      this.staticDataCount++;
      const sd = msg.Message.ShipStaticData;
      this.vessels.set(mmsi, {
        mmsi,
        lat: existing?.lat ?? msg.MetaData.Latitude,
        lon: existing?.lon ?? msg.MetaData.Longitude,
        cog: existing?.cog,
        sog: existing?.sog,
        heading: existing?.heading,
        name: sd.Name?.trim() || existing?.name,
        type: sd.Type,
        isTanker: isTankerType(sd.Type),
        lastUpdate: existing?.lastUpdate ?? Date.now(),
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
        `PositionReports received: ${this.positionReportCount} | ShipStaticData received: ${this.staticDataCount}`
    );
  }

  private broadcast() {
    const all = Array.from(this.vessels.values());
    const output = DEBUG_SHOW_ALL_VESSELS ? all : all.filter((v) => v.isTanker);
    this.listeners.forEach((fn) => fn(output));
  }

  onUpdate(fn: Listener) {
    this.listeners.push(fn);
  }
}

export const aisStreamService = new AisStreamService();