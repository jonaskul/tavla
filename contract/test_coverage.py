"""Proof that the suite actually reaches every endpoint.

Without this, "the contract suite covers the API" is a claim. The client in
conftest records the path template behind every request it makes, and this
compares that against the frozen inventory.

It has to run last, which is why the filename sorts after the others —
pytest collects alphabetically and this reads state the rest of the suite
produced.
"""

import pytest

from conftest import TOUCHED, load_contract


def test_every_endpoint_in_the_contract_was_exercised():
    expected = {(e["method"], e["path"]) for e in load_contract()}
    missing = sorted(expected - TOUCHED)

    if missing:
        lines = "\n".join(f"    {m:6} {p}" for m, p in missing)
        pytest.fail(
            f"{len(missing)} av {len(expected)} endepunkter er ikke dekket:\n{lines}\n\n"
            "Et endepunkt uten dekning er et sted omskrivingen kan avvike "
            "uten at noe sier fra."
        )


def test_nothing_was_touched_that_is_not_in_the_contract():
    """A request to something unlisted means the inventory is stale."""
    expected = {(e["method"], e["path"]) for e in load_contract()}
    surprising = sorted(TOUCHED - expected)
    assert not surprising, (
        f"Truffet endepunkter som ikke står i kontrakten: {surprising}. "
        "Kjør contract/refresh_inventory.py hvis API-et faktisk er endret."
    )
