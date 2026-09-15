import pathlib
import subprocess
import sys
import tempfile

H = pathlib.Path(__file__).parent
text = """## Ops Design Intent

| Change ID | Deployment Impact | Compatibility | Environment/Config | Health | Migration Order | Rollback | Live Verification |
|---|---|---|---|---|---|---|---|
| C01 | RESTART | BACKWARD_COMPATIBLE | env unchanged | /health | N/A: no migration | previous image tag | SMOKE |
"""
with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d) / "p.md"
    p.write_text(text, encoding="utf-8")
    raise SystemExit(subprocess.run([sys.executable, str(H / "validate_prd_intent.py"), str(p)]).returncode)
