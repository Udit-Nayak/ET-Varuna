import { Request, Response } from "express";
import { answerAgentChat, formatAgentOutput, AgentOutputFormatTarget } from "./service";

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

export const formatAgentOutputController = async (req: Request, res: Response): Promise<void> => {
  try {
    const agent = String(req.body?.agent ?? "").toLowerCase() as AgentOutputFormatTarget;
    if (agent !== "dsm" && agent !== "sroa" && agent !== "apo") {
      res.status(400).json({ error: "agent must be dsm, sroa, or apo" });
      return;
    }

    const payload = req.body?.payload;
    if (!payload || typeof payload !== "object") {
      res.status(400).json({ error: "payload is required" });
      return;
    }

    const result = await formatAgentOutput(agent, payload);
    res.status(200).json(result);
  } catch (error) {
    console.error("Failed to format agent output", error);
    res.status(500).json({
      error: "Failed to format agent output",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
