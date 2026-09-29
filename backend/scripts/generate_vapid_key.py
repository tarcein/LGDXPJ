"""Generate the persistent private key used by PWA Web Push."""

from pathlib import Path
import sys

from py_vapid import Vapid


target = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1] / ".secrets" / "vapid_private.pem"
if target.exists():
    raise SystemExit(f"Already exists: {target}")
target.parent.mkdir(parents=True, exist_ok=True)
vapid = Vapid()
vapid.generate_keys()
vapid.save_key(str(target))
print(f"Created: {target}")
