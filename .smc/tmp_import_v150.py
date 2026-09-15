import io
import json
import subprocess
import tarfile
from pathlib import Path

PROVIDER = Path(r"E:/git/nodeskclaw")
DEST = Path(r"E:/git/smc-copilot/contracts/skill-run/v1.5.0")
TAG = "skill-run-contract-v1.5.0"
PREFIX = "nodeskclaw-backend/contracts/skill-run/v1.5.0/"
PINNED = "3a7fa5ac32017d41f7191b8221c861b93d7e7f32"

peeled = subprocess.check_output(
    ["git", "-C", str(PROVIDER), "rev-parse", f"{TAG}^{{commit}}"],
    text=True,
).strip()
if peeled != PINNED:
    raise SystemExit(f"TAG_TARGET_MISMATCH: {peeled} != {PINNED}")

data = subprocess.check_output(
    ["git", "-C", str(PROVIDER), "archive", "--format=tar", TAG, PREFIX.rstrip("/")],
)
DEST.mkdir(parents=True, exist_ok=True)
copied = []
with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as tar:
    for member in tar.getmembers():
        if not member.isfile():
            continue
        name = member.name.replace("\\", "/")
        if name.startswith("./"):
            name = name[2:]
        if not name.startswith(PREFIX):
            raise SystemExit(f"UNEXPECTED_ARCHIVE_PATH: {name}")
        rel = name[len(PREFIX):]
        if not rel or ".." in rel.split("/"):
            raise SystemExit(f"BAD_RELATIVE_PATH: {rel}")
        target = DEST / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        extracted = tar.extractfile(member)
        if extracted is None:
            raise SystemExit(f"EXTRACT_FAILED: {name}")
        payload = extracted.read()
        target.write_bytes(payload)
        copied.append(rel)

receipt = {
    "contractName": "SKILL-RUN-CONTRACT",
    "contractVersion": "1.5.0",
    "providerRepository": "loudon84/nodeskclaw",
    "tagName": TAG,
    "tagTargetCommit": PINNED,
    "providerSha256sumsPath": "nodeskclaw-backend/contracts/skill-run/v1.5.0/SHA256SUMS",
    "sha256sumsPath": "SHA256SUMS",
}
(DEST / "consumer-lock.json").write_text(
    json.dumps(receipt, indent=2) + "\n",
    encoding="utf-8",
    newline="\n",
)

sums = (DEST / "SHA256SUMS").read_bytes()
if b"\r" in sums:
    raise SystemExit("SHA256SUMS_HAS_CR")

print(f"copied={len(copied)} peeled={peeled}")
print("receipt_written=consumer-lock.json")
