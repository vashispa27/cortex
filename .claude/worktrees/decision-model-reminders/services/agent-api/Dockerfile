FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

RUN groupadd --gid 10001 agent && useradd --uid 10001 --gid 10001 --create-home agent
RUN pip install --no-cache-dir uv
COPY pyproject.toml uv.lock README.md ./
COPY src ./src
RUN uv sync --frozen --no-dev

USER agent
ENV PATH="/app/.venv/bin:$PATH"
ENTRYPOINT ["cortex-agent-worker"]
