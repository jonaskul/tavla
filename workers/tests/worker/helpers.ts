/**
 * A client that keeps its cookies, the way a browser and httpx's Session do.
 *
 * Sign-in is a sequence — request, verify, then use the session — and the
 * thing being tested is precisely what carries between the steps. A helper
 * that dropped Set-Cookie would make every test below pass for the wrong
 * reason.
 */

import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";

import { createApp } from "../../src/app";
import { setMailer } from "../../src/mail";

const app = createApp();

export class Client {
  private cookies = new Map<string, string>();

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (this.cookies.size > 0) {
      headers.set(
        "cookie",
        [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      );
    }
    if (init.body !== undefined) headers.set("content-type", "application/json");

    const ctx = createExecutionContext();
    const response = await app.fetch(
      new Request(`https://tavla.test${path}`, { ...init, headers }),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);

    this.absorb(response);
    return response;
  }

  post(path: string, body?: unknown): Promise<Response> {
    return this.fetch(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  get(path: string): Promise<Response> {
    return this.fetch(path, { method: "GET" });
  }

  cookie(name: string): string | undefined {
    return this.cookies.get(name);
  }

  setCookie(name: string, value: string): void {
    this.cookies.set(name, value);
  }

  private absorb(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(";");
      const index = pair.indexOf("=");
      if (index === -1) continue;
      const name = pair.slice(0, index).trim();
      const value = pair.slice(index + 1).trim();
      // An empty value is how a cookie is deleted.
      if (value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

/** Capture mail instead of sending it, and read the code as the user would. */
export function outbox(): Array<[string, string, string]> {
  const sent: Array<[string, string, string]> = [];
  setMailer(async (to, subject, text) => {
    sent.push([to, subject, text]);
  });
  return sent;
}

export function codeFrom(sent: Array<[string, string, string]>): string {
  const body = sent[sent.length - 1][2];
  const match = body.match(/\b(\d{6})\b/);
  if (!match) throw new Error(`ingen kode i e-posten: ${body}`);
  return match[1];
}

export async function signIn(
  client: Client,
  sent: Array<[string, string, string]>,
  email = "ola@example.com",
): Promise<Response> {
  const requested = await client.post("/api/auth/request-code", { email });
  if (requested.status !== 200) throw new Error(`request-code ga ${requested.status}`);
  const verified = await client.post("/api/auth/verify", {
    email,
    code: codeFrom(sent),
  });
  if (verified.status !== 200) {
    throw new Error(`verify ga ${verified.status}: ${await verified.text()}`);
  }
  return verified;
}
