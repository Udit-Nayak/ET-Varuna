from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Mapping

from llama_cpp import Llama

from prompt import build_prompt

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "ai_models" / "gemma-2-2b-it" / "gemma-2-2b-it-Q4_K_M.gguf"

_LLM: Llama | None = None


def get_llm() -> Llama:
    global _LLM
    if _LLM is None:
        print("Loading Gemma model...", file=sys.stderr)
        _LLM = Llama(
            model_path=str(MODEL_PATH),
            n_ctx=4096,
            verbose=False,
        )
        print("Gemma model loaded successfully!", file=sys.stderr)
    return _LLM


def generate(prompt: str) -> str:
    llm = get_llm()
    response = llm(
        prompt,
        max_tokens=512,
        temperature=0.2,
        top_p=0.9,
        stop=["<end_of_turn>"],
    )
    return response["choices"][0]["text"].strip()


def generate_json_from_article(article: Mapping[str, Any]) -> str:
    return generate(build_prompt(article))


def generate_from_article(article: Mapping[str, Any]) -> str:
    return generate_json_from_article(article)


def main() -> None:
    get_llm()

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue

        try:
            payload = json.loads(raw)
            article = payload.get("article")
            prompt = payload.get("prompt")

            if article is not None:
                text = generate_from_article(article)
            elif isinstance(prompt, str) and prompt.strip():
                text = generate(prompt)
            else:
                raise ValueError("Request must include article or prompt")

            print(json.dumps({"ok": True, "text": text}), flush=True)
        except Exception as error:
            print(json.dumps({"ok": False, "error": str(error)}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}), flush=True)
        sys.exit(1)
