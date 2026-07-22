export const promptBlock = (parts: string[]): string => parts.filter(Boolean).join(" ");

export const sentrixJsonInstruction = (shape: string): string =>
  [
    "Return JSON only.",
    "Do not include markdown fences unless unavoidable.",
    "If a field cannot be inferred, use the provided fallback value or a conservative empty value.",
    `Expected shape: ${shape}`,
  ].join(" ");
