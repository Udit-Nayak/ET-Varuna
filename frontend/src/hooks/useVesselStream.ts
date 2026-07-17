import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

export interface Vessel {
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

export type StreamStatus = "connecting" | "live" | "reconnecting" | "offline";

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export const useVesselStream = () => {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    socket.on("connect", () => setStatus("live"));
    socket.on("disconnect", () => setStatus("offline"));
    socket.on("reconnect_attempt", () => setStatus("reconnecting"));
    socket.on("vessels:update", (data: Vessel[]) => {
      setVessels(data);
      setStatus("live");
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return { vessels, status };
};