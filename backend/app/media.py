"""Shared helpers for validating and locating uploaded photo files on disk."""

from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException, UploadFile

from .config import setting
from .db import db_path


def read_file(file: UploadFile, maximum: int) -> bytes:
    content = file.file.read(maximum + 1)
    if not content or len(content) > maximum:
        raise HTTPException(413, "파일이 비어 있거나 크기 제한을 넘었습니다")
    return content


def image_mime(data: bytes) -> str:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    raise HTTPException(415, "JPEG, PNG, WebP 사진만 지원합니다")


def media_root() -> Path:
    configured = setting("MEDIA_ROOT")
    return Path(configured).expanduser().resolve() if configured else (db_path().parent / "uploads" / "family_album").resolve()
