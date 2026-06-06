from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


BASE_DIR = Path(__file__).resolve().parent
CITY_PATH = BASE_DIR / "data" / "manhattan.json"

app = FastAPI(title="Urban What-If Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_city_data: dict[str, Any] | None = None


def to_jsonable(value: Any) -> Any:
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, np.generic):
        return value.item()
    if isinstance(value, dict):
        return {key: to_jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [to_jsonable(item) for item in value]
    if isinstance(value, tuple):
        return [to_jsonable(item) for item in value]
    return value


@app.on_event("startup")
def load_city_data() -> None:
    global _city_data
    with CITY_PATH.open("r", encoding="utf-8") as file:
        _city_data = to_jsonable(json.load(file))


@app.get("/city")
def get_city() -> dict[str, Any]:
    if _city_data is None:
        raise RuntimeError("City data not loaded")
    return _city_data


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
