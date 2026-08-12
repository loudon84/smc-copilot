"""Salt dunder (__utils__ / __salt__) lookup with pytest fallback.

Never mutates sys.path. Production Minion must populate __utils__ via saltutil.sync_utils.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any


def util_fallback() -> dict[str, Callable[..., Any]]:
    from _utils import artifact as smc_artifact
    from _utils import config_revision, smc_control_owner, smc_paths, smc_redact

    return {
        "smc_control_owner.read_control_owner": smc_control_owner.read_control_owner,
        "smc_control_owner.claim_salt_owner": smc_control_owner.claim_salt_owner,
        "smc_control_owner.assert_salt_may_manage": smc_control_owner.assert_salt_may_manage,
        "smc_control_owner.write_control_owner": smc_control_owner.write_control_owner,
        "smc_paths.layout": smc_paths.layout,
        "smc_paths.default_hermes_home": smc_paths.default_hermes_home,
        "smc_paths.detect_existing_home": smc_paths.detect_existing_home,
        "smc_redact.mapping": smc_redact.mapping,
        "smc_artifact.install_signed": smc_artifact.install_signed,
        "smc_artifact.activate_version": smc_artifact.activate_version,
        "smc_artifact.verify_bundle": smc_artifact.verify_bundle,
        "config_revision.apply_config": config_revision.apply_config,
        "config_revision.rollback_config": config_revision.rollback_config,
        "config_revision.validate_config": config_revision.validate_config,
    }


def call_util(utils: Mapping[str, Any] | None, key: str, *args: Any, **kwargs: Any) -> Any:
    if utils and key in utils:
        return utils[key](*args, **kwargs)
    fallback = util_fallback()
    if key not in fallback:
        raise KeyError(f"unknown util: {key}")
    return fallback[key](*args, **kwargs)


def call_salt(salt: Mapping[str, Any] | None, key: str, *args: Any, **kwargs: Any) -> Any:
    if salt and key in salt:
        return salt[key](*args, **kwargs)
    if key.startswith("smc_hermes."):
        from _modules import smc_hermes

        func = getattr(smc_hermes, key.split(".", 1)[1])
        return func(*args, **kwargs)
    if key.startswith("smc_secret."):
        from _modules import smc_secret

        func = getattr(smc_secret, key.split(".", 1)[1])
        return func(*args, **kwargs)
    raise KeyError(f"unknown salt module: {key}")
