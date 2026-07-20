import { Router, type Request, type Response } from "express";
import mongoose from "mongoose";

const router = Router();
const COLLECTION_NAME = "nationalStateHistory";

const collection = () => {
  const database = mongoose.connection.db;
  if (!database) {
    throw new Error("MongoDB is not connected");
  }
  return database.collection(COLLECTION_NAME);
};

const historyLimit = (value: unknown): number => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 60) : 12;
};

router.get("/latest", async (_req: Request, res: Response): Promise<void> => {
  try {
    const [latest] = await collection().find({}).sort({ month: -1 }).limit(1).toArray();
    res.status(200).json(latest ?? null);
  } catch (error) {
    console.error("Failed to fetch latest TFM national state", error);
    res.status(500).json({ error: "Failed to fetch latest TFM national state" });
  }
});

router.get("/history", async (req: Request, res: Response): Promise<void> => {
  try {
    const history = await collection().find({}).sort({ month: 1 }).limit(historyLimit(req.query.limit)).toArray();
    res.status(200).json(history);
  } catch (error) {
    console.error("Failed to fetch TFM national state history", error);
    res.status(500).json({ error: "Failed to fetch TFM national state history" });
  }
});

export default router;
