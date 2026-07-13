import { Server as HttpServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { aisStreamService } from "../services/aisStreamService";

export const setupVesselSocket = (httpServer: HttpServer) => {
  const io = new SocketIOServer(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" },
  });

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);
  });

  aisStreamService.onUpdate((vessels) => {
    io.emit("vessels:update", vessels);
  });

  return io;
};