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
        You are a geopolitical intelligence extraction engine.
        Extract structured information from news text about countries, corridors, events, severity, actors, summary, confidence, and affected routes.
        Return JSON only.
        Do not wrap the output in markdown fences.
        Do not add commentary, prose, labels, or explanations.
        Use this exact schema:
        {
          "items": [
            {
              "country": "string",
              "corridor": "string",
              "event": "string",
              "severity": "low|medium|high|critical",
              "actors": ["string"],
              "summary": "string",
              "confidence": 0.0,
              "affectedRoutes": ["string"]
            }
          ]
        }
        """
    ).strip()

    user_prompt = "\n".join(
        [
            "Extract geopolitical intelligence from the following article.",
            f"Source: {source}",
            f"PublishedAt: {published_at}",
            f"Title: {title}",
            f"Description: {description}",
            f"Content: {content}",
            "Return JSON only.",
        ]
    )

    return f"SYSTEM: {system_prompt}\n\nUSER: {user_prompt}"

