import pathlib
import subprocess
import sys
import tempfile

H = pathlib.Path(__file__).parent
text = """## Backend Design Intent

| Change ID | Owner | Contract | Data/Transaction | Auth | Idempotency/Concurrency | Failure Semantics | Observability |
|---|---|---|---|---|---|---|---|
| C01 | ExistingService | COMPATIBLE_EXTEND | TRANSACTIONAL | UNCHANGED | NOT_APPLICABLE | explicit | logs |
"""
with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d) / "p.md"
    p.write_text(text, encoding="utf-8")
    raise SystemExit(subprocess.run([sys.executable, str(H / "validate_prd_intent.py"), str(p)]).returncode)
