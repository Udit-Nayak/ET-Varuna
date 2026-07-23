type DynamicImport = <T = any>(specifier: string) => Promise<T>;

const dynamicImport = new Function("specifier", "return import(specifier)") as DynamicImport;

export const Varuna_GROQ_MODEL = "llama-3.1-8b-instant";

export interface LangChainGroqChatOptions {
  prompt: string;
  systemInstruction: string;
  maxOutputTokens?: number;
  model?: string;
  temperature?: number;
  responseFormat?: "json_object";
  timeoutMs?: number;
  maxRetries?: number;
  traceName?: string;
}

export interface LangChainGroqChatResult {
  text: string;
  provider: "langchain-groq";
  model: string;
}

const langChainEnabled = (): boolean => process.env.AIS_SIMULATION_ENABLED !== "false";

const extractMessageText = (content: unknown): string => {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) return String((part as { text?: unknown }).text ?? "");
        return "";
      })
      .join("")
      .trim();
  }
  return "";
};

export const invokeGroqChatWithLangChain = async (
  options: LangChainGroqChatOptions
): Promise<LangChainGroqChatResult | null> => {
  if (!langChainEnabled() || !process.env.GROQ_API_KEY) return null;

  try {
    const imported = await dynamicImport<{ ChatGroq?: new (args: Record<string, unknown>) => any }>("@langchain/groq");
    if (!imported.ChatGroq) return null;

    const modelName = options.model || process.env.GROQ_MODEL || Varuna_GROQ_MODEL;
    const llm = new imported.ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: modelName,
      temperature: options.temperature ?? 0.25,
      maxTokens: options.maxOutputTokens,
      maxRetries: options.maxRetries ?? 1,
      timeout: options.timeoutMs ?? Number(process.env.GROQ_TIMEOUT_MS ?? 30000),
    });

    const callOptions = options.responseFormat ? { response_format: { type: options.responseFormat } } : undefined;
    const message = await llm.invoke(
      [
        { role: "system", content: options.systemInstruction },
        { role: "user", content: options.prompt },
      ],
      callOptions
    );
    const text = extractMessageText(message?.content);
    return text ? { text, provider: "langchain-groq", model: modelName } : null;
  } catch (error) {
    if (process.env.AIS_SIMULATION_ENABLED === "true") {
      console.warn(
        "[LangChain] Groq wrapper unavailable, falling back:",
        error instanceof Error ? error.message : error
      );
    }
    return null;
  }
};
