"""Who is calling.

Deliberately separate from tenancy.py, which answers *which organization*
a request acts as. This module answers *which person*, and nothing else
depends on how that answer is produced.

There is no login yet. The default authenticator returns the sole user of
a single-user install, so the app behaves exactly as before while every
request now travels the authenticated path. Swapping in real login is one
call to `set_authenticator` at startup — the routers, the row-level
security policies and the tests do not move.

That indirection is the point. Whether identity ends up coming from our
own one-time codes or from an external provider, only the function
registered here changes. User.external_auth_id is nullable for the same
reason: with our own login it stays empty and User.id is the identity;
with a provider it gets filled in and matched on email.

Note the authenticator only ever *reads*. Creating the first user is
startup's job (see tenancy.bootstrap_single_user_install), not something
that should happen as a side effect of an unauthenticated request.
"""

import logging
import os
from dataclasses import dataclass
from datetime import timedelta
from typing import Callable, Optional

from fastapi import Depends, Request
from sqlmodel import Session, select

from database import get_session
from models import Membership, Role, User, UserSession, as_utc, utcnow

logger = logging.getLogger(__name__)

DEFAULT_USER_EMAIL = "lokal@tavla.local"

# Self-hosted single-user installs opt out of login with AUTH_MODE=single_user.
# The default is real authentication: a deployment that forgets to configure
# anything must end up closed, not open.
SINGLE_USER_MODE = "single_user"


@dataclass(frozen=True)
class Principal:
    """An authenticated person. Never built from unvalidated input."""

    user_id: int
    email: str
    external_auth_id: Optional[str] = None


# (request, session) -> Principal or None. None means "not signed in", which
# every layer below treats as "sees nothing" rather than "sees everything".
Authenticator = Callable[[Request, Session], Optional[Principal]]


def ensure_single_user(session: Session, organization_id: int) -> Principal:
    """Create the install's one user and its membership, if absent."""
    user = session.exec(select(User).order_by(User.id)).first()
    if user is None:
        user = User(email=DEFAULT_USER_EMAIL)
        session.add(user)
        session.commit()
        session.refresh(user)

    membership = session.exec(
        select(Membership)
        .where(Membership.user_id == user.id)
        .where(Membership.organization_id == organization_id)
    ).first()
    if membership is None:
        session.add(
            Membership(
                user_id=user.id, organization_id=organization_id, role=Role.owner
            )
        )
        session.commit()

    return Principal(user_id=user.id, email=user.email)


def single_user_authenticator(request: Request, session: Session) -> Optional[Principal]:
    """Stand-in until login exists: every caller is the install's only user."""
    user = session.exec(select(User).order_by(User.id)).first()
    if user is None:
        return None
    return Principal(
        user_id=user.id, email=user.email, external_auth_id=user.external_auth_id
    )


def session_cookie_authenticator(
    request: Request, session: Session
) -> Optional[Principal]:
    """Identify the caller by their session cookie.

    Every rejection path returns None rather than raising, so an expired,
    revoked or forged cookie is indistinguishable from not being signed in
    — and both mean "sees nothing".
    """
    # Imported here rather than at module scope: routers/auth.py imports
    # this module, so a top-level import would be circular.
    from routers.auth import SESSION_COOKIE, _hash_token

    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return None

    row = session.exec(
        select(UserSession).where(UserSession.token_hash == _hash_token(token))
    ).first()
    if row is None or row.revoked_at is not None or as_utc(row.expires_at) < utcnow():
        return None

    user = session.get(User, row.user_id)
    if user is None:
        return None

    # Cheap liveness signal, useful for showing someone their active
    # sessions later. Throttled so a busy client is not a write per request.
    now = utcnow()
    if (now - as_utc(row.last_seen_at)) > timedelta(hours=1):
        row.last_seen_at = now
        session.add(row)
        session.commit()

    return Principal(
        user_id=user.id, email=user.email, external_auth_id=user.external_auth_id
    )


_authenticator: Authenticator = single_user_authenticator


def set_authenticator(fn: Authenticator) -> None:
    """Replace how callers are identified. Called once at startup."""
    global _authenticator
    _authenticator = fn


def current_principal(
    request: Request, session: Session = Depends(get_session)
) -> Optional[Principal]:
    """The person behind this request, or None if nobody is signed in."""
    return _authenticator(request, session)


def single_user_mode() -> bool:
    return os.getenv("AUTH_MODE", "session") == SINGLE_USER_MODE


def configure_authentication() -> None:
    """Choose how callers are identified. Called once at startup."""
    if single_user_mode():
        set_authenticator(single_user_authenticator)
        logger.warning(
            "AUTH_MODE=single_user — ingen innlogging. Alle forespørsler "
            "behandles som installasjonens eneste bruker."
        )
    else:
        set_authenticator(session_cookie_authenticator)
        logger.info("Innlogging med engangskode er aktiv.")
