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
  isTanker: boolean;
  lastUpdate: number;
}

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

export const useVesselStream = () => {
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;
    socket.on("vessels:update", (data: Vessel[]) => setVessels(data));
    return () => {
      socket.disconnect();
    };
  }, []);

  return vessels;
};