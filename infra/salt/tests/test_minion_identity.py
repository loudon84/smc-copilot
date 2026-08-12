from __future__ import annotations

import pytest

from client.minion_identity import plan_adoption, should_revoke_old_key, validate_master_finger


def test_plan_adoption_requires_ep_and_finger() -> None:
    snap = plan_adoption(
        old_minion_id="ITBJB0676",
        new_endpoint_id="ep_abc",
        master_finger="sha256:" + ("ab" * 32),
        conf_backup="C:/backup",
    )
    assert snap.new_endpoint_id == "ep_abc"
    with pytest.raises(ValueError):
        plan_adoption(
            old_minion_id="ITBJB0676",
            new_endpoint_id="bad",
            master_finger="sha256:ff",
            conf_backup="x",
        )
    with pytest.raises(ValueError):
        validate_master_finger("")


def test_revoke_only_after_new_identity_ok() -> None:
    assert should_revoke_old_key(new_identity_online=False, highstate_ok=True) is False
    assert should_revoke_old_key(new_identity_online=True, highstate_ok=False) is False
    assert should_revoke_old_key(new_identity_online=True, highstate_ok=True) is True
