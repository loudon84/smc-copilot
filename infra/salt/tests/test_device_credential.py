"""Device credential store tests (file backend)."""

from __future__ import annotations

from client.device_credential import DeviceCredentialStore, default_credential_path


def test_roundtrip_file_backend(tmp_path) -> None:
    store = DeviceCredentialStore(tmp_path / "device.dat", force_file_backend=True)
    store.save("opaque-256-bit-secret-value")
    assert store.load() == "opaque-256-bit-secret-value"
    assert (tmp_path / "device.dat").is_file()


def test_missing_returns_none(tmp_path) -> None:
    store = DeviceCredentialStore(tmp_path / "missing.dat", force_file_backend=True)
    assert store.load() is None


def test_default_path_under_program_data(tmp_path) -> None:
    path = default_credential_path(tmp_path)
    assert path.name == "device.dat"
    assert "SMC" in path.parts
    assert "credentials" in path.parts
