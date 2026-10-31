# syntax=docker/dockerfile:1
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml requirements.lock ./
COPY src ./src
# Optional combined CA secret for managed proxy environments; never embedded in layers.
RUN --mount=type=secret,id=proxy_ca,required=false \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    python -m pip install --no-cache-dir -r requirements.lock && \
    python -m pip install --no-cache-dir --no-deps .
COPY alembic.ini ./
COPY migrations ./migrations
RUN useradd --create-home --uid 10001 research && chown -R research:research /app
USER research
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]
CMD ["sh", "-c", "alembic -c alembic.ini upgrade head && exec uvicorn counterspeech.api:app_factory --factory --host 0.0.0.0 --port 8000"]
