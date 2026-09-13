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

from fastapi import Depends
from sqlalchemy import event
from sqlmodel import Session, select

from database import get_session
from models import Organization, TENANT_MODELS

SESSION_KEY = "organization_id"

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


def current_organization_id(session: Session = Depends(get_session)) -> int:
    """The organization this request acts as.

    Today: the one organization that exists. When auth lands this reads the
    authenticated user's active membership, and every caller below is
    already written against it.
    """
    org_id = session_organization(session)
    if org_id is None:
        org_id = ensure_default_organization(session).id
        bind_organization(session, org_id)
    return org_id


CurrentOrg = Annotated[int, Depends(current_organization_id)]


@event.listens_for(Session, "before_flush")
def _stamp_organization(session, flush_context, instances):
    """Fill in organization_id on new tenant rows that lack one."""
    org_id = session_organization(session)
    if org_id is None:
        return
    for obj in session.new:
        if isinstance(obj, TENANT_MODELS) and getattr(obj, "organization_id", None) is None:
            obj.organization_id = org_id
