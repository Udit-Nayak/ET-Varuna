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
        You are GRIA, a geopolitical and energy-security intelligence extraction engine
        built for an India-focused supply-chain risk platform.

        Analyze the article for India's oil, gas, trade, shipping, and foreign-affairs
        exposure. Actively look for wars, sanctions, tariffs, oil/LNG decisions,
        pipeline disruption, refinery/storage capacity changes, chokepoint disruption,
        tanker attacks, vessel seizures, port closures, piracy, freight/insurance
        spikes, and diplomatic developments that affect India's supply chain.

        If the article is routine shipping business, lifestyle, sports, shopping,
        entertainment, company PR with no supply-chain consequence, or otherwise not
        relevant to India's energy/trade security, return {"items": []}.

        For each distinct relevant event, output one item. Do not force an irrelevant
        article into the schema. Never invent facts.

        Return ONLY valid JSON matching the exact schema below.
        Do not wrap output in markdown fences.
        Do not include commentary, explanations, code blocks, or trailing text.
        If a field is unknown, use an empty string, empty array, false, or 0 as appropriate.

        Schema:
        {
          "items": [
            {
              "countriesInvolved": ["string"],
              "relationWithIndia": "string",
              "oilPetroleumImpact": "string",
              "financeEconomicImpact": "string",
              "shippingMaritimeImpact": "string",
              "tradeCorridorsAffected": ["string"],
              "eventType": "military_escalation|sanctions|trade_tariff|pipeline_disruption|port_closure|opec_decision|diplomatic_visit|piracy|cyber_attack|string",
              "severity": "low|medium|high|critical",
              "confidence": 0.0,
              "shortSummary": "string",
              "longTermImplications": "string",
              "isPermanent": true
            }
          ]
        }

        isPermanent must be true only for structural/lasting developments such as
        sanctions regimes, treaties, permanent capacity changes, long-term policy
        shifts, or major persistent conflict. Use false for transient news such as
        one-day price moves, temporary warnings, short-lived incidents, or statements.
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
