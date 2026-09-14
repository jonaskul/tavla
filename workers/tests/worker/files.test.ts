/**
 * Files and the round trip, with two accounts.
 *
 * The contract proves an upload comes back byte for byte. It cannot show
 * that the bytes are unreachable from another account, and on R2 there is
 * nothing but this code between them: the bucket is one bucket, and the
 * key prefix is a convention, not a boundary.
 *
 * The import tests are here for a different reason. It is the one endpoint
 * that is not atomic — D1 refuses interactive transactions, so it runs in
 * five batched rounds — and what stands in for a rollback is a cleanup
 * that has to remember every table. Forgetting one is the mistake this
 * codebase has made four times.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";

import * as s from "../../src/schema";
import { forOrganization } from "../../src/db";
import { setMailer } from "../../src/mail";
import { rollback } from "../../src/routes/export";
import { Client, outbox, signIn } from "./helpers";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, ...new TextEncoder().encode("innhold")]);
const PDF = new Uint8Array([...new TextEncoder().encode("%PDF-1.7\nsider")]);

let mine: Client;
let theirs: Client;
let sent: Array<[string, string, string]>;

async function made(client: Client, path: string, body: unknown) {
  const res = await client.post(path, body);
  if (res.status !== 200) {
    throw new Error(`POST ${path} ga ${res.status}: ${await res.text()}`);
  }
  return res.json<{ id: number }>();
}

/** Upload a file against a connection point, through the real route. */
async function upload(
  client: Client,
  cpId: number,
  bytes: Uint8Array = JPEG,
  filename = "skap.jpg",
  type = "image/jpeg",
) {
  const form = new FormData();
  form.append("file", new File([bytes as BufferSource], filename, { type }));
  return client.fetch(`/api/connection_points/${cpId}/files`, {
    method: "POST",
    body: form,
  });
}

/** A circuit with a connection point under it. */
async function tree(client: Client) {
  const property = await made(client, "/api/properties", { name: "B", address: "A" });
  const panel = await made(client, `/api/properties/${property.id}/panels`, {
    name: "Tavle", location: "Gang", rows: 2, modules_per_row: 24,
  });
  const circuit = await made(client, `/api/panels/${panel.id}/circuits`, {
    designation: "B01", name: "Lys",
  });
  const cp = await made(client, `/api/circuits/${circuit.id}/connection_points`, {
    type: "light", location: "Tak",
  });
  return { property, panel, circuit, cp };
}

beforeEach(async () => {
  sent = outbox();
  mine = new Client();
  theirs = new Client();
  await signIn(mine, sent, "ola@example.com");
  await signIn(theirs, sent, "kari@example.com");
  return () => setMailer(null);
});

// --- The bucket is one bucket ---------------------------------------------

describe("an uploaded file", () => {
  test("round-trips through R2 byte for byte", async () => {
    const { cp } = await tree(mine);
    const record = await (await upload(mine, cp.id)).json<{ id: number }>();

    const content = await mine.get(`/api/files/${record.id}/content`);
    expect(content.status).toBe(200);
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(JPEG);
  });

  test("is stored under a key that names its organization", async () => {
    // Not a boundary — the code is the boundary — but it makes a
    // misdirected read obvious in a bucket listing rather than subtle.
    const { cp } = await tree(mine);
    const record = await (await upload(mine, cp.id)).json<{ id: number }>();

    const row = await env.DB.prepare(
      "select storage_key, organization_id from file where id = ?",
    ).bind(record.id).first<{ storage_key: string; organization_id: number }>();

    expect(row!.storage_key.startsWith(`org-${row!.organization_id}/`)).toBe(true);
  });

  test("cannot be read by another account", async () => {
    const { cp } = await tree(mine);
    const record = await (await upload(mine, cp.id)).json<{ id: number }>();

    expect((await theirs.get(`/api/files/${record.id}`)).status).toBe(404);
    expect((await theirs.get(`/api/files/${record.id}/content`)).status).toBe(404);
    expect(await (await theirs.get("/api/files")).json()).toEqual([]);
  });

  test("cannot be deleted by another account", async () => {
    const { cp } = await tree(mine);
    const record = await (await upload(mine, cp.id)).json<{ id: number }>();

    expect((await theirs.fetch(`/api/files/${record.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await mine.get(`/api/files/${record.id}/content`)).status).toBe(200);
  });

  test("cannot be hung off another account's connection point", async () => {
    const { cp } = await tree(mine);
    await tree(theirs);

    expect((await upload(theirs, cp.id)).status).toBe(404);
  });

  test("takes its bytes with it when deleted", async () => {
    // The row goes first and the object second, so this is the step that
    // can silently not happen and quietly cost money forever.
    const { cp } = await tree(mine);
    const record = await (await upload(mine, cp.id)).json<{ id: number }>();

    const row = await env.DB.prepare("select storage_key from file where id = ?")
      .bind(record.id).first<{ storage_key: string }>();
    expect(await env.FILES.get(row!.storage_key)).not.toBeNull();

    expect((await mine.fetch(`/api/files/${record.id}`, { method: "DELETE" })).status).toBe(200);
    expect(await env.FILES.get(row!.storage_key)).toBeNull();
  });

  test("is typed by its bytes, not by what the client claims", async () => {
    const { cp } = await tree(mine);
    const res = await upload(mine, cp.id, PDF, "lureri.jpg", "image/jpeg");

    expect(res.status).toBe(200);
    expect((await res.json<{ mimetype: string }>()).mimetype).toBe("application/pdf");
  });

  test("of an unsupported kind is refused, and nothing is stored", async () => {
    const { cp } = await tree(mine);
    const before = (await env.FILES.list()).objects.length;

    const res = await upload(
      mine, cp.id, new TextEncoder().encode("<html>hei</html>"), "side.html", "text/html",
    );
    expect(res.status).toBe(400);

    // The checks run before a single byte reaches R2, so a rejected upload
    // leaves nothing behind to pay for.
    expect((await env.FILES.list()).objects.length).toBe(before);
  });

  test("that is too big is refused before the body is read", async () => {
    // Content-Length first, so a 40 MB upload is not pulled into an
    // isolate with a hard memory ceiling just to be measured.
    const { cp } = await tree(mine);
    const res = await mine.fetch(`/api/connection_points/${cp.id}/files`, {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x", "content-length": "41943040" },
      body: "x",
    });
    expect(res.status).toBe(413);
  });

  test("keeps a Norwegian filename intact", async () => {
    // Python's \w matches letters in any script; JavaScript's is ASCII and
    // would have made this "kj_kkenskap.jpg".
    const { cp } = await tree(mine);
    const res = await upload(mine, cp.id, JPEG, "kjøkkenskap.jpg");

    expect((await res.json<{ filename: string }>()).filename).toBe("kjøkkenskap.jpg");
  });
});

// --- Export and import ----------------------------------------------------

describe("export", () => {
  test("refuses another account's property", async () => {
    const { property } = await tree(mine);
    expect((await theirs.get(`/api/export/${property.id}`)).status).toBe(404);
  });

  test("imports into the account that asked, not the one it came from", async () => {
    const { property } = await tree(mine);
    const file = await (await mine.get(`/api/export/${property.id}`)).json();

    const created = await made(theirs, "/api/export", file);

    // Kari now has her own copy; Ola's is untouched and still his.
    expect((await theirs.get(`/api/properties/${created.id}`)).status).toBe(200);
    expect((await mine.get(`/api/properties/${created.id}`)).status).toBe(404);

    const rows = await env.DB.prepare(
      "select organization_id as org from property where id in (?, ?)",
    ).bind(property.id, created.id).all<{ org: number }>();
    expect(new Set(rows.results.map((r) => r.org)).size).toBe(2);
  });

  test("carries the panel layout, which format 1 lost", async () => {
    const { property, panel, circuit } = await tree(mine);
    await made(mine, `/api/panels/${panel.id}/modules`, {
      row: 0, position: 0, width: 2, type: "breaker", circuit_id: circuit.id,
    });

    const file = await (await mine.get(`/api/export/${property.id}`)).json<{
      panels: Array<{ modules: unknown[] }>;
    }>();
    expect(file.panels[0].modules).toHaveLength(1);
  });

  test("refuses a nested value of the wrong type before writing anything", async () => {
    // The first version of the import validator checked only whether a
    // field was present. A module with a word where its row should be got
    // through and became a database error halfway through a phased import.
    const before = await env.DB.prepare("select count(*) as n from property")
      .first<{ n: number }>();

    const res = await mine.post("/api/export", {
      format_version: 2,
      name: "Skjev",
      address: "A",
      panels: [{
        name: "Tavle", location: "Gang", rows: 1, modules_per_row: 12,
        modules: [{ row: "øverst", position: 0, width: 1, type: "breaker" }],
        circuits: [],
      }],
    });

    expect(res.status).toBe(422);
    const after = await env.DB.prepare("select count(*) as n from property")
      .first<{ n: number }>();
    expect(after!.n, "nothing may be written on the way to a 422").toBe(before!.n);
  });

  test("refuses a file from a newer version of Tavla", async () => {
    const res = await mine.post("/api/export", {
      format_version: 99, name: "Fra framtiden", address: "X", panels: [],
    });
    expect(res.status).toBe(422);
  });
});

describe("the import's cleanup", () => {
  test("removes every table a partial import could have written", async () => {
    // What stands in for a rollback. D1 refuses interactive transactions,
    // so the import runs in five batched rounds and this is what runs if a
    // later one fails.
    //
    // Worth being exact about what this proves. It drives the cleanup
    // directly, because after the validation above there is no longer a
    // file that can fail mid-import — which is the point of the
    // validation, and also why the trigger cannot be tested from outside.
    // The trigger is three lines of try/catch in the route; what is worth
    // testing is whether the cleanup remembers every table, since
    // forgetting one is the mistake this codebase keeps making.
    const { property, panel, circuit, cp } = await tree(mine);
    const equipment = await made(mine, `/api/circuits/${circuit.id}/equipment`, {
      type: "dynalite", channel_count: 3,
    });
    await made(mine, `/api/panels/${panel.id}/modules`, {
      row: 0, position: 0, width: 2, type: "breaker", circuit_id: circuit.id,
    });

    const org = await env.DB.prepare("select organization_id as org from property where id = ?")
      .bind(property.id).first<{ org: number }>();

    await rollback(forOrganization(env, org!.org), property.id);

    for (const [table, column, id] of [
      ["property", "id", property.id],
      ["panel", "property_id", property.id],
      ["circuit", "panel_id", panel.id],
      ["module", "panel_id", panel.id],
      ["connectionpoint", "id", cp.id],
      ["equipment", "id", equipment.id],
      ["channel", "equipment_id", equipment.id],
      ["changelog", "circuit_id", circuit.id],
    ] as const) {
      const left = await env.DB.prepare(
        `select count(*) as n from "${table}" where ${column} = ?`,
      ).bind(id).first<{ n: number }>();
      expect(left!.n, `${table} ble ikke ryddet`).toBe(0);
    }
  });

  test("does not reach outside the property it was given", async () => {
    const keep = await tree(mine);
    const drop = await tree(mine);

    const org = await env.DB.prepare("select organization_id as org from property where id = ?")
      .bind(drop.property.id).first<{ org: number }>();

    await rollback(forOrganization(env, org!.org), drop.property.id);

    expect((await mine.get(`/api/properties/${keep.property.id}`)).status).toBe(200);
    expect((await mine.get(`/api/panels/${keep.panel.id}`)).status).toBe(200);
    expect((await mine.get(`/api/connection_points/${keep.cp.id}`)).status).toBe(200);
    expect((await mine.get(`/api/properties/${drop.property.id}`)).status).toBe(404);
  });
});
