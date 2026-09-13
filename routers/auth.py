"""Passwordless sign-in with one-time codes.

A six-digit code rather than a magic link on purpose: mail apps often open
links in an embedded browser that does not share the session, so the user
ends up signed in somewhere they cannot see. A code lets them stay in the
tab they started in, and works when mail is read on a different device.

The mechanism is small. What it costs is the care around it, so the
choices are spelled out where they are made:

- Requesting a code always answers the same way, so the endpoint cannot be
  used to discover which addresses have accounts.
- Codes are rate limited per address and per IP: without that this is both
  an email-flooding tool and a way to grind through the code space.
- A code is single use, short lived, and dies after a few wrong guesses.
- Comparison is constant time, against an HMAC rather than a bare hash.
- Signing in issues a server-side session, so signing out is immediate.
"""

import hashlib
import hmac
import logging
import os
import secrets
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr
from sqlmodel import Session, select

import mail
from auth import Principal, current_principal
from database import get_session
from models import (
    LoginCode, Membership, Organization, Role, User, UserSession, as_utc, utcnow,
)

logger = logging.getLogger(__name__)

router = APIRouter()

CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
# A fresh code per request would let anyone fill an inbox; these caps are
# what stops that as well as grinding the code space.
MAX_CODES_PER_EMAIL = 3
EMAIL_WINDOW = timedelta(minutes=15)
MAX_CODES_PER_IP = 10
IP_WINDOW = timedelta(hours=1)

SESSION_COOKIE = "tavla_session"
SESSION_TTL = timedelta(days=30)

# Same answer whether or not the address has an account.
NEUTRAL_REPLY = {"ok": True, "detail": "Hvis adressen er gyldig, er en kode sendt."}


def _secret() -> bytes:
    """Key for the code HMAC.

    Without SESSION_SECRET a random one is generated per process: codes
    then stop working across a restart, which is an inconvenience in
    development and impossible in production, where the variable must be
    set. Failing that way round is deliberate — the alternative is a
    hard-coded default that silently ships.
    """
    configured = os.getenv("SESSION_SECRET")
    if configured:
        return configured.encode()
    global _EPHEMERAL_SECRET
    if _EPHEMERAL_SECRET is None:
        _EPHEMERAL_SECRET = secrets.token_bytes(32)
        logger.warning(
            "SESSION_SECRET er ikke satt — bruker en tilfeldig nøkkel som "
            "forsvinner ved omstart. Sett den i produksjon."
        )
    return _EPHEMERAL_SECRET


_EPHEMERAL_SECRET: Optional[bytes] = None


def _hash_code(email: str, code: str) -> str:
    """HMAC, not a bare hash: six digits is a million possibilities, so a
    plain SHA-256 would be reversible by brute force from a database dump."""
    return hmac.new(_secret(), f"{email}:{code}".encode(), hashlib.sha256).hexdigest()


def _hash_token(token: str) -> str:
    """Session tokens carry 256 bits, so a plain hash is enough here."""
    return hashlib.sha256(token.encode()).hexdigest()


def _normalise(email: str) -> str:
    return email.strip().lower()


def _client_ip(request: Request) -> Optional[str]:
    return request.client.host if request.client else None


def _too_many_requests(session: Session, email: str, ip: Optional[str]) -> bool:
    now = utcnow()
    recent_for_email = session.exec(
        select(LoginCode)
        .where(LoginCode.email == email)
        .where(LoginCode.created_at > now - EMAIL_WINDOW)
    ).all()
    if len(recent_for_email) >= MAX_CODES_PER_EMAIL:
        return True

    if ip:
        recent_for_ip = session.exec(
            select(LoginCode)
            .where(LoginCode.requested_ip == ip)
            .where(LoginCode.created_at > now - IP_WINDOW)
        ).all()
        if len(recent_for_ip) >= MAX_CODES_PER_IP:
            return True

    return False


class CodeRequest(BaseModel):
    email: EmailStr


class CodeVerification(BaseModel):
    email: EmailStr
    code: str


@router.post("/request-code")
def request_code(
    data: CodeRequest, request: Request, session: Session = Depends(get_session)
):
    """Send a sign-in code.

    Always answers the same, whether the address is known, unknown or rate
    limited. Anything else turns this into a way to enumerate customers.
    """
    email = _normalise(data.email)

    if _too_many_requests(session, email, _client_ip(request)):
        logger.info("Ratebegrenset kodeforespørsel for %s", email)
        return NEUTRAL_REPLY

    code = f"{secrets.randbelow(1_000_000):06d}"
    session.add(LoginCode(
        email=email,
        code_hash=_hash_code(email, code),
        expires_at=utcnow() + CODE_TTL,
        requested_ip=_client_ip(request),
    ))
    session.commit()

    try:
        mail.send(
            email,
            "Innloggingskode til Tavla",
            f"Koden din er {code}\n\n"
            f"Den er gyldig i {int(CODE_TTL.total_seconds() // 60)} minutter.\n"
            "Har du ikke bedt om den, kan du se bort fra denne e-posten.",
        )
    except Exception:
        # The code is already stored, so a delivery failure is logged rather
        # than reported: the reply must not vary with the address.
        logger.exception("Klarte ikke sende innloggingskode")

    return NEUTRAL_REPLY


def _provision(session: Session, email: str) -> User:
    """Find or create the user, and give a new one their own organization.

    Signing in for the first time is signing up; with passwordless login
    there is no separate registration step.
    """
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None:
        user = User(email=email)
        session.add(user)
        session.commit()
        session.refresh(user)

    has_membership = session.exec(
        select(Membership).where(Membership.user_id == user.id)
    ).first()
    if has_membership is None:
        org = Organization(name=email)
        session.add(org)
        session.commit()
        session.refresh(org)
        session.add(
            Membership(user_id=user.id, organization_id=org.id, role=Role.owner)
        )
        session.commit()

    return user


@router.post("/verify")
def verify_code(
    data: CodeVerification,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
):
    email = _normalise(data.email)
    now = utcnow()

    candidate = session.exec(
        select(LoginCode)
        .where(LoginCode.email == email)
        .where(LoginCode.used_at == None)  # noqa: E711
        .order_by(LoginCode.created_at.desc())
    ).first()

    invalid = HTTPException(status_code=400, detail="Ugyldig eller utløpt kode")

    if candidate is None or as_utc(candidate.expires_at) < now:
        raise invalid

    if candidate.attempts >= MAX_ATTEMPTS:
        # Burn it rather than leaving something guessable lying around.
        candidate.used_at = now
        session.add(candidate)
        session.commit()
        raise invalid

    if not hmac.compare_digest(candidate.code_hash, _hash_code(email, data.code)):
        candidate.attempts += 1
        session.add(candidate)
        session.commit()
        raise invalid

    candidate.used_at = now
    session.add(candidate)
    session.commit()

    user = _provision(session, email)

    token = secrets.token_urlsafe(32)
    session.add(UserSession(
        user_id=user.id,
        token_hash=_hash_token(token),
        expires_at=now + SESSION_TTL,
        user_agent=request.headers.get("user-agent"),
    ))
    session.commit()

    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=int(SESSION_TTL.total_seconds()),
        httponly=True,  # unreadable from JavaScript, so XSS cannot lift it
        secure=os.getenv("COOKIE_SECURE", "1") != "0",
        samesite="lax",  # blocks cross-site POST, which is the CSRF case here
        path="/",
    )
    return {"id": user.id, "email": user.email, "name": user.name}


@router.post("/logout")
def logout(
    request: Request, response: Response, session: Session = Depends(get_session)
):
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        row = session.exec(
            select(UserSession).where(UserSession.token_hash == _hash_token(token))
        ).first()
        if row and row.revoked_at is None:
            row.revoked_at = utcnow()
            session.add(row)
            session.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@router.get("/me")
def me(
    principal: Optional[Principal] = Depends(current_principal),
    session: Session = Depends(get_session),
):
    if principal is None:
        raise HTTPException(status_code=401, detail="Ikke innlogget")

    memberships = session.exec(
        select(Membership).where(Membership.user_id == principal.user_id)
    ).all()
    organizations = []
    for m in memberships:
        org = session.get(Organization, m.organization_id)
        if org:
            organizations.append({"id": org.id, "name": org.name, "role": m.role})

    return {
        "id": principal.user_id,
        "email": principal.email,
        "organizations": organizations,
    }
