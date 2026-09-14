/**
 * Opplastede filer — photographs of panels, datasheets for equipment.
 *
 * Three things here are decisions rather than mechanics.
 *
 * **The bytes travel through the worker.** Not a presigned URL, which
 * works for whoever holds it. These are pictures of the inside of
 * customers' homes, so the tenant check runs on every read.
 *
 * **The size is refused before the body is read.** The Python version read
 * the whole upload into memory and then asked whether it was too big,
 * which is a denial-of-service dressed as a validation error. A Worker has
 * a hard memory ceiling per isolate, so Content-Length is checked first
 * and the precise check happens after.
 *
 * **Deleting takes the row first, then the object.** The other order
 * leaves a row pointing at nothing and a 404 on every later read. This
 * order can leave an object nobody can reach — which costs money in a way
 * a stray file on local disk did not. See the note on the delete.
 */

import { Hono } from "hono";
import { and, eq, type SQL } from "drizzle-orm";

import * as s from "../schema";
import type { Env } from "../context";
import type { Tenant } from "../db";
import { fail, intParam, intQuery, invalid } from "../http";
import { fileRead } from "../schemas";
import * as storage from "../storage";
import type { Bindings } from "../config";
import { must } from "./lookup";

export const fileRoutes = new Hono<Env>();

const owned = (tenant: Tenant, id: number) => must(tenant, s.file, id, "File not found");
const idOf = (raw: string) => intParam(raw, "file_id");

/**
 * Read one upload out of a multipart body and store it.
 *
 * The single place uploads are handled — it was copied into three routers
 * once, so a fix to the magic-byte check or the size limit silently missed
 * the other two.
 */
export async function storeUpload(
  env: Bindings,
  tenant: Tenant,
  form: FormData,
  attach: { connectionPointId?: number | null; equipmentId?: number | null },
) {
  const upload = form.get("file");

  if (!(upload instanceof File)) {
    throw invalid([{ type: "missing", loc: ["body", "file"], msg: "Field required" }]);
  }

  let stored;
  try {
    stored = await storage.accept(
      env,
      await upload.arrayBuffer(),
      upload.name || "file",
      upload.type || "",
      tenant.organizationId,
    );
  } catch (error) {
    if (error instanceof storage.RejectedUpload) {
      throw fail(error.tooBig ? 413 : 400, error.message);
    }
    throw error;
  }

  // The row last. A failure here leaves an object with no row, which is
  // invisible and cheap; the reverse leaves a row with no object, which is
  // a broken thumbnail in the panel view forever.
  return tenant.insert(s.file, {
    connectionPointId: attach.connectionPointId ?? null,
    equipmentId: attach.equipmentId ?? null,
    filename: stored.filename,
    mimetype: stored.mimetype,
    storageKey: stored.key,
  });
}

/**
 * The multipart body, refused early if it cannot possibly be small enough.
 *
 * Read once and passed around. Parsing it twice — once for the id fields
 * and once for the file — would hold two copies of a 20 MB upload in an
 * isolate that has a hard memory ceiling.
 */
export async function readForm(request: Request): Promise<FormData> {
  const declared = Number(request.headers.get("content-length") ?? 0);

  // Slack for the multipart envelope — boundaries and headers around the
  // file itself. Generous, because this check only exists to stop the
  // absurd cases before they are read into memory; `storage.accept` does
  // the exact one afterwards.
  if (declared > storage.MAX_FILE_SIZE + 1024 * 1024) {
    throw fail(
      413,
      `Filen er for stor. Maks ${storage.MAX_FILE_SIZE / (1024 * 1024)} MB`,
    );
  }

  try {
    return await request.formData();
  } catch {
    throw invalid([
      { type: "missing", loc: ["body", "file"], msg: "Field required" },
    ]);
  }
}

/**
 * Check what an upload says it hangs off.
 *
 * Attaching to something means it has to exist and be ours. Without this a
 * file could be hung off another tenant's connection point, or off an id
 * that was never there.
 */
export async function resolveParent(
  tenant: Tenant,
  connectionPointId: number | null,
  equipmentId: number | null,
) {
  if (connectionPointId !== null && equipmentId !== null) {
    throw fail(400, "Specify either connection_point_id or equipment_id, not both");
  }
  if (connectionPointId !== null) {
    await must(tenant, s.connectionPoint, connectionPointId, "Connection point not found");
  }
  if (equipmentId !== null) {
    await must(tenant, s.equipment, equipmentId, "Equipment not found");
  }
  return { connectionPointId, equipmentId };
}

fileRoutes.get("/", async (c) => {
  const filters: SQL[] = [];
  const cpId = intQuery(c.req.url, "connection_point_id");
  const equipmentId = intQuery(c.req.url, "equipment_id");

  if (cpId !== undefined) filters.push(eq(s.file.connectionPointId, cpId));
  if (equipmentId !== undefined) filters.push(eq(s.file.equipmentId, equipmentId));

  const rows = await c
    .get("tenant")
    .list(s.file, filters.length === 0 ? undefined : (and(...filters) as SQL));
  return c.json(rows.map(fileRead));
});

/** POST /api/files — the ids arrive as form fields. */
fileRoutes.post("/", async (c) => {
  const tenant = c.get("tenant");
  const form = await readForm(c.req.raw);

  const attach = await resolveParent(
    tenant,
    formInt(form, "connection_point_id"),
    formInt(form, "equipment_id"),
  );
  return c.json(fileRead(await storeUpload(c.env, tenant, form, attach)));
});

/** POST /api/files/upload — the same, with the ids as query parameters. */
fileRoutes.post("/upload", async (c) => {
  const tenant = c.get("tenant");
  const attach = await resolveParent(
    tenant,
    intQuery(c.req.url, "connection_point_id") ?? null,
    intQuery(c.req.url, "equipment_id") ?? null,
  );
  return c.json(fileRead(await storeUpload(c.env, tenant, await readForm(c.req.raw), attach)));
});

fileRoutes.get("/:file_id", async (c) =>
  c.json(fileRead(await owned(c.get("tenant"), idOf(c.req.param("file_id"))))),
);

fileRoutes.get("/:file_id/content", async (c) => {
  const row = await owned(c.get("tenant"), idOf(c.req.param("file_id")));

  const object = await storage.read(c.env, row.storageKey);
  if (!object) throw fail(404, "File not found in storage");

  return new Response(object.body, {
    headers: {
      "content-type": row.mimetype,
      // attachment, not inline: the browser saves it instead of rendering
      // it in the page's own origin.
      "content-disposition": `attachment; filename="${row.filename}"`,
      "x-content-type-options": "nosniff",
    },
  });
});

fileRoutes.delete("/:file_id", async (c) => {
  const tenant = c.get("tenant");
  const id = idOf(c.req.param("file_id"));
  const row = await owned(tenant, id);

  await tenant.remove(s.file, id);

  try {
    await storage.discard(c.env, row.storageKey);
  } catch (error) {
    // The row is gone, so the object is unreachable either way — but on R2
    // unreachable is not free the way a stray file on disk was. Worth a
    // line in the log, and worth a lifecycle rule on the bucket rather
    // than a failed request here.
    console.warn(`Klarte ikke slette ${row.storageKey} fra lagring:`, error);
  }

  return c.json(fileRead(row));
});

function formInt(form: FormData, name: string): number | null {
  const raw = form.get(name);
  if (raw === null || typeof raw !== "string" || raw === "") return null;
  if (!/^\d+$/.test(raw)) {
    throw invalid([
      { type: "int_parsing", loc: ["body", name], msg: "Input should be a valid integer" },
    ]);
  }
  return Number(raw);
}
