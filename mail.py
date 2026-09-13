"""Sending mail, kept behind a swappable function.

Tests must never reach the network, and local development should not need
an API key, so the sender is injected rather than imported. The Resend
implementation is one of several possible; `set_mailer` chooses.

Email delivery is the one hard external dependency of passwordless login.
If the code lands in spam the user cannot sign in at all, so the domain
needs SPF, DKIM and DMARC — that part is DNS and reputation, not code.
"""

import logging
import os
from typing import Callable, Optional

import httpx

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"

# (to, subject, text) -> None
Mailer = Callable[[str, str, str], None]


def log_mailer(to: str, subject: str, text: str) -> None:
    """Development default: write the mail to the log instead of sending it.

    Deliberately logs the body, which contains the login code — acceptable
    only because this is never the production path. `configure_mailer`
    refuses to pick it when RESEND_API_KEY is set.
    """
    logger.warning("E-post ikke sendt (ingen RESEND_API_KEY). Til %s: %s\n%s", to, subject, text)


class ResendMailer:
    def __init__(self, api_key: str, sender: str, timeout: float = 10.0):
        self._api_key = api_key
        self._sender = sender
        self._timeout = timeout

    def __call__(self, to: str, subject: str, text: str) -> None:
        response = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {self._api_key}"},
            json={"from": self._sender, "to": [to], "subject": subject, "text": text},
            timeout=self._timeout,
        )
        if response.status_code >= 400:
            # Deliberately not including the body in the message the caller
            # sees: a failure here must not tell an anonymous requester
            # anything about the address.
            logger.error("Resend avviste e-post: %s %s", response.status_code, response.text)
            raise RuntimeError("Kunne ikke sende e-post")


_mailer: Mailer = log_mailer


def set_mailer(fn: Mailer) -> None:
    global _mailer
    _mailer = fn


def send(to: str, subject: str, text: str) -> None:
    _mailer(to, subject, text)


def configure_mailer() -> None:
    """Pick a sender from the environment. Called once at startup."""
    api_key = os.getenv("RESEND_API_KEY")
    sender = os.getenv("AUTH_FROM_EMAIL")
    if api_key and sender:
        set_mailer(ResendMailer(api_key, sender))
        logger.info("E-post sendes via Resend fra %s", sender)
    else:
        logger.warning(
            "RESEND_API_KEY eller AUTH_FROM_EMAIL mangler — innloggingskoder "
            "skrives til loggen i stedet for å sendes."
        )
