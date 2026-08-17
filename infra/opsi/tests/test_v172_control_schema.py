from __future__ import annotations

import re
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path

import pytest

PRODUCT = Path(__file__).resolve().parents[1] / "products" / "smc-hermes-agent"
CONTROL = PRODUCT / "OPSI" / "control.toml"
PACKAGING = PRODUCT / "packaging"


def _load(name: str, path: Path):
    spec = spec_from_file_location(name, path)
    assert spec and spec.loader
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _schema():
    return _load("control_schema", PACKAGING / "control_schema.py")


def test_ut01_source_control_toml_passes_opsi_43_schema():
    schema = _schema()
    data = schema.validate_control_schema(CONTROL, expected_product_version="1.7.2", expected_package_version="1")
    assert schema.product_version(data) == "1.7.2"
    assert schema.package_version(data) == "1"


def test_ut02_legacy_product_version_fails_closed():
    schema = _schema()
    with pytest.raises(schema.ControlSchemaError, match="CONTROL_SCHEMA_INVALID") as exc:
        schema.validate_control_schema(
            """
[Package]
version = "1"

[Product]
type = "localboot"
id = "smc-hermes-agent"
productVersion = "1.7.2"
setupScript = "setup.opsiscript"
updateScript = "update.opsiscript"
uninstallScript = "uninstall.opsiscript"
customScript = "custom.opsiscript"

[[ProductProperty]]
type = "unicode"
name = "hermes_version"
default = ["0.22.0"]
"""
        )
    assert "Product.productVersion" in str(exc.value)
    assert "Expected Product.version" in str(exc.value)


def test_ut03_legacy_package_version_on_product_fails_closed():
    schema = _schema()
    with pytest.raises(schema.ControlSchemaError, match="CONTROL_SCHEMA_INVALID"):
        schema.validate_control_schema(
            """
[Package]
version = "1"

[Product]
type = "localboot"
id = "smc-hermes-agent"
version = "1.7.2"
packageVersion = "1"
setupScript = "setup.opsiscript"
updateScript = "update.opsiscript"
uninstallScript = "uninstall.opsiscript"
customScript = "custom.opsiscript"

[[ProductProperty]]
type = "unicode"
name = "hermes_version"
default = ["0.22.0"]
"""
        )


def test_ut04_product_property_array_tables_pass_dotted_tables_fail():
    schema = _schema()
    valid = CONTROL.read_text(encoding="utf-8")
    schema.validate_control_schema(valid)
    with pytest.raises(schema.ControlSchemaError, match="CONTROL_SCHEMA_INVALID") as exc:
        schema.validate_control_schema(
            """
[Package]
version = "1"

[Product]
type = "localboot"
id = "smc-hermes-agent"
version = "1.7.2"
setupScript = "setup.opsiscript"
updateScript = "update.opsiscript"
uninstallScript = "uninstall.opsiscript"
customScript = "custom.opsiscript"

[ProductProperty.unicode.hermes_version]
default = ["0.22.0"]
"""
        )
    assert "ProductProperty.unicode" in str(exc.value)


def test_internal_manifest_fields_are_not_serialized_into_control(tmp_path: Path):
    make = _load("makepackage", PACKAGING / "makepackage.py")
    dest = tmp_path / "control.toml"
    make.stage_control_toml(
        dest,
        product_version="1.7.2",
        package_version="9",
        hermes_version="0.23.1",
        controller_revision="4",
    )
    text = dest.read_text(encoding="utf-8")
    schema = _schema()
    data = schema.validate_control_schema(dest, expected_product_version="1.7.2", expected_package_version="9")
    assert schema.product_version(data) == "1.7.2"
    assert schema.package_version(data) == "9"
    assert schema.property_default(data, "hermes_version") == "0.23.1"
    assert schema.property_default(data, "controller_revision") == "4"
    assert "productVersion" not in text
    assert "packageVersion" not in text
    assert "[ProductProperty.bool." not in text
    assert "[ProductProperty.unicode." not in text
    assert "[[Product.windowsSoftwareIds]]" not in text
    assert "windowsSoftwareIds = []" in text


def test_builder_scripts_do_not_import_opsi():
    make = (PACKAGING / "makepackage.py").read_text(encoding="utf-8")
    readback = (PACKAGING / "opsi_readback.py").read_text(encoding="utf-8")
    builder = (PACKAGING / "build-real.sh").read_text(encoding="utf-8")
    for text in (make, readback, builder):
        assert "pip install opsi" not in text
        assert "pip install opsiutils" not in text
        assert re.search(r'(?m)^(import opsi|from opsi )', text) is None
