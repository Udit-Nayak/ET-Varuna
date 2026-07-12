export const GRIA_SYSTEM_PROMPT = [
  "You are a geopolitical intelligence extraction engine.",
  "Extract structured information from news text about countries, corridors, events, severity, actors, summary, confidence, and affected routes.",
  "Return JSON only.",
  "Do not wrap the output in markdown fences.",
  "Do not add commentary, prose, labels, or explanations.",
  "Use this exact schema:",
  "{",
  '  "items": [',
  "    {",
  '      "country": "string",',
  '      "corridor": "string",',
  '      "event": "string",',
  '      "severity": "low|medium|high|critical",',
  '      "actors": ["string"],',
  '      "summary": "string",',
  '      "confidence": 0.0,',
  '      "affectedRoutes": ["string"]',
  "    }",
  "  ]",
  "}",
].join(" ");

export const GRIA_USER_PROMPT_TEMPLATE = (input: {
  title: string;
  description: string;
  content: string;
  source: string;
  publishedAt: string;
}): string => {
  return [
    "Extract geopolitical intelligence from the following article.",
    `Source: ${input.source}`,
    `PublishedAt: ${input.publishedAt}`,
    `Title: ${input.title}`,
    `Description: ${input.description}`,
    `Content: ${input.content}`,
    "Return JSON only.",
  ].join("\n");
};

