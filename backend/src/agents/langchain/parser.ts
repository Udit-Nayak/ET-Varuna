export type FieldValidator<T> = (value: unknown, fallback: T) => T;
type DynamicImport = <T = any>(specifier: string) => Promise<T>;

const dynamicImport = new Function("specifier", "return import(specifier)") as DynamicImport;

export type ObjectSchema<T extends object> = {
  [K in keyof T]: FieldValidator<T[K]>;
};

export const extractJsonObject = <T>(text: string): T | null => {
  try {
    const jsonText = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
    return JSON.parse(jsonText) as T;
  } catch {
    return null;
  }
};

export const validateObject = <T extends object>(
  candidate: Partial<T> | null | undefined,
  fallback: T,
  schema: ObjectSchema<T>
): T => {
  if (!candidate || typeof candidate !== "object") return fallback;
  const output = { ...fallback } as T;
  for (const key of Object.keys(schema) as Array<keyof T>) {
    output[key] = schema[key](candidate[key], fallback[key]);
  }
  return output;
};

export const asString = (value: unknown, fallback: string): string => {
  const text = String(value ?? "").trim();
  return text || fallback;
};

export const asStringArray = (value: unknown, fallback: string[]): string[] =>
  Array.isArray(value) && value.length > 0
    ? Array.from(new Set(value.map(String).map((item) => item.trim()).filter(Boolean)))
    : fallback;

export const asNumberRange = (min: number, max: number, round = false) =>
  (value: unknown, fallback: number): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    const clamped = Math.min(max, Math.max(min, numeric));
    return round ? Math.round(clamped) : clamped;
  };

export const asEnum = <T extends string>(allowed: readonly T[]) =>
  (value: unknown, fallback: T): T => {
    return allowed.includes(value as T) ? (value as T) : fallback;
  };

export const safeParseWithOptionalZod = async <T>(
  schemaFactory: (zod: any) => { safeParse: (value: unknown) => { success: boolean; data?: T } },
  value: unknown
): Promise<T | null> => {
  try {
    const zod = await dynamicImport("zod");
    const schema = schemaFactory(zod);
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed.data ?? null : null;
  } catch {
    return null;
  }
};
