import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

import { connectDB } from "./config/db";
import "./config/firebase"; // initializes firebase-admin on import
import authRoutes from "./routes/authRoutes";
import griaRoutes from "./agents/gria/routes";
import { bootstrapGria } from "./agents/gria/bootstrap";
import nationalStateRoutes from "./agents/shared/nationalStateRoutes";


const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "escr-backend" });
});

app.use("/api/auth", authRoutes);
app.use("/api/gria", griaRoutes);
app.use("/api", nationalStateRoutes);

// Module routers get mounted here as each teammate builds their layer, e.g.:
// app.use("/api/gria", griaRoutes);
// app.use("/api/dsm", dsmRoutes);
// app.use("/api/apo", apoRoutes);
// app.use("/api/sroa", sroaRoutes);
// app.use("/api/scdt", scdtRoutes);

const startServer = async (): Promise<void> => {
  await connectDB();
  await bootstrapGria();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
};

startServer().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
