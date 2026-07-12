import { Router } from "express";
import {
  analyzeNews,
  deleteArticle,
  fetchLatestNews,
  getArticleById,
  getHistory,
  getLatestIntelligence,
  getRiskDashboard,
  runPipeline,
} from "./controller";

const router = Router();

router.post("/analyze", analyzeNews);
router.post("/fetch-news", fetchLatestNews);
router.post("/run", runPipeline);
router.get("/latest", getLatestIntelligence);
router.get("/history", getHistory);
router.get("/risk", getRiskDashboard);
router.get("/:id", getArticleById);
router.delete("/:id", deleteArticle);

export default router;
