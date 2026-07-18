import { Request, Response } from "express";
import { getDsmMock, retrieveDsmContext, runDsmWorkflow } from "./service";

const handleError = (res: Response, error: unknown, message: string): void => {
  const detail = error instanceof Error ? error.message : String(error);
  res.status(400).json({ error: message, detail });
};

export const simulate = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await runDsmWorkflow(req.body);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to run DSM workflow");
  }
};

export const run = async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await runDsmWorkflow(req.body);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to run DSM workflow");
  }
};

export const mock = async (req: Request, res: Response): Promise<void> => {
  try {
    const corridor = req.params.corridor ?? String(req.query.corridor ?? "Red Sea");
    const result = await getDsmMock(corridor);
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to build DSM mock simulation");
  }
};

export const context = async (req: Request, res: Response): Promise<void> => {
  try {
    const corridor = String(req.query.corridor ?? req.params.corridor ?? "");
    if (!corridor) {
      res.status(400).json({ error: "corridor query parameter is required" });
      return;
    }
    const keywords = typeof req.query.keywords === "string" ? req.query.keywords.split(",").map((item) => item.trim()) : [];
    const result = await retrieveDsmContext({
      corridor,
      scenario_text: typeof req.query.scenario_text === "string" ? req.query.scenario_text : undefined,
      vector_query: typeof req.query.vector_query === "string" ? req.query.vector_query : undefined,
      keywords,
      source_article_id: typeof req.query.source_article_id === "string" ? req.query.source_article_id : undefined,
      event_id: typeof req.query.event_id === "string" ? req.query.event_id : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    handleError(res, error, "Failed to retrieve DSM context");
  }
};
