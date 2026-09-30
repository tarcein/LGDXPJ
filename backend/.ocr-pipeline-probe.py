import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient


with tempfile.TemporaryDirectory() as temporary:
    os.environ["LGDX_DB_PATH"] = str(Path(temporary) / "ocr-probe.db")
    os.environ["LGDX_SEED_DEMO"] = "1"
    from app.main import app

    image = (Path(__file__).parents[1] / "asset" / "프로안내화면" / "7900한달.png").read_bytes()
    with TestClient(app) as client:
        response = client.post(
            "/api/intakes/photo",
            files={"file": ("notice.png", image, "image/png")},
            data={"child_id": "jiu", "source": "ALBUM"},
        )
        print("STATUS", response.status_code)
        print("BODY", response.text[:1000])
