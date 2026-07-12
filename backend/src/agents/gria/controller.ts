import { Request, Response } from "express";
import {
  analyzeNews as analyzeNewsService,
  deleteArticle as deleteArticleService,
  fetchLatestNews as fetchLatestNewsService,
  getArticleById as getArticleByIdService,
  getHistory as getHistoryService,
  getLatestIntelligence as getLatestIntelligenceService,
  getRiskDashboard as getRiskDashboardService,
  runPipeline as runPipelineService,
} from "./service";

const handleError = (res: Response, error: unknown, message: string): void => {
  console.error(message, error);
  res.status(500).json({ error: message });
};

export const analyzeNews = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await analyzeNewsService(req.body);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to analyze news");
  }
};

export const fetchLatestNews = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await fetchLatestNewsService(req.body);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch latest news");
  }
};

export const runPipeline = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await runPipelineService(req.body);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to run GRIA pipeline");
  }
};

export const getLatestIntelligence = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await getLatestIntelligenceService();
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch latest intelligence");
  }
};

export const getHistory = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await getHistoryService();
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch history");
  }
};

export const getRiskDashboard = async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await getRiskDashboardService();
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch risk dashboard");
  }
};

export const getArticleById = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await getArticleByIdService(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to fetch article");
  }
};

export const deleteArticle = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await deleteArticleService(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to delete article");
  }
};
