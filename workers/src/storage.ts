/**
 * Where uploaded files live, and the checks they pass on the way in.
 *
 * This is the one place the Workers version is simpler than the Python
 * one. R2 is a binding: no endpoint, no credentials, no signing, no boto3.
 * storage.py exists largely to hide an S3 client behind an interface so a
 * local checkout needs no keys — a problem that does not arise here.
 *
 * What is carried over unchanged is the part that matters: the checks.
 * They lived copied into three routers once, so a fix to one silently
 * missed the other two, and they are in one function here for the same
 * reason.
 *
 * Serving still goes through the API rather than a presigned URL. A
 * presigned URL works for whoever holds it, and these are photographs of
 * the inside of customers' homes, so the tenant check runs on every read.
 */

import type { Bindings } from "./config";

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const ALLOWED = new Set(["image/jpeg", "image/png", "application/pdf"]);

/**
 * What the bytes say they are.
 *
 * Trusted over the Content-Type header, which the client chooses and can
 * simply be wrong about — or lying about. A PDF sent as image/jpeg is
 * stored as a PDF.
 */
const MAGIC: Array<[Uint8Array, string]> = [
  [new Uint8Array([0xff, 0xd8, 0xff]), "image/jpeg"],
  [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), "image/png"],
  [new Uint8Array([0x25, 0x50, 0x44, 0x46]), "application/pdf"], // %PDF
];

export class RejectedUpload extends Error {
  /** 413 for size, 400 for everything else: a client can act on the
   * difference between "too big" and "wrong kind of file". */
  constructor(message: string, readonly tooBig = false) {
    super(message);
  }
}

export function detectMimetype(head: Uint8Array): string | null {
  for (const [magic, mime] of MAGIC) {
    if (head.length < magic.length) continue;
    if (magic.every((byte, i) => head[i] === byte)) return mime;
  }
  return null;
}

/**
 * What this file actually is, or null if it is not something we accept.
 *
 * Magic bytes win. The header is only consulted when the bytes say
 * nothing, which is why a file can still be stored as a type it is not —
 * a gap worth closing, but closing it would reject formats whose magic is
 * not in the table above. A deliberate decision rather than an oversight.
 */
export function resolveMimetype(head: Uint8Array, contentType: string): string | null {
  const magic = detectMimetype(head);
  if (magic !== null) return ALLOWED.has(magic) ? magic : null;
  return ALLOWED.has(contentType) ? contentType : null;
}

/**
 * Reduce a client-supplied name to something safe to store and show.
 *
 * The name never reaches a filesystem — the stored key is a uuid — so this
 * is about what gets displayed and sent back in Content-Disposition, not
 * about traversal.
 *
 * The character class is Unicode-aware on purpose. Python's \w matches
 * letters in any script, so "kjøkkenskap.jpg" survived there; JavaScript's
 * \w is ASCII only and would have turned it into "kj_kkenskap.jpg".
 */
export function sanitizeFilename(filename: string): string {
  let name = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  name = name.replace(/\.\.+/g, ".");
  name = name.replace(/[^\p{L}\p{N}_\-. ]/gu, "_");
  name = name.replace(/^[. ]+|[. ]+$/g, "");
  return name || "file";
}

/**
 * Where a file goes in the bucket.
 *
 * Prefixed by organization so a bucket listing is separated by tenant and
 * a misdirected read is obvious rather than subtle. The name itself is a
 * uuid: the client's filename is kept in the database for display and
 * never used as a path.
 */
export function buildKey(organizationId: number, filename: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot > 0 ? filename.slice(dot).toLowerCase().slice(0, 10) : "";
  return `org-${organizationId}/${crypto.randomUUID()}${ext}`;
}

export interface StoredFile {
  key: string;
  mimetype: string;
  filename: string;
  size: number;
}

/**
 * Check an upload and store it.
 *
 * The order matters: everything that can refuse the file happens before a
 * single byte reaches R2, so a rejected upload leaves nothing behind to
 * pay for.
 */
export async function accept(
  env: Bindings,
  content: ArrayBuffer,
  filename: string,
  contentType: string,
  organizationId: number,
): Promise<StoredFile> {
  if (content.byteLength > MAX_FILE_SIZE) {
    throw new RejectedUpload(
      `Filen er for stor. Maks ${MAX_FILE_SIZE / (1024 * 1024)} MB`,
      true,
    );
  }

  const mimetype = resolveMimetype(new Uint8Array(content.slice(0, 8)), contentType);
  if (mimetype === null) {
    throw new RejectedUpload("Filtype ikke støttet. Kun JPG, PNG og PDF er tillatt.");
  }

  const safeName = sanitizeFilename(filename || "file");
  const key = buildKey(organizationId, safeName);
  await env.FILES.put(key, content, {
    httpMetadata: { contentType: mimetype },
  });

  return { key, mimetype, filename: safeName, size: content.byteLength };
}

export function read(env: Bindings, key: string): Promise<R2ObjectBody | null> {
  return env.FILES.get(key);
}

export function discard(env: Bindings, key: string): Promise<void> {
  return env.FILES.delete(key);
}
