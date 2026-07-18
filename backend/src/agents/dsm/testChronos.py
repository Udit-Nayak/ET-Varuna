try:
    from chronos import BaseChronosPipeline
except ImportError as exc:
    raise SystemExit(
        "This checkpoint requires the `chronos-forecasting` package. "
        "Install/upgrade it in this venv with: pip install -U chronos-forecasting"
    ) from exc


pipeline = BaseChronosPipeline.from_pretrained(
    "./ai_models/chronos-bolt-small",
    device_map="auto",
)

print("Chronos-Bolt loaded successfully")
