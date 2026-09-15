from pathlib import Path
import re

plan_path = Path(r"E:/git/smc-copilot/.cursor/plans/work-v4.0.1-m6g-streaming-delta-contract-import.plan.md")
sums_path = Path(r"E:/git/nodeskclaw/nodeskclaw-backend/contracts/skill-run/v1.5.0/SHA256SUMS")
text = plan_path.read_text(encoding="utf-8")

relatives = []
for line in sums_path.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#"):
        continue
    relatives.append(line.split(" ", 1)[1].strip().lstrip("./"))

prefix = "contracts/skill-run/v1.5.0"
owned = [f"{prefix}/consumer-lock.json", f"{prefix}/SHA256SUMS"] + [
    f"{prefix}/{p}" for p in relatives
]


def matrix_row(path: str) -> str:
    if path.endswith("consumer-lock.json"):
        target = "receipt for complete Provider v1.5 import"
        owner = "Work contract package"
    else:
        target = "immutable Provider v1.5.0 tag asset copy"
        owner = "Provider release bytes"
    cap = "Provider Bundle and Work receipt"
    return (
        f"| C01 | `{path}` | CONFIG | ADD | {owner} | T1 | {target} | {cap} | yes |"
    )


matrix_body = "\n".join(matrix_row(p) for p in owned)
c02_c04 = """| C02 | `apps/work/src/main/skill-run/skill-run-consumer-lock.ts` | PROD | MODIFY | Work consumer-lock | T2 | exact v1.5 structural eligibility | streaming-delta eligibility | no |
| C03 | `apps/work/src/main/skill-run/skill-run-consumer-lock.test.ts` | TEST | MODIFY | Work consumer-lock tests | T3 | identity/shape/negative/compat proof | consumer-lock focused tests | no |
| C04 | `apps/work/lat.md/skill-run.md` | DOC | MODIFY | Work LAT | T4 | import-only v1.5/RM-14 state | architecture documentation | no |"""

new_matrix = f"""| Change ID | File / Symbol | Kind | Action | Existing Owner | Todo Owner | Target State | PRD Capability | New File? |
|---|---|---|---|---|---|---|---|---|
{matrix_body}
{c02_c04}"""

matrix_re = re.compile(
    r"\| Change ID \| File / Symbol \| Kind \| Action \| Existing Owner \| Todo Owner \| Target State \| PRD Capability \| New File\? \|\n\|---\|---\|---\|---\|---\|---\|---\|---\|---\|\n(?:\|.*\n)+?(?=\n## Domain Activation Ledger)",
    re.M,
)
if not matrix_re.search(text):
    raise SystemExit("CHANGE_MATRIX_NOT_FOUND")
text = matrix_re.sub(new_matrix + "\n\n", text)

just_rows = []
for p in owned:
    if p.endswith("consumer-lock.json"):
        necessity = "Work needs an offline tag receipt; Provider checksum-covered assets cannot contain it."
        impact = "Extends existing Work consumer-lock receipt pattern; does not create a runtime owner."
    else:
        necessity = "Provider published tag asset must be copied byte-for-byte so the offline Bundle is checksum-complete."
        impact = "Generated import owned by T1/C01; Work must not author or mutate SHA-covered bytes."
    just_rows.append(f"| C01 | `{p}` | {necessity} | {impact} |")

new_just = f"""| Change ID | File | Necessity | Owner Impact |
|---|---|---|---|
{chr(10).join(just_rows)}"""

just_re = re.compile(
    r"\| Change ID \| File \| Necessity \| Owner Impact \|\n\|---\|---\|---\|---\|\n(?:\|.*\n)+?(?=\n## Implementation Decisions)",
    re.M,
)
if not just_re.search(text):
    raise SystemExit("NEW_FILE_JUSTIFICATION_NOT_FOUND")
text = just_re.sub(new_just + "\n\n", text)

writes = "<br>".join(f"`{p}`" for p in owned)
ledger_re = re.compile(
    r"(\| T1 \| C01 \| )`contracts/skill-run/v1\.5\.0/consumer-lock\.json`( \| local Provider tag; v1\.4 receipt layout \| - \| no \|)"
)
if not ledger_re.search(text):
    raise SystemExit("T1_LEDGER_NOT_FOUND")
text = ledger_re.sub(rf"\1{writes}\2", text)

plan_path.write_text(text, encoding="utf-8")
print("updated", plan_path)
print("c01_files", len(owned))
