"""Backend-local configuration; never expose API keys to the frontend."""

from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)


def setting(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def enabled(name: str) -> bool:
    return setting(name).lower() in {"1", "true", "yes", "on"}
