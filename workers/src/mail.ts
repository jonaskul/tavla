/**
 * Sending mail, kept behind a swappable function.
 *
 * Tests must never reach the network and local development should not need
 * an API key, so the sender is chosen rather than imported. Resend over
 * `fetch()` instead of httpx; otherwise this is mail.py.
 *
 * Email delivery is the one hard external dependency of passwordless
 * login. If the code lands in spam the user cannot sign in at all, so the
 * sending domain needs SPF, DKIM and DMARC — DNS and reputation, not code.
 */

import type { Bindings } from "./config";

const RESEND_API_URL = "https://api.resend.com/emails";

export type Mailer = (to: string, subject: string, text: string) => Promise<void>;

export class MailNotReached extends Error {}
export class MailRejected extends Error {}

/**
 * Development default: write the mail to the log instead of sending it.
 *
 * Deliberately logs the body, which contains the login code. Acceptable
 * only because `mailerFor` never picks this once RESEND_API_KEY is set.
 */
export const logMailer: Mailer = async (to, subject, text) => {
  console.warn(
    `E-post ikke sendt (ingen RESEND_API_KEY). Til ${to}: ${subject}\n${text}`,
  );
};

export function resendMailer(apiKey: string, sender: string): Mailer {
  return async (to, subject, text) => {
    // Two failures worth telling apart. Not reaching Resend at all is a
    // network, DNS or firewall problem; being rejected by it is a key,
    // domain or payload problem. They look identical from the outside and
    // are debugged in completely different places.
    let response: Response;
    try {
      response = await fetch(RESEND_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ from: sender, to: [to], subject, text }),
      });
    } catch (error) {
      console.error("Nådde ikke Resend:", error);
      throw new MailNotReached(String(error));
    }

    if (response.status >= 400) {
      // The body goes to the log, not to the caller: a failure here must
      // not tell an anonymous requester anything about the address it was
      // asked to send to.
      console.error(
        "Resend avviste e-post:",
        response.status,
        await response.text(),
      );
      throw new MailRejected(`Resend svarte ${response.status}`);
    }
  };
}

/**
 * A test override, mirroring mail.set_mailer.
 *
 * Set at module scope by a test and never per request, so it is not the
 * shared mutable state it might look like. Nothing in the application
 * calls it.
 */
let override: Mailer | null = null;

export function setMailer(fn: Mailer | null): void {
  override = fn;
}

export function mailerFor(env: Bindings): Mailer {
  if (override) return override;
  if (env.RESEND_API_KEY && env.AUTH_FROM_EMAIL) {
    return resendMailer(env.RESEND_API_KEY, env.AUTH_FROM_EMAIL);
  }
  return logMailer;
}
