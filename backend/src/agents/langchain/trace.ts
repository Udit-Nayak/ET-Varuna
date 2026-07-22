export interface SentrixTraceMeta {
  workflow?: string;
  step?: string;
  status?: "start" | "success" | "fallback" | "error";
  details?: Record<string, unknown>;
}

const tracingEnabled = (): boolean =>
  process.env.SENTRIX_LANGCHAIN_TRACE === "true" || process.env.LANGSMITH_TRACING === "true";

export const traceSentrixStep = (meta: SentrixTraceMeta): void => {
  if (!tracingEnabled()) return;
  console.log("[Sentrix LangChain trace]", {
    at: new Date().toISOString(),
    ...meta,
  });
};

export const traceDuration = async <T>(meta: Omit<SentrixTraceMeta, "status" | "details">, work: () => Promise<T>): Promise<T> => {
  const startedAt = Date.now();
  traceSentrixStep({ ...meta, status: "start" });
  try {
    const result = await work();
    traceSentrixStep({ ...meta, status: "success", details: { durationMs: Date.now() - startedAt } });
    return result;
  } catch (error) {
    traceSentrixStep({
      ...meta,
      status: "error",
      details: { durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
};
