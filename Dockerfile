# Stage 1 — build the React frontend
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
COPY --from=mwader/static-ffmpeg:7.0 /ffprobe /usr/local/bin/
COPY --from=mwader/static-ffmpeg:7.0 /ffmpeg /usr/local/bin/

WORKDIR /backend

# Install dependencies first so this layer is cached unless the lockfile changes
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev

# Then copy the rest of the backend source
COPY backend/ ./
COPY --from=frontend-build /frontend/dist /frontend/dist

RUN useradd --create-home appuser && chown -R appuser:appuser /backend
USER appuser

ENV UV_NO_SYNC=1
EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
