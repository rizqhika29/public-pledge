"""Shared helpers for direct mode tests."""

import json
from datetime import datetime, timezone

import pytest

CONTRACT = "contracts/public_pledge.py"

DAY = 86400
T0 = 1735689600  # 2025-01-01T00:00:00Z
EVIDENCE_URL = "https://example.org/proof"
GWEI = 10**9
STAKE = 10**18  # 1 GEN


def iso(ts: int) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def to_hex(addr):
    """Checksummed hex for an address fixture (bytes before deploy)."""
    if hasattr(addr, "as_hex"):
        return addr.as_hex
    from genlayer.py.types import Address

    return Address(addr).as_hex


def expect_error(fn, text, *args, **kwargs):
    """Call `fn` and assert it fails with `text` somewhere in the error.

    Looks at both `.message` (UserError / ContractRollback) and `str(e)`, so it
    does not depend on how the SDK formats its exceptions.
    """
    try:
        fn(*args, **kwargs)
    except Exception as e:  # noqa: BLE001 - any contract failure counts
        shown = f"{getattr(e, 'message', '')} | {e}"
        assert text in shown, f"expected error containing {text!r}, got {shown!r}"
        return
    raise AssertionError(f"expected an error containing {text!r}, but the call succeeded")


def mock_evidence(vm, status=200, body="Release v1 was published on 2025-01-05."):
    vm.mock_web(r".*example\.org/proof.*", {"status": status, "body": body})


def mock_verdict(vm, verdict, reason="Because the evidence says so."):
    vm.mock_llm(r"verdict", json.dumps({"verdict": verdict, "reason": reason}))


@pytest.fixture
def pledge(direct_vm, direct_deploy):
    """Deployed contract with the clock warped to T0."""
    direct_vm.warp(iso(T0))
    return direct_deploy(CONTRACT)


def create(
    contract,
    vm,
    owner,
    beneficiary,
    *,
    stake=STAKE,
    deadline=T0 + 10 * DAY,
    promise="Ship v1 of my project",
    url=EVIDENCE_URL,
    criteria="A release tagged v1 exists and was published before the deadline.",
):
    """Create a pledge as `owner`; returns nothing, id is the pledge count - 1."""
    vm.sender = owner
    vm.value = stake
    try:
        return contract.create_pledge(
            promise, url, criteria, to_hex(beneficiary), deadline
        )
    finally:
        vm.value = 0
