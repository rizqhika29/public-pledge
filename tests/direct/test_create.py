"""create_pledge: happy path and input validation."""

from tests.direct.conftest import (
    DAY,
    STAKE,
    T0,
    create,
    expect_error,
    to_hex,
)


def test_create_stores_pledge(pledge, direct_vm, direct_alice, direct_bob):
    create(pledge, direct_vm, direct_alice, direct_bob)

    assert pledge.get_pledge_count() == 1
    p = pledge.get_pledge(0)
    assert p["id"] == 0
    assert p["owner"] == to_hex(direct_alice)
    assert p["beneficiary"] == to_hex(direct_bob)
    assert p["stake"] == STAKE
    assert p["status"] == "active"
    assert p["deadline"] == T0 + 10 * DAY
    assert p["created_at"] == T0
    assert p["checks"] == 0


def test_create_assigns_sequential_ids(pledge, direct_vm, direct_alice, direct_bob):
    create(pledge, direct_vm, direct_alice, direct_bob)
    create(pledge, direct_vm, direct_alice, direct_bob, promise="Run 100 km")

    assert pledge.get_pledge_count() == 2
    assert pledge.get_pledge(1)["promise"] == "Run 100 km"


def test_zero_stake_rejected(pledge, direct_vm, direct_alice, direct_bob):
    expect_error(
        create, "stake must be greater than zero",
        pledge, direct_vm, direct_alice, direct_bob, stake=0,
    )


def test_past_deadline_rejected(pledge, direct_vm, direct_alice, direct_bob):
    expect_error(
        create, "deadline must be in the future",
        pledge, direct_vm, direct_alice, direct_bob, deadline=T0 - 1,
    )


def test_deadline_equal_to_now_rejected(pledge, direct_vm, direct_alice, direct_bob):
    expect_error(
        create, "deadline must be in the future",
        pledge, direct_vm, direct_alice, direct_bob, deadline=T0,
    )


def test_deadline_too_far_rejected(pledge, direct_vm, direct_alice, direct_bob):
    expect_error(
        create, "too far",
        pledge, direct_vm, direct_alice, direct_bob, deadline=T0 + 400 * DAY,
    )


def test_non_https_url_rejected(pledge, direct_vm, direct_alice, direct_bob):
    expect_error(
        create, "https://",
        pledge, direct_vm, direct_alice, direct_bob, url="http://example.org/proof",
    )


def test_empty_promise_rejected(pledge, direct_vm, direct_alice, direct_bob):
    expect_error(
        create, "promise must be",
        pledge, direct_vm, direct_alice, direct_bob, promise="   ",
    )


def test_overlong_promise_rejected(pledge, direct_vm, direct_alice, direct_bob):
    expect_error(
        create, "promise must be",
        pledge, direct_vm, direct_alice, direct_bob, promise="x" * 501,
    )


def test_empty_criteria_rejected(pledge, direct_vm, direct_alice, direct_bob):
    expect_error(
        create, "criteria must be",
        pledge, direct_vm, direct_alice, direct_bob, criteria="",
    )


def test_beneficiary_cannot_be_owner(pledge, direct_vm, direct_alice):
    expect_error(
        create, "beneficiary cannot be the owner",
        pledge, direct_vm, direct_alice, direct_alice,
    )


def test_beneficiary_cannot_be_zero_address(pledge, direct_vm, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm.value = STAKE
    try:
        expect_error(
            pledge.create_pledge, "zero address",
            "Ship v1", "https://example.org/proof", "criteria",
            "0x0000000000000000000000000000000000000000", T0 + DAY,
        )
    finally:
        direct_vm.value = 0
