#!/usr/bin/env python3
"""Send one test message, and say plainly what happened.

Email delivery is the only part of this deployment that cannot be
rehearsed locally, and the only part that fails in a way the application
deliberately hides: request-code answers the same whether or not the mail
went out, so that it cannot be used to discover which addresses have
accounts. That is right for the endpoint and useless for debugging.

So debug it here instead, before anything else is deployed:

    RESEND_API_KEY=re_... \\
    AUTH_FROM_EMAIL='Tavla <innlogging@tavla.digibygg.io>' \\
    python scripts/test_email.py deg@example.com
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import config  # noqa: E402
import mail  # noqa: E402

logging.basicConfig(level="INFO", format="%(levelname)-8s %(message)s")


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2

    to = sys.argv[1]

    if not config.RESEND_API_KEY:
        print("RESEND_API_KEY er ikke satt — ingenting ville blitt sendt.")
        return 1
    if not config.AUTH_FROM_EMAIL:
        print("AUTH_FROM_EMAIL er ikke satt — ingenting ville blitt sendt.")
        return 1

    sender_domain = config.AUTH_FROM_EMAIL.split("@")[-1].rstrip(">").strip()
    print(f"Sender fra : {config.AUTH_FROM_EMAIL}")
    print(f"Til        : {to}")
    print(f"Domenet i avsenderadressen er '{sender_domain}'.")
    print("Det MÅ være et domene som er verifisert i Resend, ellers svarer")
    print("Resend 403 — og i appen ser det ut som innlogging virker, bortsett")
    print("fra at koden aldri kommer fram.\n")

    mail.configure_mailer()
    try:
        mail.send(
            to,
            "Testmelding fra Tavla",
            "Kommer denne fram, er oppsettet for innloggingskoder i orden.\n\n"
            "Sjekk også at den ikke havnet i søppelpost — havner koden der, "
            "kommer ingen seg inn.",
        )
    except mail.MailNotReached as exc:
        print(f"\nNÅDDE IKKE RESEND: {exc}")
        print("Forespørselen kom aldri fram. Det er nettverk, DNS eller en")
        print("brannmur/proxy som blokkerer api.resend.com — ikke nøkkelen")
        print("eller domenet.")
        return 1
    except mail.MailRejected as exc:
        print(f"\nRESEND AVVISTE SENDINGEN: {exc}")
        print("Forespørselen kom fram og ble nektet. Vanligste årsaker:")
        print("  403 — avsenderdomenet er ikke verifisert, eller nøkkelen er feil")
        print("  422 — avsenderadressen er ikke gyldig for det verifiserte domenet")
        print("Se ERROR-linjen over for Resends eget svar.")
        return 1
    except Exception as exc:
        print(f"\nFEILET: {type(exc).__name__}: {exc}")
        return 1

    print("\nSendt uten feil fra Resend.")
    print("Sjekk innboksen OG søppelposten. Ligger den i søppelpost, mangler")
    print("eller er SPF/DKIM/DMARC feil — og da er innlogging i praksis ødelagt")
    print("selv om alt annet virker.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
