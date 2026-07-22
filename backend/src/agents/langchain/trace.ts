export interface VarunaTraceMeta {
  workflow?: string;
  step?: string;
  status?: "start" | "success" | "fallback" | "error";
  details?: Record<string, unknown>;
}

const tracingEnabled = (): boolean =>
  process.env.Varuna_LANGCHAIN_TRACE === "true" || process.env.LANGSMITH_TRACING === "true";

export const traceVarunaStep = (meta: VarunaTraceMeta): void => {
  if (!tracingEnabled()) return;
  console.log("[Varuna LangChain trace]", {
    at: new Date().toISOString(),
    ...meta,
  });
};

export const traceDuration = async <T>(meta: Omit<VarunaTraceMeta, "status" | "details">, work: () => Promise<T>): Promise<T> => {
  const startedAt = Date.now();
  traceVarunaStep({ ...meta, status: "start" });
  try {
    const result = await work();
    traceVarunaStep({ ...meta, status: "success", details: { durationMs: Date.now() - startedAt } });
    return result;
  } catch (error) {
    traceVarunaStep({
      ...meta,
      status: "error",
      details: { durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) },
    });
    throw error;
  }
};
