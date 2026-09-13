"""The single place that decides which organization a request acts as.

There is exactly one organization today and no authentication, so
`current_organization_id` resolves to it. The point of routing everything
through here now is that when auth lands, only this module changes — not
the seventeen endpoints that create rows.

Two mechanisms:

1. `CurrentOrg` — a FastAPI dependency giving the acting organization id.
   Use it to scope queries.

2. A flush listener that stamps `organization_id` on every new tenant row
   that does not already have one. Threading the id manually through every
   create endpoint is exactly the "remember to do it everywhere" pattern
   that already failed in this codebase: delete_panel guarded circuits but
   forgot modules, delete_circuit guarded connection points but forgot
   equipment. Two of five sites, silently wrong. Stamping centrally means
   a new endpoint cannot forget.

The acting organization lives in `Session.info`, not a ContextVar. Sync
dependencies and sync endpoints run in *different* threadpool threads, so
a ContextVar set while resolving the dependency is invisible to the
endpoint. The session object is shared by both, and it is also what the
flush listener receives.

Scoping reads is deliberately lighter. Once this runs on PostgreSQL, row
level security enforces isolation in the database, which is the only place
it cannot be bypassed by a missed WHERE clause. The dependency below is
what will set the session variable those policies read.
"""

from typing import Annotated, Optional

from fastapi import Depends, HTTPException, Request
from sqlalchemy import event
from sqlmodel import Session, select

from auth import Principal, current_principal, ensure_single_user
from database import get_session
from models import Membership, Organization, TENANT_MODELS

SESSION_KEY = "organization_id"

# Names which of the caller's organizations to act as. Optional for anyone
# who belongs to exactly one, which is everybody until teams exist.
ORG_HEADER = "X-Organization-Id"

DEFAULT_ORG_NAME = "Standard"


RLS_SETTING = "app.organization_id"
_SET_RLS = f"SELECT set_config('{RLS_SETTING}', %s, true)"


def session_organization(session: Session) -> Optional[int]:
    return session.info.get(SESSION_KEY)


def _tell_postgres(connection, org_id: int) -> None:
    """Publish the acting organization to the row-level security policies.

    set_config(..., true) is transaction-local, so it cannot leak to the next
    request that borrows this pooled connection. The cost is that it has to be
    re-applied after every commit — see the after_begin listener.
    """
    if connection.dialect.name != "postgresql":
        return
    connection.exec_driver_sql(_SET_RLS, (str(org_id),))


def bind_organization(session: Session, org_id: Optional[int]) -> None:
    session.info[SESSION_KEY] = org_id
    if org_id is None:
        return
    # A transaction is usually already open by now — the query that looked the
    # organization up started one, and after_begin fired before we knew the
    # answer. Apply to that transaction as well, or the rest of this request
    # would see nothing.
    if session.in_transaction():
        _tell_postgres(session.connection(), org_id)


@event.listens_for(Session, "after_begin")
def _reapply_on_new_transaction(session, transaction, connection):
    """Re-publish the organization when a new transaction starts.

    Several endpoints commit more than once per request (create_equipment
    commits three times). Each commit ends the transaction and with it the
    local setting, so without this the statements after the first commit
    would match no rows.
    """
    org_id = session_organization(session)
    if org_id is not None:
        _tell_postgres(connection, org_id)


def ensure_default_organization(session: Session) -> Organization:
    """Return the single organization, creating it if this is a fresh database."""
    org = session.exec(select(Organization).order_by(Organization.id)).first()
    if org is None:
        org = Organization(name=DEFAULT_ORG_NAME)
        session.add(org)
        session.commit()
        session.refresh(org)
    return org


def bootstrap_single_user_install(session: Session) -> None:
    """Give a fresh database the organization, user and membership it needs.

    Startup's job, not the authenticator's: creating a user must not be a
    side effect of an unauthenticated request. Goes away once sign-up
    exists.
    """
    org = ensure_default_organization(session)
    ensure_single_user(session, org.id)


def _memberships(session: Session, user_id: int):
    return session.exec(
        select(Membership)
        .where(Membership.user_id == user_id)
        .order_by(Membership.id)
    ).all()


def resolve_organization(
    request: Request, principal: Optional[Principal], session: Session
) -> Optional[int]:
    """Which of the caller's organizations this request acts as.

    A person can belong to several — an electrician documenting customers'
    installations who also documents their own house. The header names
    which one; with a single membership it can be left out.

    Every path that is not a confirmed membership returns None, and None
    means the request sees nothing. An unknown header value is therefore
    not an error to route around but simply not a membership.
    """
    if principal is None:
        return None

    memberships = _memberships(session, principal.user_id)
    if not memberships:
        return None

    requested = request.headers.get(ORG_HEADER)
    if requested is not None:
        try:
            wanted = int(requested)
        except ValueError:
            return None
        return wanted if any(m.organization_id == wanted for m in memberships) else None

    # No header: the oldest membership, which is the only one for everybody
    # who belongs to a single organization.
    return memberships[0].organization_id


def current_organization_id(
    request: Request,
    principal: Optional[Principal] = Depends(current_principal),
    session: Session = Depends(get_session),
) -> Optional[int]:
    """The organization this request acts as, or None if nobody is signed in."""
    org_id = session_organization(session)
    if org_id is not None:
        return org_id

    org_id = resolve_organization(request, principal, session)
    if org_id is not None:
        bind_organization(session, org_id)
    return org_id


def require_organization(
    org_id: Optional[int] = Depends(current_organization_id),
) -> int:
    """For endpoints that cannot do anything useful without a tenant."""
    if org_id is None:
        raise HTTPException(status_code=401, detail="Ikke innlogget")
    return org_id


CurrentOrg = Annotated[int, Depends(require_organization)]


# Reachable without signing in. Everything else is refused, so a new
# endpoint is protected by default rather than by remembering to protect
# it — including /api/system, which shells out to git and systemctl.
PUBLIC_PATHS = frozenset({
    "/api/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    # Signing in cannot require being signed in. These four are the entire
    # unauthenticated surface, and each guards itself: request-code answers
    # identically whatever the address, verify is rate limited and constant
    # time, logout is idempotent, and me returns 401 on its own.
    "/api/auth/request-code",
    "/api/auth/verify",
    "/api/auth/logout",
    "/api/auth/me",
})


def guard_request(
    request: Request, org_id: Optional[int] = Depends(current_organization_id)
) -> None:
    """Bind the acting tenant, and refuse anything needing one without it.

    Applied once at the application level. Declaring CurrentOrg on each
    endpoint instead would leave a create endpoint that forgot it writing a
    row with no organization — which surfaces as a 500 from a NOT NULL
    violation rather than a 401, and would be a hole the day that column
    stops being NOT NULL.
    """
    if org_id is not None:
        return
    if request.url.path in PUBLIC_PATHS:
        return
    raise HTTPException(status_code=401, detail="Ikke innlogget")


@event.listens_for(Session, "before_flush")
def _stamp_organization(session, flush_context, instances):
    """Fill in organization_id on new tenant rows that lack one."""
    org_id = session_organization(session)
    if org_id is None:
        return
    for obj in session.new:
        if isinstance(obj, TENANT_MODELS) and getattr(obj, "organization_id", None) is None:
            obj.organization_id = org_id
