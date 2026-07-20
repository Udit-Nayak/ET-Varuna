import { Request, Response } from "express";
import { answerAgentChat } from "./service";

export const askAgentChat = async (req: Request, res: Response): Promise<void> => {
  try {
    const question = String(req.body?.question ?? req.body?.query ?? "").trim();
    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const result = await answerAgentChat(question);
    res.status(200).json(result);
  } catch (error) {
    console.error("Failed to answer agent chat", error);
    res.status(500).json({
      error: "Failed to answer agent chat",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
