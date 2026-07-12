from llama_cpp import Llama

llm = Llama(
    model_path="./ai_models/gemma-2-2b-it/gemma-2-2b-it-Q4_K_M.gguf",
    n_ctx=4096,
    verbose=False
)

output = llm(
    "Who are you?",
    max_tokens=100,
    temperature=0.2
)

print(output["choices"][0]["text"])