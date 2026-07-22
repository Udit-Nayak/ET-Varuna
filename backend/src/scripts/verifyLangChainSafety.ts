import { ChatMessageDocument } from "../models/ChatSession";
import { Varuna_GROQ_MODEL, invokeGroqChatWithLangChain } from "../agents/langchain/llm";
import {
  asEnum,
  asNumberRange,
  asString,
  asStringArray,
  extractJsonObject,
  safeParseWithOptionalZod,
  validateObject,
} from "../agents/langchain/parser";
import { promptBlock, VarunaJsonInstruction } from "../agents/langchain/promptTemplates";
import { summarizeChatMemory } from "../agents/langchain/memory";
import { getOptionalLangChainTools, getVarunaToolDefinitions } from "../agents/langchain/tools";

interface NormalizationSmoke {
  normalizedQuery: string;
  userIntent: "corridor_risk" | "scenario_analysis" | "reserve_planning" | "procurement" | "general";
  corridor: string;
  keywords: string[];
  scenarioText: string;
  tensionPct: number;
  durationDays: number;
  policy: "conservative" | "balanced" | "aggressive";
}

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const run = async (): Promise<void> => {
  process.env.LANGCHAIN_ENABLED = "false";
  process.env.Varuna_CHAT_MEMORY_SUMMARY_ENABLED = "true";
  process.env.Varuna_CHAT_MEMORY_MIN_MESSAGES = "2";

  assert(Varuna_GROQ_MODEL === "llama-3.1-8b-instant", "Groq model must stay llama-3.1-8b-instant");

  const langChainDisabled = await invokeGroqChatWithLangChain({
    prompt: "hello",
    systemInstruction: "Return one word.",
    maxOutputTokens: 8,
  });
  assert(langChainDisabled === null, "LangChain wrapper should return null when disabled");

  const parsed = extractJsonObject<Partial<NormalizationSmoke>>(
    '```json\n{"normalizedQuery":"Malacca closed for 14 days","userIntent":"scenario_analysis","corridor":"Strait of Malacca","keywords":["India","oil"],"scenarioText":"Analyze Malacca closure.","tensionPct":78,"durationDays":14,"policy":"aggressive"}\n```'
  );

  const fallback: NormalizationSmoke = {
    normalizedQuery: "fallback",
    userIntent: "general",
    corridor: "general maritime corridor",
    keywords: ["India", "oil"],
    scenarioText: "fallback scenario",
    tensionPct: 35,
    durationDays: 14,
    policy: "balanced",
  };

  const validated = validateObject<NormalizationSmoke>(parsed, fallback, {
    normalizedQuery: asString,
    userIntent: asEnum(["corridor_risk", "scenario_analysis", "reserve_planning", "procurement", "general"] as const),
    corridor: asString,
    keywords: asStringArray,
    scenarioText: asString,
    tensionPct: asNumberRange(0, 100),
    durationDays: asNumberRange(1, 90, true),
    policy: asEnum(["conservative", "balanced", "aggressive"] as const),
  });
  assert(validated.corridor === "Strait of Malacca", "Structured parser should preserve valid corridor");
  assert(validated.durationDays === 14, "Structured parser should preserve valid duration");

  const zodParsed = await safeParseWithOptionalZod<Pick<NormalizationSmoke, "normalizedQuery">>((zod) => {
    const z = zod.z ?? zod;
    return z.object({ normalizedQuery: z.string().min(1) });
  }, { normalizedQuery: "Hormuz risk" });
  if (zodParsed) assert(zodParsed.normalizedQuery === "Hormuz risk", "Optional Zod parser returned unexpected data");

  const prompt = promptBlock(["A", VarunaJsonInstruction("{ ok: boolean }")]);
  assert(prompt.includes("Return JSON only"), "Prompt helper should include JSON instruction");

  const messages: ChatMessageDocument[] = [
    { id: "1", role: "user", content: "malacca closed for 2 days", status: "done", timestamp: Date.now() - 1000 },
    { id: "2", role: "system", content: "Answer for: malacca closed for 2 days", status: "done", timestamp: Date.now() },
  ];
  const summary = await summarizeChatMemory(messages);
  assert(summary.provider === "deterministic", "Memory summary should use deterministic fallback when LangChain is disabled");
  assert(summary.summary?.includes("malacca closed"), "Memory summary should preserve user question");

  const toolDefinitions = getVarunaToolDefinitions();
  assert(toolDefinitions.length >= 6, "Varuna tool definitions should include all current agents and workflows");
  assert(toolDefinitions.some((tool) => tool.name === "gria_retrieve"), "Tool definitions should include GRIA");
  assert(toolDefinitions.some((tool) => tool.name === "tfm_snapshot"), "Tool definitions should include TFM digital twin");

  const optionalTools = await getOptionalLangChainTools();
  assert(Array.isArray(optionalTools), "Optional LangChain tools should return an array even when package is absent");

  console.log("[LangChain safety] smoke verification passed", {
    model: Varuna_GROQ_MODEL,
    toolDefinitions: toolDefinitions.map((tool) => tool.name),
    optionalToolsLoaded: optionalTools.length,
    memoryProvider: summary.provider,
  });
};

run().catch((error) => {
  console.error("[LangChain safety] verification failed", error);
  process.exit(1);
});
