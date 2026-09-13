"""Everything the deployment needs to be told, in one place.

Read once at import, validated once at startup. The point of validating is
that a misconfigured deployment should fail immediately and say what is
missing, rather than start up and misbehave in a way nobody notices —
sessions that silently reset on every restart, sign-in codes that go
nowhere, a browser that cannot reach the API.
"""

import os
import secrets
from typing import List, Optional

TAVLA_ENV = os.getenv("TAVLA_ENV", "development").lower()
IS_PRODUCTION = TAVLA_ENV == "production"

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./tavla.db")

# Origins allowed to call the API from a browser. Empty in development means
# the Vite dev server default below.
_raw_origins = os.getenv("CORS_ORIGINS", "")
CORS_ORIGINS: List[str] = (
    [o.strip() for o in _raw_origins.split(",") if o.strip()]
    if _raw_origins
    else ([] if IS_PRODUCTION else ["http://localhost:5173"])
)

# Cookies.
#
# SameSite is the one that catches people out. "lax" is the right default and
# is what protects the mutating endpoints from cross-site requests, but the
# browser decides "same site" by registrable domain, not by host. Everything
# under digibygg.io is therefore the same site — tavla.digibygg.io and
# api.tavla.digibygg.io included — and this stays "lax". Only a split across
# unrelated domains (pages.dev and fly.dev, say) would force "none", which
# requires Secure and gives up the CSRF protection Lax was providing.
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "1") != "0"
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax").lower()
# Leave unset. Host-only means the cookie goes back only to the host that
# set it; a value here would hand it to every subdomain of digibygg.io.
COOKIE_DOMAIN: Optional[str] = os.getenv("COOKIE_DOMAIN") or None

# Keys the sign-in codes and sessions are derived from. Without it a random
# one is generated per process, so every restart signs everybody out.
SESSION_SECRET: Optional[str] = os.getenv("SESSION_SECRET") or None

RESEND_API_KEY: Optional[str] = os.getenv("RESEND_API_KEY") or None
AUTH_FROM_EMAIL: Optional[str] = os.getenv("AUTH_FROM_EMAIL") or None

# "single_user" turns authentication off for a self-hosted install. The
# default is real authentication: a deployment that configures nothing has
# to end up closed rather than open.
AUTH_MODE = os.getenv("AUTH_MODE", "session")
SINGLE_USER_MODE = AUTH_MODE == "single_user"

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()


class ConfigError(RuntimeError):
    pass


def validate() -> List[str]:
    """Refuse to start a production deployment that cannot work.

    Returns warnings worth logging. Raises for anything that would make the
    service quietly wrong.
    """
    warnings: List[str] = []

    if not IS_PRODUCTION:
        if not SESSION_SECRET:
            warnings.append(
                "SESSION_SECRET er ikke satt — en tilfeldig nøkkel brukes, og "
                "alle blir logget ut ved omstart."
            )
        if not (RESEND_API_KEY and AUTH_FROM_EMAIL):
            warnings.append(
                "RESEND_API_KEY/AUTH_FROM_EMAIL mangler — innloggingskoder "
                "skrives til loggen i stedet for å sendes."
            )
        return warnings

    missing = []
    if not SESSION_SECRET:
        missing.append("SESSION_SECRET")
    if not SINGLE_USER_MODE:
        # Without these nobody can sign in at all, which is worse than
        # failing to start.
        if not RESEND_API_KEY:
            missing.append("RESEND_API_KEY")
        if not AUTH_FROM_EMAIL:
            missing.append("AUTH_FROM_EMAIL")

    if missing:
        raise ConfigError(
            "Mangler i produksjonskonfigurasjon: " + ", ".join(missing)
        )

    if not CORS_ORIGINS:
        # Legitimate when the API is served under the same origin as the
        # frontend, which is the simplest deployment and needs no CORS at
        # all. Refusing to start would block that. Empty also fails in the
        # safe direction — nothing is allowed rather than a stale dev origin
        # slipping through — and a frontend that cannot reach the API is
        # obvious immediately, unlike the quiet misconfigurations above.
        warnings.append(
            "CORS_ORIGINS er tom. Riktig hvis API-et serveres under samme "
            "opphav som frontenden; ellers når ikke nettleseren API-et."
        )

    if DATABASE_URL.startswith("sqlite"):
        warnings.append(
            "DATABASE_URL peker på SQLite. Rad-nivå sikkerhet finnes ikke der, "
            "så isolasjon mellom kunder hviler kun på applikasjonslaget."
        )
    if SINGLE_USER_MODE:
        warnings.append(
            "AUTH_MODE=single_user i produksjon — alle forespørsler behandles "
            "som samme bruker, uten innlogging."
        )
    if COOKIE_SAMESITE == "none" and not COOKIE_SECURE:
        raise ConfigError("COOKIE_SAMESITE=none krever COOKIE_SECURE=1")
    if not COOKIE_SECURE:
        warnings.append("COOKIE_SECURE=0 i produksjon — sesjonen sendes ukryptert.")

    return warnings


def session_secret_bytes() -> bytes:
    """The key, or an ephemeral one in development."""
    if SESSION_SECRET:
        return SESSION_SECRET.encode()
    global _EPHEMERAL
    if _EPHEMERAL is None:
        _EPHEMERAL = secrets.token_bytes(32)
    return _EPHEMERAL


_EPHEMERAL: Optional[bytes] = None
