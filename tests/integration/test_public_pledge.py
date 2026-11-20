"""On-chain integration and adversarial tests against a real GenLayer network.

These talk to Studionet with real validators, real web fetches and real LLM
calls, so they are slow (each write needs consensus) and cannot be mocked.

Run locally:
    ACCOUNT_PRIVATE_KEY=0x... gltest tests/integration/ -v -s --network studionet

In CI:
    .github/workflows/onchain.yml (manual dispatch, needs the
    DEPLOYER_PRIVATE_KEY repository secret)

The account must hold a little GEN on Studionet, because `create_pledge` sends
the stake as transaction value.
"""

import time

import pytest

from gltest import create_accounts, get_contract_factory, get_default_account
from gltest.assertions import tx_execution_succeeded

CONTRACT_PATH = "contracts/public_pledge.py"

# A public, stable page. Pinned content policy: it must keep mentioning GenLayer.
DOCS_URL = "https://docs.genlayer.com/llms.txt"
# Guaranteed 404, used to prove evidence failures block settlement.
MISSING_URL = "https://docs.genlayer.com/this-page-does-not-exist-9f2c"

# Small stakes: Studionet accounts are funded by hand.
STAKE = 10**16  # 0.01 GEN
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

# A write can take minutes: page fetch + several LLM calls + voting.
SLOW = {"wait_interval": 10_000, "wait_retries": 90}


def _now() -> int:
    return int(time.time())


def _wait_until(unix_seconds: int) -> None:
    delay = unix_seconds - _now() + 5
    if delay > 0:
        print(f"waiting {delay}s for the deadline to pass")
        time.sleep(delay)


@pytest.fixture(scope="module")
def contract():
    """Deploy once; every test creates its own pledge against it."""
    factory = get_contract_factory(contract_file_path=CONTRACT_PATH)
    deployed = factory.deploy(args=[])
    print(f"\nPublicPledge deployed at {deployed.address}")
    assert deployed.get_pledge_count.call(args=[]) == 0
    return deployed


@pytest.fixture(scope="module")
def beneficiary():
    """A second, distinct address. Never funded: it only receives claimables."""
    return create_accounts(1)[0].address


def _create(contract, beneficiary, *, deadline, url=DOCS_URL, stake=STAKE, **overrides):
    promise = overrides.pop("promise", "GenLayer publishes a public documentation index")
    criteria = overrides.pop(
        "criteria", "The page is readable and its content mentions GenLayer."
    )
    before = contract.get_pledge_count.call(args=[])
    receipt = contract.create_pledge.transact(
        args=[promise, url, criteria, beneficiary, deadline],
        value=stake,
        **SLOW,
    )
    return receipt, int(before)


# ---------------------------------------------------------------------------
# Deployment and reads
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_deployed_contract_exposes_views(contract):
    config = contract.get_config.call(args=[])
    assert int(config["grace_seconds"]) == 7 * 24 * 3600
    assert int(config["max_page_size"]) == 50

    page = contract.get_pledges.call(args=[0, 10])
    assert int(page["total"]) >= 0
    assert isinstance(page["items"], list)


@pytest.mark.integration
def test_create_pledge_persists_state(contract, beneficiary):
    deadline = _now() + 3600
    receipt, pid = _create(contract, beneficiary, deadline=deadline)
    assert tx_execution_succeeded(receipt)

    pledge = contract.get_pledge.call(args=[pid])
    owner = get_default_account().address
    assert pledge["owner"].lower() == owner.lower()
    assert pledge["beneficiary"].lower() == beneficiary.lower()
    assert int(pledge["stake"]) == STAKE
    assert int(pledge["deadline"]) == deadline
    assert pledge["status"] == "active"
    assert int(pledge["checks"]) == 0
    assert pledge["evidence_url"] == DOCS_URL


# ---------------------------------------------------------------------------
# Adversarial: input validation must reject, not accept and store
# ---------------------------------------------------------------------------

BAD_INPUTS = [
    pytest.param(
        {"stake": 0},
        id="zero-stake",
    ),
    pytest.param(
        {"beneficiary": "SELF"},
        id="beneficiary-is-owner",
    ),
    pytest.param(
        {"beneficiary": ZERO_ADDRESS},
        id="beneficiary-is-zero-address",
    ),
    pytest.param(
        {"url": "http://docs.genlayer.com/llms.txt"},
        id="non-https-evidence",
    ),
    pytest.param(
        {"url": "https://docs.genlayer.com/" + "a" * 400},
        id="overlong-url",
    ),
    pytest.param(
        {"deadline_offset": -60},
        id="deadline-in-the-past",
    ),
    pytest.param(
        {"deadline_offset": 400 * 24 * 3600},
        id="deadline-beyond-horizon",
    ),
    pytest.param(
        {"promise": "   "},
        id="blank-promise",
    ),
    pytest.param(
        {"criteria": "x" * 600},
        id="overlong-criteria",
    ),
]


@pytest.mark.integration
@pytest.mark.parametrize("bad", BAD_INPUTS)
def test_invalid_pledge_is_rejected(contract, beneficiary, bad):
    """A bad pledge must fail the transaction and store nothing."""
    owner = get_default_account().address
    stake = bad.get("stake", STAKE)
    url = bad.get("url", DOCS_URL)
    deadline = _now() + bad.get("deadline_offset", 3600)
    target = owner if bad.get("beneficiary") == "SELF" else bad.get("beneficiary", beneficiary)

    before = int(contract.get_pledge_count.call(args=[]))
    receipt = contract.create_pledge.transact(
        args=[
            bad.get("promise", "A promise"),
            url,
            bad.get("criteria", "Some criteria"),
            target,
            deadline,
        ],
        value=stake,
        **SLOW,
    )

    assert not tx_execution_succeeded(receipt), (
        f"the contract accepted an invalid pledge: {bad}"
    )
    assert int(contract.get_pledge_count.call(args=[])) == before, (
        "an invalid pledge was stored"
    )


@pytest.mark.integration
def test_judge_before_deadline_is_rejected(contract, beneficiary):
    receipt, pid = _create(contract, beneficiary, deadline=_now() + 3600)
    assert tx_execution_succeeded(receipt)

    judged = contract.judge.transact(args=[pid], **SLOW)
    assert not tx_execution_succeeded(judged)
    assert contract.get_pledge.call(args=[pid])["status"] == "active"


@pytest.mark.integration
def test_refund_before_grace_is_rejected(contract, beneficiary):
    receipt, pid = _create(contract, beneficiary, deadline=_now() + 3600)
    assert tx_execution_succeeded(receipt)

    refunded = contract.refund_expired.transact(args=[pid], **SLOW)
    assert not tx_execution_succeeded(refunded)
    assert contract.get_pledge.call(args=[pid])["status"] == "active"


@pytest.mark.integration
def test_unknown_pledge_id_is_rejected(contract):
    assert not tx_execution_succeeded(contract.judge.transact(args=[999_999], **SLOW))


@pytest.mark.integration
def test_withdraw_with_empty_balance_is_rejected(contract):
    """An unrelated account has nothing claimable and must not be able to withdraw."""
    factory = get_contract_factory(contract_file_path=CONTRACT_PATH)
    stranger = create_accounts(1)[0]
    as_stranger = factory.build_contract(contract.address, account=stranger)

    assert int(as_stranger.get_claimable.call(args=[stranger.address])) == 0
    assert not tx_execution_succeeded(as_stranger.withdraw.transact(args=[], **SLOW))


# ---------------------------------------------------------------------------
# Real consensus: kept, unmet criteria, and unreachable evidence
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_promise_kept_settles_and_pays_out(contract, beneficiary):
    """The full happy path with real validators, ending in a real GEN transfer."""
    owner = get_default_account().address
    deadline = _now() + 60
    receipt, pid = _create(contract, beneficiary, deadline=deadline)
    assert tx_execution_succeeded(receipt)

    claimable_before = int(contract.get_claimable.call(args=[owner]))
    _wait_until(deadline)

    judged = contract.judge.transact(args=[pid], **SLOW)
    assert tx_execution_succeeded(judged), "validators did not settle a keepable pledge"

    pledge = contract.get_pledge.call(args=[pid])
    print(f"verdict={pledge['status']} note={pledge['note']!r}")
    assert pledge["status"] == "kept"
    assert int(pledge["checks"]) >= 1
    assert int(contract.get_claimable.call(args=[owner])) == claimable_before + STAKE
    assert int(contract.get_record.call(args=[owner])["kept"]) >= 1

    # The pull payment must actually transfer value out of the contract.
    assert tx_execution_succeeded(contract.withdraw.transact(args=[], **SLOW))
    assert int(contract.get_claimable.call(args=[owner])) == 0


@pytest.mark.integration
def test_unmet_criteria_never_pays_the_owner(contract, beneficiary):
    """Adversarial: criteria the evidence cannot satisfy must not end as `kept`."""
    owner = get_default_account().address
    deadline = _now() + 60
    receipt, pid = _create(
        contract,
        beneficiary,
        deadline=deadline,
        criteria="The page contains the exact string ZXQ-PLEDGE-CANARY-4471.",
    )
    assert tx_execution_succeeded(receipt)

    claimable_before = int(contract.get_claimable.call(args=[owner]))
    _wait_until(deadline)

    judged = contract.judge.transact(args=[pid], **SLOW)
    assert tx_execution_succeeded(judged)

    pledge = contract.get_pledge.call(args=[pid])
    print(f"verdict={pledge['status']} note={pledge['note']!r}")
    assert pledge["status"] != "kept", "unsatisfiable criteria were judged as kept"
    assert int(contract.get_claimable.call(args=[owner])) == claimable_before


@pytest.mark.integration
def test_unreachable_evidence_settles_nothing(contract, beneficiary):
    """A 404 evidence page must fail the judgement and leave the stake untouched."""
    owner = get_default_account().address
    deadline = _now() + 60
    receipt, pid = _create(contract, beneficiary, deadline=deadline, url=MISSING_URL)
    assert tx_execution_succeeded(receipt)

    claimable_before = int(contract.get_claimable.call(args=[owner]))
    _wait_until(deadline)

    judged = contract.judge.transact(args=[pid], **SLOW)
    assert not tx_execution_succeeded(judged), "judgement succeeded on a 404 page"

    pledge = contract.get_pledge.call(args=[pid])
    assert pledge["status"] == "active"
    assert int(pledge["checks"]) == 0
    assert int(contract.get_claimable.call(args=[owner])) == claimable_before


@pytest.mark.integration
def test_already_settled_pledge_cannot_be_judged_again(contract, beneficiary):
    """Re-running judgement must not credit the stake twice."""
    owner = get_default_account().address
    deadline = _now() + 60
    receipt, pid = _create(contract, beneficiary, deadline=deadline)
    assert tx_execution_succeeded(receipt)

    _wait_until(deadline)
    assert tx_execution_succeeded(contract.judge.transact(args=[pid], **SLOW))

    claimable_after = int(contract.get_claimable.call(args=[owner]))
    assert not tx_execution_succeeded(contract.judge.transact(args=[pid], **SLOW))
    assert int(contract.get_claimable.call(args=[owner])) == claimable_after
