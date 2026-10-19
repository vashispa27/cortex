# Start the local MLX server

Model: `mlx-community/Qwen3.5-2B-4bit`. These steps run the model locally on an Apple Silicon Mac, without speculative decoding.

## Start the server each time

Open Terminal and run:

```sh
source ~/.venvs/rewind-mlx/bin/activate

mlx_lm.server \
  --model mlx-community/Qwen3.5-2B-4bit \
  --host 127.0.0.1 \
  --port 8080 \
  --max-tokens 512 \
  --prompt-cache-size 1 \
  --chat-template-args '{"enable_thinking":false}'
```

Leave this terminal running. The server listens only on this Mac at `http://127.0.0.1:8080`. Thinking is disabled, and the server retains at most one prompt cache. The 512-token setting is the default output limit, not an input context limit; clients can override it.

Press **Ctrl+C** in this terminal to stop the server and release the model's memory.

## First-time setup

If the environment above does not exist, run these commands first. They assume Homebrew is installed.

```sh
brew install python@3.12

"$(brew --prefix python@3.12)/bin/python3.12" -m venv ~/.venvs/rewind-mlx
source ~/.venvs/rewind-mlx/bin/activate

python -m pip install --upgrade pip
python -m pip install --upgrade mlx-lm huggingface_hub

hf download mlx-community/Qwen3.5-2B-4bit
```

The model download requires internet access and is cached locally for subsequent runs. Then use the startup command above.

## Test the server

In a second terminal:

```sh
curl http://127.0.0.1:8080/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "mlx-community/Qwen3.5-2B-4bit",
    "messages": [
      {"role": "user", "content": "Explain retrieval augmented generation in two sentences."}
    ],
    "max_tokens": 150,
    "stream": false
  }'
```

A successful response contains the answer under `choices[0].message.content`.

## Connect Rewind's CLI

With the server still running, use a second terminal:

```sh
cd /Users/abhinavvashisht/workspace/rewind

export REWIND_LLM_URL='http://127.0.0.1:8080/v1/chat/completions'
export REWIND_LLM_MODEL='mlx-community/Qwen3.5-2B-4bit'
unset REWIND_LLM_API_KEY

target/debug/rewind ask "What was I working on today?"
```

This requires an existing Rewind CLI build and captured activity. The environment variables apply to commands launched from this terminal. The desktop app currently needs a separate local-provider integration.

## Troubleshooting

- **Activation file missing:** complete the first-time setup.
- **Connection refused:** make sure the server is running and has finished loading the model.
- **Port 8080 already in use:** stop the other server, or change `--port` and update the URLs in the test and Rewind configuration.
- **Memory pressure:** close unused applications and keep requests short. Model weights, input context, and inference buffers all consume memory.

## References

- [Qwen3.5 2B 4-bit MLX model](https://huggingface.co/mlx-community/Qwen3.5-2B-4bit)
- [MLX LM](https://github.com/ml-explore/mlx-lm)
- [MLX server options](https://github.com/ml-explore/mlx-lm/blob/main/mlx_lm/server.py)

These instructions have not been validated by installing or running the model on this machine.
