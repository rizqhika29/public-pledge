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

API used (gltest 0.29): reads are `contract.method(args=[...]).call()` and
writes are `contract.method(args=[...]).transact(value=..., **wait_kwargs)`.
"""

import time

import pytest

from gltest import create_accounts, get_contract_factory, get_default_account
from gltest.assertions import tx_execution_succeeded

# gltest resolves contract paths relative to the `contracts/` directory.
CONTRACT_PATH = "public_pledge.py"

# A public, stable page. It must keep mentioning GenLayer for the criteria below.
DOCS_URL = "https://docs.genlayer.com/llms.txt"
# Guaranteed 404, used to prove evidence failures block settlement.
MISSING_URL = "https://docs.genlayer.com/this-page-does-not-exist-9f2c"

# Small stakes: Studionet accounts are funded by hand.
STAKE = 10**16  # 0.01 GEN
ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

# A write can take minutes: page fetch + several LLM calls + voting.
SLOW = {"wait_interval": 10_000, "wait_retries": 90}

# Studionet sometimes answers a JSON-RPC request with an HTML error page instead
# of JSON, which the SDK turns into "gen_call returned invalid JSON ... 502".
# Reads are retried because they change nothing. Writes are NOT retried: if the
# submission itself failed we do not know whether the transaction reached the
# chain, so repeating it could send a second stake or judge a pledge twice.
TRANSIENT_RPC_MARKERS = (
    "returned invalid json",
    "bad gateway",
    "service unavailable",
    "gateway timeout",
    "temporarily unavailable",
    "connection",
    "timed out",
    "timeout",
    " 429",
    " 502",
    " 503",
    " 504",
)
READ_ATTEMPTS = 5
READ_BACKOFF_SECONDS = 5


def _now() -> int:
    return int(time.time())


def _wait_until(unix_seconds: int) -> None:
    delay = unix_seconds - _now() + 5
    if delay > 0:
        print(f"waiting {delay}s for the deadline to pass")
        time.sleep(delay)


def _is_transient_rpc_error(err: Exception) -> bool:
    text = str(err).lower()
    return any(marker in text for marker in TRANSIENT_RPC_MARKERS)


def _retry_read(fn):
    """Run an idempotent read, backing off while the RPC endpoint is flaking."""
    delay = READ_BACKOFF_SECONDS
    last: Exception | None = None
    for attempt in range(1, READ_ATTEMPTS + 1):
        try:
            return fn()
        except Exception as err:  # noqa: BLE001 - classified right here
            if not _is_transient_rpc_error(err):
                raise
            last = err
            print(
                f"transient RPC error on read (attempt {attempt}/{READ_ATTEMPTS}): {err}"
            )
            if attempt < READ_ATTEMPTS:
                time.sleep(delay)
                delay *= 2
    raise last  # type: ignore[misc]


def _read(contract, method: str, args: list):
    """Read a view method: contract.<method>(args=...).call().

    Retried on transient RPC failures, so one flaky gateway response does not
    turn an otherwise green run red.
    """
    return _retry_read(lambda: getattr(contract, method)(args=args).call())


def _write(contract, method: str, args: list, value: int = 0):
    """Send a write through consensus and return its receipt."""
    return getattr(contract, method)(args=args).transact(value=value, **SLOW)


@pytest.fixture(scope="module")
def contract():
    """Deploy once; every test creates its own pledge against it."""
    factory = get_contract_factory(contract_file_path=CONTRACT_PATH)
    deployed = factory.deploy(args=[])
    print(f"\nPublicPledge deployed at {deployed.address}")
    assert int(_read(deployed, "get_pledge_count", [])) == 0
    return deployed


@pytest.fixture(scope="module")
def beneficiary():
    """A second, distinct address. It only ever receives claimables."""
    return create_accounts(1)[0].address


def _create(contract, beneficiary, *, deadline, url=DOCS_URL, stake=STAKE, **overrides):
    promise = overrides.pop("promise", "GenLayer publishes a public documentation index")
    criteria = overrides.pop(
        "criteria", "The page is readable and its content mentions GenLayer."
    )
    before = int(_read(contract, "get_pledge_count", []))
    receipt = _write(
        contract,
        "create_pledge",
        [promise, url, criteria, beneficiary, deadline],
        value=stake,
    )
    return receipt, before


# ---------------------------------------------------------------------------
# Deployment and reads
# ---------------------------------------------------------------------------


@pytest.mark.integration
def test_deployed_contract_exposes_views(contract):
    config = _read(contract, "get_config", [])
    assert int(config["grace_seconds"]) == 7 * 24 * 3600
    assert int(config["max_page_size"]) == 50

    page = _read(contract, "get_pledges", [0, 10])
    assert int(page["total"]) >= 0
    assert isinstance(page["items"], list)


@pytest.mark.integration
def test_create_pledge_persists_state(contract, beneficiary):
    deadline = _now() + 3600
    receipt, pid = _create(contract, beneficiary, deadline=deadline)
    assert tx_execution_succeeded(receipt)

    pledge = _read(contract, "get_pledge", [pid])
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
    pytest.param({"stake": 0}, id="zero-stake"),
    pytest.param({"beneficiary": "SELF"}, id="beneficiary-is-owner"),
    pytest.param({"beneficiary": ZERO_ADDRESS}, id="beneficiary-is-zero-address"),
    pytest.param({"url": "http://docs.genlayer.com/llms.txt"}, id="non-https-evidence"),
    pytest.param({"url": "https://docs.genlayer.com/" + "a" * 400}, id="overlong-url"),
    pytest.param({"deadline_offset": -60}, id="deadline-in-the-past"),
    pytest.param({"deadline_offset": 400 * 24 * 3600}, id="deadline-beyond-horizon"),
    pytest.param({"promise": "   "}, id="blank-promise"),
    pytest.param({"criteria": "x" * 600}, id="overlong-criteria"),
]


@pytest.mark.integration
@pytest.mark.parametrize("bad", BAD_INPUTS)
def test_invalid_pledge_is_rejected(contract, beneficiary, bad):
    """A bad pledge must fail the transaction and store nothing."""
    owner = get_default_account().address
    stake = bad.get("stake", STAKE)
    url = bad.get("url", DOCS_URL)
    deadline = _now() + bad.get("deadline_offset", 3600)
    if bad.get("beneficiary") == "SELF":
        target = owner
    else:
        target = bad.get("beneficiary", beneficiary)

    before = int(_read(contract, "get_pledge_count", []))
    receipt = _write(
        contract,
        "create_pledge",
        [
            bad.get("promise", "A promise"),
            url,
            bad.get("criteria", "Some criteria"),
            target,
            deadline,
        ],
        value=stake,
    )

    assert not tx_execution_succeeded(receipt), (
        f"the contract accepted an invalid pledge: {bad}"
    )
    assert int(_read(contract, "get_pledge_count", [])) == before, (
        "an invalid pledge was stored"
    )


@pytest.mark.integration
def test_judge_before_deadline_is_rejected(contract, beneficiary):
    receipt, pid = _create(contract, beneficiary, deadline=_now() + 3600)
    assert tx_execution_succeeded(receipt)

    judged = _write(contract, "judge", [pid])
    assert not tx_execution_succeeded(judged)
    assert _read(contract, "get_pledge", [pid])["status"] == "active"


@pytest.mark.integration
def test_refund_before_grace_is_rejected(contract, beneficiary):
    receipt, pid = _create(contract, beneficiary, deadline=_now() + 3600)
    assert tx_execution_succeeded(receipt)

    refunded = _write(contract, "refund_expired", [pid])
    assert not tx_execution_succeeded(refunded)
    assert _read(contract, "get_pledge", [pid])["status"] == "active"


@pytest.mark.integration
def test_unknown_pledge_id_is_rejected(contract):
    assert not tx_execution_succeeded(_write(contract, "judge", [999_999]))


@pytest.mark.integration
def test_withdraw_with_empty_balance_is_rejected(contract):
    """An unrelated account has nothing claimable and must not be able to withdraw."""
    stranger = create_accounts(1)[0]
    as_stranger = contract.connect(stranger)

    assert int(_read(as_stranger, "get_claimable", [stranger.address])) == 0
    assert not tx_execution_succeeded(_write(as_stranger, "withdraw", []))


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

    claimable_before = int(_read(contract, "get_claimable", [owner]))
    _wait_until(deadline)

    judged = _write(contract, "judge", [pid])
    assert tx_execution_succeeded(judged), "validators did not settle a keepable pledge"

    pledge = _read(contract, "get_pledge", [pid])
    print(f"verdict={pledge['status']} note={pledge['note']!r}")
    assert pledge["status"] == "kept"
    assert int(pledge["checks"]) >= 1
    # A conclusive verdict has to be grounded in text from the page.
    assert len(pledge["evidence_quote"]) >= 24, "verdict stored without evidence"
    assert int(_read(contract, "get_claimable", [owner])) == claimable_before + STAKE
    assert int(_read(contract, "get_record", [owner])["kept"]) >= 1

    # The pull payment must actually transfer value out of the contract.
    assert tx_execution_succeeded(_write(contract, "withdraw", []))
    assert int(_read(contract, "get_claimable", [owner])) == 0


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

    claimable_before = int(_read(contract, "get_claimable", [owner]))
    _wait_until(deadline)

    assert tx_execution_succeeded(_write(contract, "judge", [pid]))

    pledge = _read(contract, "get_pledge", [pid])
    print(f"verdict={pledge['status']} note={pledge['note']!r}")
    assert pledge["status"] != "kept", "unsatisfiable criteria were judged as kept"
    assert int(_read(contract, "get_claimable", [owner])) == claimable_before


@pytest.mark.integration
def test_unreachable_evidence_is_recorded_without_settling(contract, beneficiary):
    """A 404 evidence page is recorded as inconclusive, not silently swallowed.

    It must not settle the pledge, must not move the stake, and must leave a
    record so the owner still has an escape hatch after the grace period.
    """
    owner = get_default_account().address
    deadline = _now() + 60
    receipt, pid = _create(contract, beneficiary, deadline=deadline, url=MISSING_URL)
    assert tx_execution_succeeded(receipt)

    claimable_before = int(_read(contract, "get_claimable", [owner]))
    _wait_until(deadline)

    judged = _write(contract, "judge", [pid])
    assert tx_execution_succeeded(judged), "a dead source should be recorded, not revert"

    pledge = _read(contract, "get_pledge", [pid])
    print(f"verdict={pledge['status']} note={pledge['note']!r}")
    assert pledge["status"] == "active"
    assert int(pledge["checks"]) == 1
    assert pledge["evidence_quote"] == ""
    assert int(_read(contract, "get_claimable", [owner])) == claimable_before

    # Without that recorded attempt the refund path would be shut forever.
    refunded = _write(contract, "refund_expired", [pid])
    assert not tx_execution_succeeded(refunded), "grace period has not passed yet"


@pytest.mark.integration
def test_already_settled_pledge_cannot_be_judged_again(contract, beneficiary):
    """Re-running judgement must not credit the stake twice."""
    owner = get_default_account().address
    deadline = _now() + 60
    receipt, pid = _create(contract, beneficiary, deadline=deadline)
    assert tx_execution_succeeded(receipt)

    _wait_until(deadline)
    assert tx_execution_succeeded(_write(contract, "judge", [pid]))

    claimable_after = int(_read(contract, "get_claimable", [owner]))
    assert not tx_execution_succeeded(_write(contract, "judge", [pid]))
    assert int(_read(contract, "get_claimable", [owner])) == claimable_after
