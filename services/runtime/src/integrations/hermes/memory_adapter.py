from __future__ import annotations

"""Hermes MEMORY.md / USER.md adapter — Runtime owns Agent memory files."""

from pathlib import Path

from core.config import Settings
from runtime.hermes_profile_paths import ensure_profile_home, profile_home

ENTRY_DELIMITER = "\n§\n"
MEMORY_CHAR_LIMIT = 2200
USER_CHAR_LIMIT = 1375


class HermesMemoryAdapter:
    def __init__(self, settings: Settings, *, profile_name: str | None = None) -> None:
        self._settings = settings
        self._profile_name = profile_name

    def _home(self) -> Path:
        return profile_home(self._settings, self._profile_name)

    def memory_path(self) -> Path:
        return self._home() / "memories" / "MEMORY.md"

    def user_path(self) -> Path:
        return self._home() / "memories" / "USER.md"

    def _read_file(self, path: Path) -> tuple[str, bool, int | None]:
        if not path.exists():
            return "", False, None
        try:
            content = path.read_text(encoding="utf-8")
            mtime = int(path.stat().st_mtime)
            return content, True, mtime
        except OSError:
            return "", False, None

    def _write_file(self, path: Path, content: str) -> None:
        ensure_profile_home(self._settings, self._profile_name)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    @staticmethod
    def parse_entries(content: str) -> list[dict]:
        if not content.strip():
            return []
        return [
            {"index": i, "content": entry.strip()}
            for i, entry in enumerate(content.split(ENTRY_DELIMITER))
            if entry.strip()
        ]

    @staticmethod
    def serialize_entries(entries: list[dict]) -> str:
        return ENTRY_DELIMITER.join(e["content"] for e in entries)

    def read_memory(self) -> dict:
        content, exists, mtime = self._read_file(self.memory_path())
        entries = self.parse_entries(content)
        return {
            "content": content,
            "exists": exists,
            "lastModified": mtime,
            "entries": entries,
            "charCount": len(content),
            "charLimit": MEMORY_CHAR_LIMIT,
        }

    def read_user(self) -> dict:
        content, exists, mtime = self._read_file(self.user_path())
        return {
            "content": content,
            "exists": exists,
            "lastModified": mtime,
            "charCount": len(content),
            "charLimit": USER_CHAR_LIMIT,
        }

    def add_entry(self, content: str) -> dict:
        existing = self.read_memory()
        entries = list(existing["entries"])
        entries.append({"index": len(entries), "content": content.strip()})
        new_content = self.serialize_entries(entries)
        if len(new_content) > MEMORY_CHAR_LIMIT:
            return {
                "success": False,
                "error": f"Would exceed memory limit ({len(new_content)}/{MEMORY_CHAR_LIMIT} chars)",
            }
        self._write_file(self.memory_path(), new_content)
        return {"success": True}

    def update_entry(self, index: int, content: str) -> dict:
        existing = self.read_memory()
        entries = list(existing["entries"])
        if index < 0 or index >= len(entries):
            return {"success": False, "error": "Entry not found"}
        entries[index] = {"index": index, "content": content.strip()}
        new_content = self.serialize_entries(entries)
        if len(new_content) > MEMORY_CHAR_LIMIT:
            return {
                "success": False,
                "error": f"Would exceed memory limit ({len(new_content)}/{MEMORY_CHAR_LIMIT} chars)",
            }
        self._write_file(self.memory_path(), new_content)
        return {"success": True}

    def remove_entry(self, index: int) -> bool:
        existing = self.read_memory()
        entries = list(existing["entries"])
        if index < 0 or index >= len(entries):
            return False
        entries.pop(index)
        self._write_file(self.memory_path(), self.serialize_entries(entries))
        return True

    def write_content(self, content: str) -> dict:
        if len(content) > MEMORY_CHAR_LIMIT:
            return {
                "success": False,
                "error": f"Exceeds limit ({len(content)}/{MEMORY_CHAR_LIMIT} chars)",
            }
        self._write_file(self.memory_path(), content)
        return {"success": True}

    def write_user(self, content: str) -> dict:
        if len(content) > USER_CHAR_LIMIT:
            return {
                "success": False,
                "error": f"Exceeds limit ({len(content)}/{USER_CHAR_LIMIT} chars)",
            }
        self._write_file(self.user_path(), content)
        return {"success": True}
