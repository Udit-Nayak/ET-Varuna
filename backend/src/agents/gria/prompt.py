from __future__ import annotations

from textwrap import dedent
from typing import Any, Mapping


def build_prompt(article: Mapping[str, Any]) -> str:
    title = str(article.get("title", "")).strip()
    description = str(article.get("description", "")).strip()
    content = str(article.get("content", "")).strip()
    source = str(article.get("source", "")).strip()
    published_at = str(article.get("publishedAt", "")).strip()

    system_prompt = dedent(
        """
        You are a geopolitical intelligence analysis engine.
        Analyze the article for geopolitical and macroeconomic relevance only.
        Return ONLY valid JSON matching the exact schema below.
        Do not wrap output in markdown fences.
        Do not include commentary, explanations, code blocks, or trailing text.
        If a field is unknown, use an empty string, empty array, false, or 0 as appropriate.
        Schema:
        {
          "countriesInvolved": ["string"],
          "relationWithIndia": "string",
          "oilPetroleumImpact": "string",
          "financeEconomicImpact": "string",
          "shippingMaritimeImpact": "string",
          "tradeCorridorsAffected": ["string"],
          "eventType": "string",
          "severity": "low|medium|high|critical",
          "confidence": 0.0,
          "shortSummary": "string",
          "longTermImplications": "string",
          "isPermanent": true
        }
        """
    ).strip()

    user_prompt = "\n".join(
        [
            "Analyze the following article and return only the JSON object.",
            f"Source: {source}",
            f"PublishedAt: {published_at}",
            f"Title: {title}",
            f"Description: {description}",
            f"Content: {content}",
        ]
    )

    return f"SYSTEM: {system_prompt}\n\nUSER: {user_prompt}"
