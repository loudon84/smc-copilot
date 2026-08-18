"""OPSI 4.3 control.toml static schema gate.

Uses the Python standard library only (tomllib). Does not import python-opsi
or opsiutils. Fail closed on legacy SMC field names.
"""

from __future__ import annotations

import tomllib
from pathlib import Path
from typing import Any

PRODUCT_ID = "smc-hermes-agent"
# Source may use short names; opsi-makepackage rewrites to opsicommon class names.
LOCALBOOT_TYPES = frozenset({"localboot", "localbootproduct"})
BOOL_PROPERTY_TYPES = frozenset({"bool", "boolproductproperty"})
UNICODE_PROPERTY_TYPES = frozenset({"unicode", "unicodeproductproperty"})
REQUIRED_SCRIPTS = ("setupScript", "updateScript", "uninstallScript", "customScript")
REQUIRED_PROPERTIES = (
    "gateway_autostart",
    "diagnostics_enabled",
    "hermes_version",
    "release_channel",
    "gateway_port",
    "managed_profile",
    "config_revision",
    "diagnostic_log_lines",
    "auto_repair_level",
    "custom_operation",
    "request_id",
    "client_id",
    "managed_user_sid",
    "managed_user_account",
    "config_digest",
    "config_payload",
    "controller_revision",
)


class ControlSchemaError(ValueError):
    def __init__(self, detail: str) -> None:
        super().__init__(f"CONTROL_SCHEMA_INVALID:\n{detail}")


def parse_control_toml(source: Path | str | bytes) -> dict[str, Any]:
    if isinstance(source, Path):
        with source.open("rb") as handle:
            return tomllib.load(handle)
    if isinstance(source, bytes):
        return tomllib.loads(source.decode("utf-8"))
    return tomllib.loads(source)


def package_version(data: dict[str, Any]) -> str:
    package = data.get("Package")
    if not isinstance(package, dict):
        raise ControlSchemaError("Package table is required.")
    version = package.get("version")
    if version is None or str(version).strip() == "":
        raise ControlSchemaError("Package.version is required.")
    return str(version)


def product_version(data: dict[str, Any]) -> str:
    product = data.get("Product")
    if not isinstance(product, dict):
        raise ControlSchemaError("Product table is required.")
    version = product.get("version")
    if version is None or str(version).strip() == "":
        raise ControlSchemaError("Product.version is required.\nExpected Product.version.")
    return str(version)


def property_default(data: dict[str, Any], name: str) -> str:
    props = data.get("ProductProperty")
    if not isinstance(props, list):
        raise ControlSchemaError("ProductProperty must be [[ProductProperty]] array tables.")
    for item in props:
        if not isinstance(item, dict) or item.get("name") != name:
            continue
        default = item.get("default")
        if not isinstance(default, list) or not default:
            raise ControlSchemaError(f"ProductProperty {name} default is required.")
        return str(default[0])
    raise ControlSchemaError(f"missing ProductProperty {name}")


def _reject_legacy_product_fields(product: dict[str, Any]) -> None:
    if "productVersion" in product:
        raise ControlSchemaError(
            "legacy/non-OPSI field Product.productVersion detected.\nExpected Product.version."
        )
    if "packageVersion" in product:
        raise ControlSchemaError(
            "legacy/non-OPSI field Product.packageVersion detected.\nExpected Package.version."
        )


def _reject_legacy_property_tables(data: dict[str, Any]) -> None:
    props = data.get("ProductProperty")
    if props is None:
        raise ControlSchemaError("ProductProperty is required.")
    if isinstance(props, dict):
        if "bool" in props:
            raise ControlSchemaError(
                "legacy/non-OPSI field ProductProperty.bool.* detected.\nExpected [[ProductProperty]]."
            )
        if "unicode" in props:
            raise ControlSchemaError(
                "legacy/non-OPSI field ProductProperty.unicode.* detected.\nExpected [[ProductProperty]]."
            )
        raise ControlSchemaError(
            "legacy/non-OPSI ProductProperty table detected.\nExpected [[ProductProperty]]."
        )
    if not isinstance(props, list):
        raise ControlSchemaError("ProductProperty must be [[ProductProperty]] array tables.")


def _reject_windows_software_id_tables(product: dict[str, Any]) -> None:
    ids = product.get("windowsSoftwareIds")
    if ids is None:
        return
    if not isinstance(ids, list):
        raise ControlSchemaError("Product.windowsSoftwareIds must be an array.")
    if any(isinstance(item, dict) for item in ids):
        raise ControlSchemaError(
            "legacy [[Product.windowsSoftwareIds]] table detected.\nExpected windowsSoftwareIds = []."
        )


def normalize_product_type(value: Any) -> str:
    return str(value or "").strip().lower()


def normalize_property_type(value: Any) -> str:
    return str(value or "").strip().lower()


def is_localboot_product_type(value: Any) -> bool:
    return normalize_product_type(value) in LOCALBOOT_TYPES


def is_bool_property_type(value: Any) -> bool:
    return normalize_property_type(value) in BOOL_PROPERTY_TYPES


def is_unicode_property_type(value: Any) -> bool:
    return normalize_property_type(value) in UNICODE_PROPERTY_TYPES


def validate_control_schema(
    source: Path | str | bytes,
    *,
    expected_product_version: str | None = None,
    expected_package_version: str | None = None,
    require_scripts: bool = True,
) -> dict[str, Any]:
    data = parse_control_toml(source)
    package = data.get("Package")
    product = data.get("Product")
    if not isinstance(package, dict):
        raise ControlSchemaError("Package table is required.")
    if not isinstance(product, dict):
        raise ControlSchemaError("Product table is required.")
    _reject_legacy_product_fields(product)
    _reject_legacy_property_tables(data)
    _reject_windows_software_id_tables(product)
    pkg_version = package_version(data)
    prod_version = product_version(data)
    if not is_localboot_product_type(product.get("type")):
        raise ControlSchemaError(
            "Product.type must be localboot or LocalbootProduct "
            f"(got {product.get('type')!r})."
        )
    if str(product.get("id") or "") != PRODUCT_ID:
        raise ControlSchemaError(f"Product.id must be {PRODUCT_ID}.")
    if expected_product_version is not None and prod_version != expected_product_version:
        raise ControlSchemaError(
            f"Product.version {prod_version!r} != expected {expected_product_version!r}."
        )
    if expected_package_version is not None and pkg_version != expected_package_version:
        raise ControlSchemaError(
            f"Package.version {pkg_version!r} != expected {expected_package_version!r}."
        )
    if prod_version.lower() == "latest":
        raise ControlSchemaError("Product.version must be exact; latest is forbidden.")
    if require_scripts:
        for field in REQUIRED_SCRIPTS:
            value = product.get(field)
            if value is None or str(value).strip() == "":
                raise ControlSchemaError(f"Product.{field} is required.")
    names: list[str] = []
    for item in data["ProductProperty"]:
        if not isinstance(item, dict):
            raise ControlSchemaError("each ProductProperty must be a table.")
        name = str(item.get("name") or "")
        prop_type = item.get("type")
        if not name:
            raise ControlSchemaError("ProductProperty.name is required.")
        if not (is_bool_property_type(prop_type) or is_unicode_property_type(prop_type)):
            raise ControlSchemaError(
                f"ProductProperty {name} type must be bool/BoolProductProperty "
                f"or unicode/UnicodeProductProperty (got {prop_type!r})."
            )
        names.append(name)
    missing = [name for name in REQUIRED_PROPERTIES if name not in names]
    if missing:
        raise ControlSchemaError("missing ProductProperty: " + ", ".join(missing))
    return data
