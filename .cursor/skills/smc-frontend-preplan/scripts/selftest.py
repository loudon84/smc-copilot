import pathlib
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).parent
text = """---
governance_profile: FULL
---

## Frontend Design Intent

| Change ID | Surface | Framework | Layout | Component Map | State Ownership | Interaction States | Design System | Responsive | Visual Verification |
|---|---|---|---|---|---|---|---|---|---|
| C01 | Settings | VUE | EXTEND_EXISTING | REUSE SettingsPanel | LOCAL_EXISTING | default/loading/error | existing tokens | EXTEND | LIVE_VISUAL |
"""
with tempfile.TemporaryDirectory() as d:
    p = pathlib.Path(d) / "p.md"
    p.write_text(text, encoding="utf-8")
    r = subprocess.run([sys.executable, str(HERE / "validate_prd_intent.py"), str(p)])
    raise SystemExit(r.returncode)
