from fastapi import FastAPI

app = FastAPI(title="CohereMix")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
