"""Bootstrap journal durable state tests."""

from __future__ import annotations

from client.journal import BootstrapJournal, default_journal_path


def test_advance_and_resume(tmp_path) -> None:
    path = tmp_path / "bootstrap-journal.json"
    journal = BootstrapJournal(path=path)
    journal.advance("PREFLIGHT")
    journal.advance("ENROLLMENT_CREATED", endpoint_id="ep_1", enrollment_id="enr_1")
    journal.advance("KEY_REPORTED")

    loaded = BootstrapJournal.load(path)
    assert loaded.state == "KEY_REPORTED"
    assert loaded.endpoint_id == "ep_1"
    assert loaded.enrollment_id == "enr_1"
    assert loaded.resume_from() == "KEY_REPORTED"
    assert loaded.next_pending() == "KEY_ACCEPTED"
    assert loaded.can_write_salt_owner() is False


def test_completed_allows_owner_switch(tmp_path) -> None:
    journal = BootstrapJournal(path=tmp_path / "j.json")
    journal.advance("WORK_VERIFIED")
    journal.advance("COMPLETED")
    assert journal.is_complete() is True
    assert journal.can_write_salt_owner() is True


def test_rollback(tmp_path) -> None:
    journal = BootstrapJournal(path=tmp_path / "j.json")
    journal.advance("MINION_INSTALLED")
    journal.mark_rollback("network_down")
    assert journal.state == "ROLLBACK"
    assert journal.next_pending() is None


def test_default_path(tmp_path) -> None:
    path = default_journal_path(tmp_path)
    assert path.name == "bootstrap-journal.json"
