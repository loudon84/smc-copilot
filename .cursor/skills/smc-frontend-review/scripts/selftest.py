#!/usr/bin/env python3
from __future__ import annotations
import tempfile
from pathlib import Path
from validate_plan_extension import validate

def main():
    with tempfile.TemporaryDirectory() as td:
        p=Path(td)/'x.plan.md';p.write_text('''## Frontend Quality Ledger\n\n| Change ID | Surface | Composition | State Ownership | Design System | Accessibility | Interaction States | Performance | Visual Verification |\n|---|---|---|---|---|---|---|---|---|\n| C01 | src/ui.tsx | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REVIEW | V-FE-01 |\n''',encoding='utf-8')
        assert validate(p)==[]
        p.write_text('## Frontend Quality Ledger\n\nNone\n',encoding='utf-8')
        assert validate(p)
    print('FRONTEND DOMAIN SELFTEST PASS')
    return 0
if __name__=='__main__':raise SystemExit(main())
