#!/usr/bin/env python3
"""Check a deployed Tavla for the ways it can be quietly misconfigured.

Safe to run against production: it sends no mail, creates no data, signs
nobody in, and does not spend the sign-in rate limit.

Run it against the real URL after deploying:

    python scripts/smoke_test.py https://tavla.digibygg.io

Everything here is a failure that looks fine from the outside. A cookie
without Secure still signs you in — over plaintext. An app that answers
unauthenticated still works — for everybody. A missing SPA fallback only
breaks when someone reloads on a sub-page, which is never the page you
test by hand.

"""

import sys
from typing import List, Tuple

import httpx

PASS, FAIL, WARN = "OK  ", "FEIL", "OBS "


class Report:
    def __init__(self) -> None:
        self.rows: List[Tuple[str, str, str]] = []

    def add(self, status: str, title: str, detail: str = "") -> None:
        self.rows.append((status, title, detail))

    def show(self) -> int:
        for status, title, detail in self.rows:
            print(f"  [{status}] {title}")
            if detail:
                for line in detail.splitlines():
                    print(f"         {line}")
        failures = sum(1 for s, _, _ in self.rows if s == FAIL)
        warnings = sum(1 for s, _, _ in self.rows if s == WARN)
        print()
        print(f"  {len(self.rows) - failures - warnings} ok, {warnings} å se på, {failures} feil")
        return 1 if failures else 0


def check_health(client: httpx.Client, base: str, r: Report) -> None:
    try:
        res = client.get(f"{base}/api/health")
    except httpx.HTTPError as exc:
        r.add(FAIL, "API-et svarer", f"{type(exc).__name__}: {exc}")
        return
    if res.status_code == 200:
        r.add(PASS, "API-et svarer på /api/health")
    else:
        r.add(FAIL, "API-et svarer på /api/health", f"fikk HTTP {res.status_code}")


def check_requires_auth(client: httpx.Client, base: str, r: Report) -> None:
    """The whole app must be closed to anyone not signed in."""
    res = client.get(f"{base}/api/properties")
    if res.status_code == 401:
        r.add(PASS, "Uinnlogget får 401 på data")
    elif res.status_code == 200:
        r.add(
            FAIL,
            "Uinnlogget får 401 på data",
            "Fikk 200. Enten står AUTH_MODE=single_user, eller så er\n"
            "autentiseringen ute av drift. Appen er åpen for alle.",
        )
    else:
        r.add(WARN, "Uinnlogget får 401 på data", f"fikk HTTP {res.status_code}")


def check_system_closed(client: httpx.Client, base: str, r: Report) -> None:
    """These shell out to git and systemctl, so they must not be public."""
    res = client.get(f"{base}/api/system/status")
    if res.status_code == 401:
        r.add(PASS, "Systemendepunktene er lukket")
    else:
        r.add(
            FAIL,
            "Systemendepunktene er lukket",
            f"/api/system/status ga HTTP {res.status_code}. De kjører git og\n"
            "systemctl på serveren og skal aldri være åpne.",
        )


def check_signin_reachable(client: httpx.Client, base: str, r: Report) -> None:
    """Prove the sign-in endpoint is live without asking it to send anything.

    An address with an invalid domain is rejected by validation before any
    mail is attempted, so this costs nothing. Asking for a real code would
    send one and spend the rate limit -- ten per IP per hour -- and running
    this twice against production would lock the deployer out of their own
    app.

    That the endpoint answers identically for known and unknown addresses is
    a property of the application, covered by tests/test_login.py. This
    script checks that the deployment is wired up, not that the code is
    correct.
    """
    res = client.post(
        f"{base}/api/auth/request-code", json={"email": "ugyldig@ugyldig.invalid"}
    )
    if res.status_code == 422:
        r.add(PASS, "Innlogging svarer og validerer")
    elif res.status_code == 404:
        r.add(FAIL, "Innlogging svarer og validerer", "/api/auth/request-code finnes ikke")
    else:
        r.add(
            WARN,
            "Innlogging svarer og validerer",
            f"Ventet 422 for en ugyldig adresse, fikk HTTP {res.status_code}",
        )


def check_security_headers(client: httpx.Client, base: str, r: Report) -> None:
    res = client.get(base)
    headers = {k.lower(): v for k, v in res.headers.items()}

    if headers.get("x-content-type-options", "").lower() == "nosniff":
        r.add(PASS, "nosniff er satt")
    else:
        r.add(
            WARN,
            "nosniff er satt",
            "Uten den gjetter nettleseren innholdstype fra bytene, og en\n"
            "opplasting som utgir seg for å være et bilde blir tolket som\n"
            "det den egentlig er. Se deploy/nginx.conf.",
        )

    if base.startswith("https://"):
        r.add(PASS, "Serveres over HTTPS")
    else:
        r.add(
            FAIL,
            "Serveres over HTTPS",
            "Sesjonscookien settes med Secure og sendes da aldri over http.\n"
            "Innlogging vil ikke fungere i det hele tatt.",
        )


def check_spa_routing(client: httpx.Client, base: str, r: Report) -> None:
    """A deep link must serve the app, not a 404 from the web server."""
    res = client.get(f"{base}/anlegg/1")
    if res.status_code == 200 and "<div id=\"root\"" in res.text:
        r.add(PASS, "Dyplenker serverer appen")
    else:
        r.add(
            FAIL,
            "Dyplenker serverer appen",
            f"/anlegg/1 ga HTTP {res.status_code}. Uten try_files-fallback\n"
            "virker navigasjon i appen, men en oppdatering av siden gir 404.",
        )


def check_api_same_origin(client: httpx.Client, base: str, r: Report) -> None:
    """Confirm the API is reachable under the app's own origin."""
    res = client.get(f"{base}/api/health")
    if res.status_code == 200:
        r.add(PASS, "API-et ligger under samme opphav")
    else:
        r.add(
            WARN,
            "API-et ligger under samme opphav",
            "Ikke nådd på /api under samme vert. Det er greit hvis API-et har\n"
            "eget underdomene — men da må CORS_ORIGINS være satt.",
        )


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    base = sys.argv[1].rstrip("/")
    print(f"\nSjekker {base}\n")

    r = Report()
    with httpx.Client(timeout=20, follow_redirects=True) as client:
        check_health(client, base, r)
        check_api_same_origin(client, base, r)
        check_requires_auth(client, base, r)
        check_system_closed(client, base, r)
        check_signin_reachable(client, base, r)
        check_security_headers(client, base, r)
        check_spa_routing(client, base, r)

    code = r.show()
    print()
    print("  Merk: dette sier ingenting om e-postlevering, som er det som")
    print("  faktisk avgjør om noen kommer seg inn. Bruk scripts/test_email.py")
    print("  til det, og sjekk at koden lander i innboksen — ikke i søppelpost.")
    print()
    return code


if __name__ == "__main__":
    raise SystemExit(main())
