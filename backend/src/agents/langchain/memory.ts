import { ChatMessageDocument } from "../../models/ChatSession";
import { invokeGroqChatWithLangChain, SENTRIX_GROQ_MODEL } from "./llm";

export interface ChatMemorySummaryResult {
  summary: string | null;
  provider: "langchain-groq" | "deterministic" | "disabled";
  generatedAt: string | null;
}

const enabled = (): boolean => process.env.SENTRIX_CHAT_MEMORY_SUMMARY_ENABLED !== "false";

const deterministicSummary = (messages: ChatMessageDocument[]): string | null => {
  const userQuestions = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content.trim())
    .filter(Boolean)
    .slice(-6);
  if (userQuestions.length === 0) return null;
  return `Recent operator questions: ${userQuestions.join(" | ")}`;
};

export const summarizeChatMemory = async (messages: ChatMessageDocument[]): Promise<ChatMemorySummaryResult> => {
  if (!enabled() || messages.length < Number(process.env.SENTRIX_CHAT_MEMORY_MIN_MESSAGES ?? 12)) {
    return { summary: null, provider: "disabled", generatedAt: null };
  }

  const compactTranscript = messages
    .slice(-24)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n")
    .slice(0, 16000);

  const result = await invokeGroqChatWithLangChain({
    model: process.env.GROQ_MODEL || SENTRIX_GROQ_MODEL,
    maxOutputTokens: 350,
    temperature: 0.1,
    traceName: "chat-memory-summary",
    systemInstruction: [
      "Summarize Sentrix chat history for future context compression.",
      "Do not add new facts. Use only the transcript.",
      "Keep exact corridors, durations, agent outputs, reserve numbers, procurement route names, and unresolved operator questions when present.",
      "Return a compact paragraph plus any open follow-up question.",
    ].join(" "),
    prompt: compactTranscript,
  });

  const fallback = deterministicSummary(messages);
  return {
    summary: result?.text || fallback,
    provider: result?.text ? "langchain-groq" : fallback ? "deterministic" : "disabled",
    generatedAt: result?.text || fallback ? new Date().toISOString() : null,
  };
};
