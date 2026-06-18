# Stage 1 — build the React frontend
FROM node:20-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim-trixie
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
COPY . .
COPY --from=frontend-build /frontend/dist ./frontend/dist
WORKDIR /backend
RUN uv sync --locked

COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
