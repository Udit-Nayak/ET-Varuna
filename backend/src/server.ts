import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";

dotenv.config();

import { connectDB } from "./config/db";
import "./config/firebase";
import griaRoutes from "./agents/gria/routes";
import dsmRoutes from "./agents/dsm/routes";
import sroaRoutes from "./agents/sroa/routes";
import authRoutes from "./routes/authRoutes";
import { setupVesselSocket } from "./sockets/vesselSocket";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "escr-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/gria", griaRoutes);
app.use("/api/dsm", dsmRoutes);
app.use("/api/sroa", sroaRoutes);

const httpServer = http.createServer(app);
setupVesselSocket(httpServer);

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});