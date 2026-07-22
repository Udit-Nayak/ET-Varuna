import { Request, Response } from "express";
import ChatSession, { ChatMemorySummaryDocument, ChatMessageDocument, ChatMessageRole, ChatMessageStatus } from "../../models/ChatSession";
import { AuthedRequest } from "../../middleware/verifyFirebaseToken";
import { summarizeChatMemory } from "../langchain/memory";
import {
  answerAgentChat,
  answerAgentOutputQuestion,
  answerDirectChatbot,
  formatAgentOutput,
  AgentOutputFormatTarget,
  AgentQuestionTarget,
} from "./service";

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

export const askDirectChatbot = async (req: Request, res: Response): Promise<void> => {
  try {
    const question = String(req.body?.question ?? req.body?.query ?? "").trim();
    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const result = await answerDirectChatbot(question);
    res.status(200).json(result);
  } catch (error) {
    console.error("Failed to answer direct chatbot", error);
    res.status(500).json({
      error: "Failed to answer direct chatbot",
      detail: error instanceof Error ? error.message : "Unknown error",
    });
  }
};


export const askAgentOutputQuestionController = async (req: Request, res: Response): Promise<void> => {
  try {
    const agent = String(req.body?.agent ?? "").toLowerCase() as AgentQuestionTarget;
    if (agent !== "dsm" && agent !== "sroa" && agent !== "apo" && agent !== "tfm") {
      res.status(400).json({ error: "agent must be dsm, sroa, apo, or tfm" });
      return;
    }

    const question = String(req.body?.question ?? req.body?.query ?? "").trim();
    if (!question) {
      res.status(400).json({ error: "question is required" });
      return;
    }

    const context = req.body?.context;
    if (!context || typeof context !== "object") {
      res.status(400).json({ error: "context is required" });
      return;
    }

    const result = await answerAgentOutputQuestion(agent, question, context);
    res.status(200).json(result);
  } catch (error) {
    console.error("Failed to answer agent output question", error);
    res.status(500).json({
      error: "Failed to answer agent output question",
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

const titleFromMessages = (messages: Array<{ role?: string; content?: string }> = []): string => {
  const firstUserMessage = messages.find((message) => message.role === "user" && message.content?.trim());
  const source = firstUserMessage?.content?.trim() || "New chat";
  return source.length > 56 ? `${source.slice(0, 53)}...` : source;
};

const cleanMessages = (messages: unknown): ChatMessageDocument[] => {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((message) => {
      const item = message as Record<string, unknown>;
      const role = String(item.role ?? "system");
      const status = String(item.status ?? "done");
      return {
        id: String(item.id ?? ""),
        role,
        content: String(item.content ?? ""),
        status,
        timestamp: Number(item.timestamp ?? Date.now()),
      };
    })
    .filter((message) => message.id && message.content && ["system", "gria", "dsm", "sroa", "apo", "user"].includes(message.role))
    .map((message) => ({
      id: message.id,
      role: message.role as ChatMessageRole,
      content: message.content,
      status: (["pending", "streaming", "done", "error"].includes(message.status) ? message.status : "done") as ChatMessageStatus,
      timestamp: message.timestamp,
    }));
};

const buildMemorySummary = async (messages: ChatMessageDocument[]): Promise<ChatMemorySummaryDocument | undefined> => {
  const result = await summarizeChatMemory(messages);
  if (!result.summary || result.provider === "disabled" || !result.generatedAt) return undefined;
  return {
    summary: result.summary,
    provider: result.provider,
    generatedAt: new Date(result.generatedAt),
    messageCount: messages.length,
  };
};

export const listChatSessions = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const firebaseUid = req.firebaseUser!.uid;
    const sessions = await ChatSession.aggregate([
      { $match: { firebaseUid, archived: false } },
      { $sort: { updatedAt: -1 } },
      { $limit: 50 },
      {
        $project: {
          title: 1,
          createdAt: 1,
          updatedAt: 1,
          messageCount: { $size: "$messages" },
          lastMessage: { $ifNull: [{ $arrayElemAt: ["$messages.content", -1] }, ""] },
        },
      },
    ]);

    res.status(200).json({
      sessions: sessions.map((session) => ({
        id: String(session._id),
        title: session.title,
        lastMessage: session.lastMessage ?? "",
        messageCount: session.messageCount ?? 0,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Failed to list chat sessions", error);
    res.status(500).json({ error: "Failed to list chat sessions" });
  }
};

export const createChatSession = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const firebaseUid = req.firebaseUser!.uid;
    const messages = cleanMessages(req.body?.messages);
    const title = String(req.body?.title ?? "").trim() || titleFromMessages(messages);
    const memorySummary = await buildMemorySummary(messages);
    const session = await ChatSession.create({
      firebaseUid,
      title,
      messages,
      latestWorkflow: req.body?.latestWorkflow ?? null,
      memorySummary: memorySummary ?? null,
      archived: false,
    });

    res.status(201).json({ session });
  } catch (error) {
    console.error("Failed to create chat session", error);
    res.status(500).json({ error: "Failed to create chat session" });
  }
};

export const getChatSession = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const session = await ChatSession.findOne({
      _id: req.params.id,
      firebaseUid: req.firebaseUser!.uid,
      archived: false,
    }).lean();

    if (!session) {
      res.status(404).json({ error: "Chat session not found" });
      return;
    }

    res.status(200).json({ session });
  } catch (error) {
    console.error("Failed to get chat session", error);
    res.status(500).json({ error: "Failed to get chat session" });
  }
};

export const updateChatSession = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const messages = cleanMessages(req.body?.messages);
    const title = String(req.body?.title ?? "").trim() || titleFromMessages(messages);
    const memorySummary = await buildMemorySummary(messages);
    const session = await ChatSession.findOneAndUpdate(
      { _id: req.params.id, firebaseUid: req.firebaseUser!.uid, archived: false },
      {
        $set: {
          title,
          messages,
          latestWorkflow: req.body?.latestWorkflow ?? null,
          ...(memorySummary ? { memorySummary } : {}),
        },
      },
      { new: true }
    );

    if (!session) {
      res.status(404).json({ error: "Chat session not found" });
      return;
    }

    res.status(200).json({ session });
  } catch (error) {
    console.error("Failed to update chat session", error);
    res.status(500).json({ error: "Failed to update chat session" });
  }
};

export const deleteChatSession = async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const session = await ChatSession.findOneAndUpdate(
      { _id: req.params.id, firebaseUid: req.firebaseUser!.uid },
      { $set: { archived: true } },
      { new: true }
    );

    if (!session) {
      res.status(404).json({ error: "Chat session not found" });
      return;
    }

    res.status(200).json({ deleted: true });
  } catch (error) {
    console.error("Failed to delete chat session", error);
    res.status(500).json({ error: "Failed to delete chat session" });
  }
};
