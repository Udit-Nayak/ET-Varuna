import os
from datetime import datetime, timedelta

import trafilatura
from fastapi import FastAPI, HTTPException
import requests
from dotenv import load_dotenv


load_dotenv()

app = FastAPI()
NEWS_API_URL = "https://newsapi.org/v2/everything"

CORRIDORS = {
    "Hormuz": ["Strait of Hormuz", "Hormuz oil", "Hormuz tanker"],
    "Red Sea": ["Red Sea shipping", "Houthi attack", '"Bab-el-Mandeb"'],
    "Malacca": ["Strait of Malacca", "Malacca shipping"],
}
CACHE_TTL = timedelta(minutes=10)
CONTEXT_CACHE = {}


def get_corridor_context(keywords, start_date, end_date, max_articles=15):
    api_key = os.getenv("NEWSAPI_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="NEWSAPI_KEY is not configured for Signal Watcher.",
        )

    query = " OR ".join(f'"{keyword.strip(chr(34))}"' for keyword in keywords)

    try:
        response = requests.get(
            NEWS_API_URL,
            params={
                "q": query,
                "from": start_date,
                "to": end_date,
                "language": "en",
                "sortBy": "publishedAt",
                "pageSize": max_articles,
            },
            headers={"X-Api-Key": api_key},
            timeout=20,
        )
    except requests.RequestException as error:
        raise HTTPException(
            status_code=502,
            detail="Unable to retrieve articles from NewsAPI.",
        ) from error

    if response.status_code == 429:
        raise HTTPException(
            status_code=429,
            detail="NewsAPI rate limit reached. Please retry shortly.",
        )
    if not response.ok:
        error_message = response.json().get("message", "NewsAPI request failed.")
        raise HTTPException(
            status_code=response.status_code,
            detail=error_message,
        )

    payload = response.json()
    if payload.get("status") != "ok":
        raise HTTPException(
            status_code=502,
            detail=payload.get("message", "NewsAPI returned an invalid response."),
        )

    context_items = []
    for article in payload.get("articles", []):
        text = None
        try:
            downloaded = trafilatura.fetch_url(article["url"])
            if downloaded:
                text = trafilatura.extract(downloaded)
        except Exception:
            pass

        context_items.append(
            {
                "source": article.get("source", {}).get("name", "Unknown source"),
                "date": article.get("publishedAt"),
                "title": article.get("title"),
                "url": article.get("url"),
                "text": text or article.get("content") or article.get("description") or article.get("title"),
                "scraped": bool(text),
            }
        )

    return context_items


@app.get("/signal-watcher/{corridor}")
def signal_watcher(corridor: str):
    if corridor not in CORRIDORS:
        return {"error": "Unknown corridor"}

    now = datetime.utcnow()
    cached = CONTEXT_CACHE.get(corridor)
    if cached and now - cached["fetched_at"] < CACHE_TTL:
        return {"corridor": corridor, "items": cached["items"], "cached": True}

    end_date = now.strftime("%Y-%m-%d")
    start_date = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    items = get_corridor_context(CORRIDORS[corridor], start_date, end_date)
    CONTEXT_CACHE[corridor] = {"fetched_at": now, "items": items}

    return {
        "corridor": corridor,
        "items": items,
        "cached": False,
    }
