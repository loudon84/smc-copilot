"""Device credential storage — DPAPI Machine Scope on Windows, encrypted file elsewhere.

Production path: CryptProtectData (CRYPTPROTECT_LOCAL_MACHINE) to
%ProgramData%\\SMC\\credentials\\device.dat with ACL limited to SYSTEM/Administrators.

Non-Windows / tests: Fernet (or XOR-fallback) file under an explicit path; never use as
production crypto.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

# CRYPTPROTECT_LOCAL_MACHINE
_CRYPTPROTECT_LOCAL_MACHINE = 0x4


def default_credential_path(program_data: str | Path | None = None) -> Path:
    root = Path(program_data or os.environ.get("ProgramData") or "/var/lib/smc")
    return root / "SMC" / "credentials" / "device.dat"


class DeviceCredentialStore:
    """Opaque device credential persistence."""

    def __init__(self, path: Path | None = None, *, force_file_backend: bool = False) -> None:
        self.path = path or default_credential_path()
        self.force_file_backend = force_file_backend

    def save(self, credential: str) -> None:
        data = credential.encode("utf-8")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.force_file_backend and sys.platform == "win32":
            protected = _dpapi_protect(data)
            self.path.write_bytes(protected)
            _note_acl(self.path)
            return
        self.path.write_bytes(_file_encrypt(data))

    def load(self) -> str | None:
        if not self.path.is_file():
            return None
        raw = self.path.read_bytes()
        if not self.force_file_backend and sys.platform == "win32":
            try:
                return _dpapi_unprotect(raw).decode("utf-8")
            except OSError:
                # Fall through for lab files written by force_file_backend on CI images.
                pass
        try:
            return _file_decrypt(raw).decode("utf-8")
        except Exception:  # noqa: BLE001
            return None


def _note_acl(path: Path) -> None:
    """Document ACL expectation; production bootstrap scripts set SYSTEM/Administrators only."""
    marker = path.with_suffix(path.suffix + ".acl.txt")
    marker.write_text(
        "Expected ACL: SYSTEM and Administrators full control only; no Users read.\n",
        encoding="utf-8",
    )


def _dpapi_protect(data: bytes) -> bytes:
    import ctypes
    from ctypes import wintypes

    class DATA_BLOB(ctypes.Structure):  # noqa: N801 — Win32 API struct name
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32

    blob_in = DATA_BLOB(len(data), ctypes.create_string_buffer(data))
    blob_out = DATA_BLOB()
    if not crypt32.CryptProtectData(
        ctypes.byref(blob_in),
        None,
        None,
        None,
        None,
        _CRYPTPROTECT_LOCAL_MACHINE,
        ctypes.byref(blob_out),
    ):
        raise OSError("CryptProtectData failed")
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        kernel32.LocalFree(blob_out.pbData)


def _dpapi_unprotect(data: bytes) -> bytes:
    import ctypes
    from ctypes import wintypes

    class DATA_BLOB(ctypes.Structure):  # noqa: N801 — Win32 API struct name
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    crypt32 = ctypes.windll.crypt32
    kernel32 = ctypes.windll.kernel32

    blob_in = DATA_BLOB(len(data), ctypes.create_string_buffer(data))
    blob_out = DATA_BLOB()
    if not crypt32.CryptUnprotectData(
        ctypes.byref(blob_in),
        None,
        None,
        None,
        None,
        0,
        ctypes.byref(blob_out),
    ):
        raise OSError("CryptUnprotectData failed")
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        kernel32.LocalFree(blob_out.pbData)


def _machine_fernet_key() -> bytes:
    """Deterministic test key from machine id env; not for production."""
    import base64
    import hashlib

    seed = os.environ.get("SMC_DEVICE_CRED_TEST_KEY", "smc-lab-device-cred").encode("utf-8")
    digest = hashlib.sha256(seed).digest()
    return base64.urlsafe_b64encode(digest)


def _file_encrypt(data: bytes) -> bytes:
    try:
        from cryptography.fernet import Fernet

        return Fernet(_machine_fernet_key()).encrypt(data)
    except Exception:  # noqa: BLE001 — lab fallback when cryptography missing
        key = os.environ.get("SMC_DEVICE_CRED_TEST_KEY", "smc-lab-device-cred").encode("utf-8")
        return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))


def _file_decrypt(data: bytes) -> bytes:
    try:
        from cryptography.fernet import Fernet

        return Fernet(_machine_fernet_key()).decrypt(data)
    except Exception:  # noqa: BLE001
        key = os.environ.get("SMC_DEVICE_CRED_TEST_KEY", "smc-lab-device-cred").encode("utf-8")
        return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))
