#!/usr/bin/env python3
"""Resolve Hermes Panel attachment to storage_path for extract_text.py.

Hermes Panel stores files under:
  {HERMES_HOME}/desktop/chat-attachments/{sessionId}/{uuid}_{sanitizedName}
Index:
  {HERMES_HOME}/desktop/chat-attachments/index.json

Gateway/Agent only sees [File: name] in message — not storage_path. This script
bridges index.json -> absolute path for terminal/extract_text.py.

Usage:
  python resolve_attachment_path.py "华尧订单.pdf"
  python resolve_attachment_path.py "华尧订单.pdf" --session-id draft_weboperator
  python resolve_attachment_path.py --id be3e07a8-6873-40ee-a9bd-07bc1a5e90db
  python resolve_attachment_path.py --latest --mime application/pdf --session-id draft_weboperator
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

DEFAULT_INDEX = Path.home() / ".hermes" / "desktop" / "chat-attachments" / "index.json"
CONTRACT_MIMES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
    "image/webp",
}


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def load_index(index_path: Path) -> dict[str, Any]:
    if not index_path.exists():
        raise FileNotFoundError(f"attachment index not found: {index_path}")
    data = json.loads(index_path.read_text(encoding="utf-8"))
    attachments = data.get("attachments")
    if not isinstance(attachments, dict):
        raise ValueError("invalid index.json: missing attachments")
    return attachments


def _mtime(path: str | None) -> float:
    if not path:
        return 0.0
    p = Path(path)
    try:
        return p.stat().st_mtime if p.exists() else 0.0
    except OSError:
        return 0.0


def _filter_session(items: list[dict[str, Any]], session_id: str | None) -> list[dict[str, Any]]:
    if not session_id:
        return items
    return [i for i in items if str(i.get("session_id", "")) == session_id]


def find_by_name(attachments: dict[str, Any], name: str) -> list[dict[str, Any]]:
    name_lower = name.strip().lower()
    hits = []
    for item in attachments.values():
        if not isinstance(item, dict):
            continue
        item_name = str(item.get("name", ""))
        if item_name == name.strip() or item_name.lower() == name_lower:
            hits.append(item)
    return hits


def find_by_id(attachments: dict[str, Any], attachment_id: str) -> dict[str, Any] | None:
    item = attachments.get(attachment_id)
    return item if isinstance(item, dict) else None


def pick_best(candidates: list[dict[str, Any]]) -> dict[str, Any]:
    """Prefer existing file with latest mtime."""
    existing = [c for c in candidates if _mtime(str(c.get("storage_path"))) > 0]
    pool = existing or candidates
    return max(pool, key=lambda c: _mtime(str(c.get("storage_path"))))


def format_hit(item: dict[str, Any]) -> dict[str, Any]:
    path = str(item.get("storage_path", ""))
    return {
        "id": item.get("id"),
        "name": item.get("name"),
        "session_id": item.get("session_id"),
        "mime_type": item.get("mime_type"),
        "storage_path": path,
        "file_exists": Path(path).is_file() if path else False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Resolve Hermes Panel attachment storage_path")
    parser.add_argument("filename", nargs="?", help="Original upload name from [File: name], e.g. 华尧订单.pdf")
    parser.add_argument("--index", default=str(DEFAULT_INDEX), help="Path to chat-attachments/index.json")
    parser.add_argument("--session-id", default=None, help="Filter by session_id (e.g. draft_weboperator, draft_default)")
    parser.add_argument("--id", dest="attachment_id", default=None, help="Attachment UUID from index.json key")
    parser.add_argument("--latest", action="store_true", help="Pick latest by file mtime")
    parser.add_argument("--mime", default=None, help="MIME filter with --latest")
    parser.add_argument(
        "--contract-only",
        action="store_true",
        help="With --latest, only consider common contract MIME types",
    )
    args = parser.parse_args()

    try:
        attachments = load_index(Path(args.index).expanduser())
    except Exception as exc:  # noqa: BLE001
        emit({"ok": False, "error": "index_load_failed", "message": str(exc)})
        return

    if args.attachment_id:
        item = find_by_id(attachments, args.attachment_id)
        if not item:
            emit({"ok": False, "error": "not_found", "attachment_id": args.attachment_id})
            return
        hit = format_hit(item)
        emit({"ok": True, **hit})
        return

    if args.latest:
        candidates = []
        for item in attachments.values():
            if not isinstance(item, dict):
                continue
            mime = item.get("mime_type")
            if args.mime and mime != args.mime:
                continue
            if args.contract_only and mime not in CONTRACT_MIMES:
                continue
            if args.session_id and item.get("session_id") != args.session_id:
                continue
            if item.get("storage_path"):
                candidates.append(item)
        if not candidates:
            emit({"ok": False, "error": "not_found", "message": "no matching attachment"})
            return
        item = pick_best(candidates)
        hit = format_hit(item)
        emit({"ok": True, **hit})
        return

    if not args.filename:
        emit({"ok": False, "error": "missing_filename", "message": "pass filename, --id, or --latest"})
        return

    hits = find_by_name(attachments, args.filename)
    hits = _filter_session(hits, args.session_id)
    if not hits:
        emit({
            "ok": False,
            "error": "not_found",
            "filename": args.filename,
            "session_id": args.session_id,
            "hint": "check index.json or use --session-id draft_weboperator",
        })
        return

    if len(hits) > 1:
        item = pick_best(hits)
        hit = format_hit(item)
        emit({
            "ok": True,
            "ambiguous": True,
            "filename": args.filename,
            "session_id": args.session_id,
            "candidates": [format_hit(h) for h in hits],
            **hit,
            "note": "multiple index entries; picked latest existing file by mtime",
        })
        return

    hit = format_hit(hits[0])
    emit({"ok": True, **hit})


if __name__ == "__main__":
    main()
