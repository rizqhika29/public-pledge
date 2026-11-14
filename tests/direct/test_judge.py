"""judge: verdicts, settlement accounting and failure modes.

Web and LLM are mocked, so these tests exercise the contract's own logic. They
say nothing about how real validators or a real LLM behave.
"""

from tests.direct.conftest import (
    DAY,
    STAKE,
    T0,
    create,
    expect_error,
    iso,
    mock_evidence,
    mock_verdict,
    to_hex,
)

DEADLINE = T0 + 10 * DAY


def _after_deadline(vm, extra=1):
    vm.warp(iso(DEADLINE + extra))


def test_judge_before_deadline_rejected(pledge, direct_vm, direct_alice, direct_bob):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "kept")

    direct_vm.warp(iso(DEADLINE - 1))
    expect_error(pledge.judge, "deadline has not passed", 0)


def test_judge_kept_credits_owner(pledge, direct_vm, direct_alice, direct_bob):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "kept", "Release v1 was published on 2025-01-05.")
    _after_deadline(direct_vm)

    result = pledge.judge(0)

    assert result["verdict"] == "kept"
    p = pledge.get_pledge(0)
    assert p["status"] == "kept"
    assert p["checks"] == 1
    assert p["note"] == "Release v1 was published on 2025-01-05."

    alice, bob = to_hex(direct_alice), to_hex(direct_bob)
    assert pledge.get_claimable(alice) == STAKE
    assert pledge.get_claimable(bob) == 0
    assert pledge.get_record(alice) == {"kept": 1, "broken": 0}


def test_judge_broken_credits_beneficiary(pledge, direct_vm, direct_alice, direct_bob):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm, body="Nothing was released.")
    mock_verdict(direct_vm, "broken", "No release exists.")
    _after_deadline(direct_vm)

    result = pledge.judge(0)

    assert result["verdict"] == "broken"
    assert pledge.get_pledge(0)["status"] == "broken"

    alice, bob = to_hex(direct_alice), to_hex(direct_bob)
    assert pledge.get_claimable(bob) == STAKE
    assert pledge.get_claimable(alice) == 0
    assert pledge.get_record(alice) == {"kept": 0, "broken": 1}


def test_judge_can_be_called_by_anyone(
    pledge, direct_vm, direct_alice, direct_bob, direct_charlie
):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "kept")
    _after_deadline(direct_vm)

    direct_vm.sender = direct_charlie
    pledge.judge(0)

    assert pledge.get_pledge(0)["status"] == "kept"


def test_inconclusive_keeps_pledge_active(pledge, direct_vm, direct_alice, direct_bob):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm, body="Unrelated page.")
    mock_verdict(direct_vm, "inconclusive", "Page does not mention the release.")
    _after_deadline(direct_vm)

    result = pledge.judge(0)

    assert result["verdict"] == "inconclusive"
    p = pledge.get_pledge(0)
    assert p["status"] == "active"
    assert p["checks"] == 1
    assert p["note"] == "Page does not mention the release."
    assert pledge.get_claimable(to_hex(direct_alice)) == 0
    assert pledge.get_claimable(to_hex(direct_bob)) == 0

    # It can be judged again, e.g. once the evidence page is fixed.
    direct_vm.clear_mocks()
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "kept")
    pledge.judge(0)
    assert pledge.get_pledge(0)["status"] == "kept"
    assert pledge.get_pledge(0)["checks"] == 2


def test_judge_twice_rejected(pledge, direct_vm, direct_alice, direct_bob):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "kept")
    _after_deadline(direct_vm)

    pledge.judge(0)
    expect_error(pledge.judge, "already settled", 0)
    # The stake must not be credited twice.
    assert pledge.get_claimable(to_hex(direct_alice)) == STAKE


def test_judge_unknown_pledge_rejected(pledge):
    expect_error(pledge.judge, "pledge not found", 0)
    expect_error(pledge.judge, "pledge not found", 7)


def test_evidence_http_error_reverts(pledge, direct_vm, direct_alice, direct_bob):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm, status=404, body="not found")
    mock_verdict(direct_vm, "kept")
    _after_deadline(direct_vm)

    expect_error(pledge.judge, "EXTERNAL", 0)
    assert pledge.get_pledge(0)["status"] == "active"
    assert pledge.get_pledge(0)["checks"] == 0


def test_garbage_verdict_reverts(pledge, direct_vm, direct_alice, direct_bob):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "definitely-kept")
    _after_deadline(direct_vm)

    expect_error(pledge.judge, "LLM_ERROR", 0)
    assert pledge.get_pledge(0)["status"] == "active"


def test_verdict_is_case_and_whitespace_tolerant(
    pledge, direct_vm, direct_alice, direct_bob
):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "  KEPT ")
    _after_deadline(direct_vm)

    assert pledge.judge(0)["verdict"] == "kept"


def test_reputation_accumulates_per_owner(
    pledge, direct_vm, direct_alice, direct_bob
):
    create(pledge, direct_vm, direct_alice, direct_bob, promise="First")
    create(pledge, direct_vm, direct_alice, direct_bob, promise="Second")
    mock_evidence(direct_vm)
    _after_deadline(direct_vm)

    mock_verdict(direct_vm, "kept")
    pledge.judge(0)
    direct_vm.clear_mocks()
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "broken")
    pledge.judge(1)

    assert pledge.get_record(to_hex(direct_alice)) == {"kept": 1, "broken": 1}
    # Beneficiary's own record is untouched: only owners are judged.
    assert pledge.get_record(to_hex(direct_bob)) == {"kept": 0, "broken": 0}
