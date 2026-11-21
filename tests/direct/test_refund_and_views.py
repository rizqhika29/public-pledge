"""refund_expired, withdraw guard rails and read-only views."""

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
GRACE = 7 * DAY


# -- refund_expired ----------------------------------------------------------


def test_refund_before_grace_rejected(pledge, direct_vm, direct_alice, direct_bob):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "inconclusive", "Unclear evidence.")

    direct_vm.warp(iso(DEADLINE + 1))
    pledge.judge(0)
    direct_vm.warp(iso(DEADLINE + GRACE - 1))
    expect_error(pledge.refund_expired, "grace period has not passed", 0)


def test_refund_requires_a_recorded_judgement(
    pledge, direct_vm, direct_alice, direct_bob
):
    """Closes the exit: an owner cannot skip judgement and take the stake back.

    Without this rule an owner whose evidence plainly shows `broken` could wait
    out the grace period and refund, leaving the beneficiary with nothing.
    """
    create(pledge, direct_vm, direct_alice, direct_bob)

    direct_vm.warp(iso(DEADLINE + GRACE + 1))
    expect_error(pledge.refund_expired, "judge the pledge at least once", 0)
    assert pledge.get_pledge(0)["status"] == "active"
    assert pledge.get_claimable(to_hex(direct_alice)) == 0
    assert pledge.get_claimable(to_hex(direct_bob)) == 0


def test_refund_after_grace_returns_stake_to_owner(
    pledge, direct_vm, direct_alice, direct_bob
):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "inconclusive", "Page is ambiguous.")

    direct_vm.warp(iso(DEADLINE + 1))
    pledge.judge(0)

    direct_vm.warp(iso(DEADLINE + GRACE))
    pledge.refund_expired(0)

    assert pledge.get_pledge(0)["status"] == "refunded"
    assert pledge.get_claimable(to_hex(direct_alice)) == STAKE
    assert pledge.get_claimable(to_hex(direct_bob)) == 0
    # A refund is not a verdict: reputation stays untouched.
    assert pledge.get_record(to_hex(direct_alice)) == {"kept": 0, "broken": 0}


def test_refund_pays_the_owner_not_the_caller(
    pledge, direct_vm, direct_alice, direct_bob, direct_charlie
):
    """refund_expired is permissionless, but it must never pay the caller."""
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "inconclusive", "Page is ambiguous.")

    direct_vm.warp(iso(DEADLINE + 1))
    direct_vm.sender = direct_charlie
    pledge.judge(0)

    direct_vm.warp(iso(DEADLINE + GRACE))
    direct_vm.sender = direct_charlie
    pledge.refund_expired(0)

    assert pledge.get_claimable(to_hex(direct_alice)) == STAKE
    assert pledge.get_claimable(to_hex(direct_charlie)) == 0


def test_refund_works_when_evidence_is_offline(
    pledge, direct_vm, direct_alice, direct_bob
):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm, status=500, body="down")
    direct_vm.warp(iso(DEADLINE + 1))

    # A dead source is recorded, not reverted, so the escape hatch stays open.
    assert pledge.judge(0)["verdict"] == "inconclusive"
    direct_vm.warp(iso(DEADLINE + GRACE + 1))
    pledge.refund_expired(0)
    assert pledge.get_pledge(0)["status"] == "refunded"


def test_refund_twice_rejected(pledge, direct_vm, direct_alice, direct_bob):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "inconclusive", "Page is ambiguous.")

    direct_vm.warp(iso(DEADLINE + 1))
    pledge.judge(0)
    direct_vm.warp(iso(DEADLINE + GRACE))

    pledge.refund_expired(0)
    expect_error(pledge.refund_expired, "already settled", 0)
    assert pledge.get_claimable(to_hex(direct_alice)) == STAKE


def test_refund_after_judgement_rejected(pledge, direct_vm, direct_alice, direct_bob):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "broken")
    direct_vm.warp(iso(DEADLINE + 1))
    pledge.judge(0)

    direct_vm.warp(iso(DEADLINE + GRACE + 1))
    expect_error(pledge.refund_expired, "already settled", 0)
    # The beneficiary keeps the stake; the owner gets nothing back.
    assert pledge.get_claimable(to_hex(direct_bob)) == STAKE
    assert pledge.get_claimable(to_hex(direct_alice)) == 0


def test_judge_after_refund_rejected(pledge, direct_vm, direct_alice, direct_bob):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "inconclusive", "Page is ambiguous.")

    direct_vm.warp(iso(DEADLINE + 1))
    pledge.judge(0)
    direct_vm.warp(iso(DEADLINE + GRACE))
    pledge.refund_expired(0)

    expect_error(pledge.judge, "already settled", 0)


# -- withdraw ------------------------------------------------------------------
# A successful withdraw emits an external value transfer, which needs a runtime
# with message support (GLSim / Studio). Direct mode only covers the guard.


def test_withdraw_with_nothing_rejected(pledge, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    expect_error(pledge.withdraw, "nothing to withdraw")


# -- views -------------------------------------------------------------------


def test_get_pledge_unknown_id_rejected(pledge):
    expect_error(pledge.get_pledge, "pledge not found", 0)


def test_get_pledges_pagination(pledge, direct_vm, direct_alice, direct_bob):
    for i in range(5):
        create(pledge, direct_vm, direct_alice, direct_bob, promise=f"Promise {i}")

    page = pledge.get_pledges(0, 2)
    assert page["total"] == 5
    assert [p["promise"] for p in page["items"]] == ["Promise 0", "Promise 1"]

    page = pledge.get_pledges(3, 10)
    assert [p["id"] for p in page["items"]] == [3, 4]

    page = pledge.get_pledges(9, 10)
    assert page["items"] == []
    assert page["total"] == 5


def test_get_pledges_empty(pledge):
    page = pledge.get_pledges(0, 10)
    assert page == {"total": 0, "offset": 0, "items": []}


def test_get_config(pledge):
    cfg = pledge.get_config()
    assert cfg["grace_seconds"] == GRACE
    assert cfg["max_page_size"] == 50
