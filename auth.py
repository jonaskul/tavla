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

from dataclasses import dataclass
from typing import Callable, Optional

from fastapi import Depends, Request
from sqlmodel import Session, select

from database import get_session
from models import Membership, Role, User

DEFAULT_USER_EMAIL = "lokal@tavla.local"


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
