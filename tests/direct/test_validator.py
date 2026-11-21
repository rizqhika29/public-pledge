"""Validator-side consensus logic of judge().

These rely on direct mode capturing the validator closure of the
`run_nondet_unsafe` call and replaying it with `direct_vm.run_validator()`.
If your genlayer-test version only captures `run_nondet`, run these through
GLSim / Studio instead.
"""

from tests.direct.conftest import (
    DAY,
    DEFAULT_EVIDENCE,
    DEFAULT_QUOTE,
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
    """A leader claiming `kept` while the evidence says `broken` must lose.

    The forged answer even carries a real quote from the page, so it cannot be
    rejected on grounding alone: the validator's own verdict has to disagree.
    """
    _judged(pledge, direct_vm, direct_alice, direct_bob, "kept")

    direct_vm.clear_mocks()
    mock_evidence(direct_vm, body=DEFAULT_EVIDENCE)
    mock_verdict(direct_vm, "broken", quote=DEFAULT_QUOTE)

    forged = {"verdict": "kept", "reason": "trust me", "quote": DEFAULT_QUOTE}
    assert direct_vm.run_validator(leader_result=forged) is False


def test_validator_rejects_invented_quote(pledge, direct_vm, direct_alice, direct_bob):
    """A quoted passage that is not on the page makes the proposal ungrounded."""
    _judged(pledge, direct_vm, direct_alice, direct_bob, "kept")

    direct_vm.clear_mocks()
    mock_evidence(direct_vm)
    mock_verdict(direct_vm, "kept")

    forged = {
        "verdict": "kept",
        "reason": "looks good",
        "quote": "This passage does not appear anywhere on the fetched page",
    }
    assert direct_vm.run_validator(leader_result=forged) is False


def test_validator_rejects_leader_without_quote(
    pledge, direct_vm, direct_alice, direct_bob
):
    _judged(pledge, direct_vm, direct_alice, direct_bob, "kept")

    forged = {"verdict": "kept", "reason": "trust me", "quote": ""}
    assert direct_vm.run_validator(leader_result=forged) is False


def test_validator_rejects_when_it_cannot_read_the_evidence(
    pledge, direct_vm, direct_alice, direct_bob
):
    """If our own fetch fails, nothing the leader claims about the page stands."""
    _judged(pledge, direct_vm, direct_alice, direct_bob, "kept")

    direct_vm.clear_mocks()
    mock_evidence(direct_vm, status=503, body="down")
    mock_verdict(direct_vm, "kept")

    forged = {"verdict": "kept", "reason": "trust me", "quote": DEFAULT_QUOTE}
    assert direct_vm.run_validator(leader_result=forged) is False


def test_validator_rejects_non_external_leader_error(
    pledge, direct_vm, direct_alice, direct_bob
):
    _judged(pledge, direct_vm, direct_alice, direct_bob, "kept")

    # An arbitrary leader failure (not an evidence-source error) forces rotation.
    assert direct_vm.run_validator(leader_error=ValueError("timeout")) is False
