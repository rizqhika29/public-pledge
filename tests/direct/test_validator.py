"""Validator-side consensus logic of judge().

These rely on direct mode capturing the validator closure of the
`run_nondet_unsafe` call and replaying it with `direct_vm.run_validator()`.
If your genlayer-test version only captures `run_nondet`, run these through
GLSim / Studio instead.
"""

from tests.direct.conftest import (
    DAY,
    T0,
    create,
    iso,
    mock_evidence,
    mock_verdict,
)

DEADLINE = T0 + 10 * DAY


def _judged(pledge, direct_vm, direct_alice, direct_bob, verdict="kept"):
    create(pledge, direct_vm, direct_alice, direct_bob)
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, verdict, "Leader reasoning.")
    direct_vm.warp(iso(DEADLINE + 1))
    pledge.judge(0)


def test_validator_agrees_on_same_verdict(pledge, direct_vm, direct_alice, direct_bob):
    _judged(pledge, direct_vm, direct_alice, direct_bob, "kept")

    # Same mocks: the validator reaches the same verdict.
    assert direct_vm.run_validator() is True


def test_validator_ignores_different_reasoning(
    pledge, direct_vm, direct_alice, direct_bob
):
    _judged(pledge, direct_vm, direct_alice, direct_bob, "kept")

    direct_vm.clear_mocks()
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "kept", "Completely different wording.")

    assert direct_vm.run_validator() is True


def test_validator_rejects_different_verdict(
    pledge, direct_vm, direct_alice, direct_bob
):
    _judged(pledge, direct_vm, direct_alice, direct_bob, "kept")

    direct_vm.clear_mocks()
    mock_evidence(direct_vm, body="Nothing here.")
    mock_verdict(direct_vm, "broken")

    assert direct_vm.run_validator() is False


def test_validator_rejects_leader_lying_about_verdict(
    pledge, direct_vm, direct_alice, direct_bob
):
    """A leader claiming `kept` while the evidence says `broken` must lose."""
    _judged(pledge, direct_vm, direct_alice, direct_bob, "kept")

    direct_vm.clear_mocks()
    mock_evidence(direct_vm, body="Nothing here.")
    mock_verdict(direct_vm, "broken")

    forged = {"verdict": "kept", "reason": "trust me"}
    assert direct_vm.run_validator(leader_result=forged) is False


def test_validator_rejects_non_external_leader_error(
    pledge, direct_vm, direct_alice, direct_bob
):
    _judged(pledge, direct_vm, direct_alice, direct_bob, "kept")

    # An arbitrary leader failure (not an evidence-source error) forces rotation.
    assert direct_vm.run_validator(leader_error=ValueError("timeout")) is False
