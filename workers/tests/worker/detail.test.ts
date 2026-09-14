/**
 * Connection points, equipment, channels, the log, and module types —
 * with two accounts.
 *
 * The contract suite runs as one tenant, so it can show that copy-on-write
 * produces a copy. It cannot show the thing copy-on-write exists for:
 * that one customer editing the colour of a shared built-in does not
 * change it for every other customer. That question needs a second
 * account, and it has no other enforcement behind it on D1.
 *
 * The rest are the writes that have to land whole. Deleting equipment
 * means its channels, its log entries, the row itself, and a new entry
 * recording the deletion — four statements where the Python version
 * managed to forget one and answer 500.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";

import { setMailer } from "../../src/mail";
import { Client, outbox, signIn } from "./helpers";

let mine: Client;
let theirs: Client;
let sent: Array<[string, string, string]>;

async function made(client: Client, path: string, body: unknown) {
  const res = await client.post(path, body);
  if (res.status !== 200) {
    throw new Error(`POST ${path} ga ${res.status}: ${await res.text()}`);
  }
  return res.json<{ id: number; key?: string }>();
}

/** A circuit with a connection point, a four-channel dimmer rack on it. */
async function wired(client: Client) {
  const property = await made(client, "/api/properties", {
    name: "Bolig", address: "Veien 1",
  });
  const panel = await made(client, `/api/properties/${property.id}/panels`, {
    name: "Hovedtavle", location: "Gang", rows: 2, modules_per_row: 24,
  });
  const circuit = await made(client, `/api/panels/${panel.id}/circuits`, {
    designation: "B01", name: "Lys stue",
  });
  const cp = await made(client, `/api/circuits/${circuit.id}/connection_points`, {
    type: "light", location: "Tak stue",
  });
  const equipment = await made(client, `/api/circuits/${circuit.id}/equipment`, {
    type: "dynalite", brand: "Philips", channel_count: 4,
  });

  return { property, panel, circuit, cp, equipment };
}

beforeEach(async () => {
  sent = outbox();
  mine = new Client();
  theirs = new Client();
  await signIn(mine, sent, "ola@example.com");
  await signIn(theirs, sent, "kari@example.com");
  return () => setMailer(null);
});

// --- Module types, which are the shared ones ------------------------------

describe("module types", () => {
  test("everyone starts with the same eight built-ins", async () => {
    const forMe = await (await mine.get("/api/module_types")).json<Array<{ key: string }>>();
    const forThem = await (await theirs.get("/api/module_types")).json<Array<{ key: string }>>();

    expect(forMe.map((t) => t.key).sort()).toEqual(forThem.map((t) => t.key).sort());
    expect(forMe).toHaveLength(8);
  });

  test("editing a built-in does not change it for anyone else", async () => {
    // The reason copy-on-write exists. Without it this test recolours
    // every customer's automatsikring, and nothing anywhere would say so.
    const before = (
      await (await theirs.get("/api/module_types")).json<Array<{ key: string; color: string }>>()
    ).find((t) => t.key === "breaker")!;

    const target = (
      await (await mine.get("/api/module_types")).json<Array<{ key: string; id: number }>>()
    ).find((t) => t.key === "breaker")!;

    const edited = await mine.fetch(`/api/module_types/${target.id}`, {
      method: "PUT",
      body: JSON.stringify({ color: "#ff0000" }),
    });
    expect(edited.status).toBe(200);

    const after = (
      await (await theirs.get("/api/module_types")).json<Array<{ key: string; color: string }>>()
    ).find((t) => t.key === "breaker")!;

    expect(after.color).toBe(before.color);
    expect(after.color).not.toBe("#ff0000");
  });

  test("the copy shadows the shared one rather than joining it", async () => {
    const target = (
      await (await mine.get("/api/module_types")).json<Array<{ key: string; id: number }>>()
    ).find((t) => t.key === "breaker")!;

    await mine.fetch(`/api/module_types/${target.id}`, {
      method: "PUT",
      body: JSON.stringify({ color: "#ff0000" }),
    });

    const listing = await (await mine.get("/api/module_types")).json<
      Array<{ key: string; color: string }>
    >();
    const breakers = listing.filter((t) => t.key === "breaker");

    expect(breakers, "one entry, not two").toHaveLength(1);
    expect(breakers[0].color).toBe("#ff0000");
    expect(listing).toHaveLength(8);
  });

  test("removing the copy reverts to the default", async () => {
    const original = (
      await (await mine.get("/api/module_types")).json<
        Array<{ key: string; id: number; color: string }>
      >()
    ).find((t) => t.key === "breaker")!;

    const copy = await (
      await mine.fetch(`/api/module_types/${original.id}`, {
        method: "PUT",
        body: JSON.stringify({ color: "#ff0000" }),
      })
    ).json<{ id: number }>();

    expect((await mine.fetch(`/api/module_types/${copy.id}`, { method: "DELETE" })).status).toBe(200);

    const restored = (
      await (await mine.get("/api/module_types")).json<Array<{ key: string; color: string }>>()
    ).find((t) => t.key === "breaker")!;
    expect(restored.color).toBe(original.color);
  });

  test("a custom type belongs to the account that made it", async () => {
    await made(mine, "/api/module_types", {
      key: "min_type", name_no: "Min type", color: "#123456", abbreviation: "MT",
    });

    const forThem = await (await theirs.get("/api/module_types")).json<Array<{ key: string }>>();
    expect(forThem.map((t) => t.key)).not.toContain("min_type");
    expect(forThem).toHaveLength(8);
  });

  test("another account's custom type cannot be read or edited", async () => {
    const kind = await made(mine, "/api/module_types", {
      key: "min_type", name_no: "Min type", color: "#123456", abbreviation: "MT",
    });

    expect((await theirs.get(`/api/module_types/${kind.id}`)).status).toBe(404);
    expect(
      (await theirs.fetch(`/api/module_types/${kind.id}`, {
        method: "PUT",
        body: JSON.stringify({ color: "#000000" }),
      })).status,
    ).toBe(404);
    expect(
      (await theirs.fetch(`/api/module_types/${kind.id}`, { method: "DELETE" })).status,
    ).toBe(404);
  });

  test("a built-in is nobody's to delete", async () => {
    const target = (
      await (await mine.get("/api/module_types")).json<Array<{ key: string; id: number }>>()
    ).find((t) => t.key === "surge_protection")!;

    expect((await mine.fetch(`/api/module_types/${target.id}`, { method: "DELETE" })).status).toBe(409);
  });

  test("usage counts only one's own modules", async () => {
    const a = await wired(mine);
    await made(mine, `/api/panels/${a.panel.id}/modules`, {
      row: 0, position: 0, width: 1, type: "rcd",
    });

    expect(await (await mine.get("/api/module_types/rcd/usage")).json()).toEqual({
      key: "rcd", count: 1,
    });
    expect(await (await theirs.get("/api/module_types/rcd/usage")).json()).toEqual({
      key: "rcd", count: 0,
    });
  });
});

// --- Two accounts, the rest of the tree -----------------------------------

describe("another account's details", () => {
  test("are invisible in every listing", async () => {
    await wired(mine);

    for (const path of [
      "/api/connection_points",
      "/api/equipment",
      "/api/changelog",
    ]) {
      expect(await (await theirs.get(path)).json(), path).toEqual([]);
    }
  });

  test("cannot be fetched, edited or deleted", async () => {
    const { cp, equipment } = await wired(mine);
    const channel = (
      await (await mine.get(`/api/equipment/${equipment.id}/channels`)).json<
        Array<{ id: number }>
      >()
    )[0];

    expect((await theirs.get(`/api/connection_points/${cp.id}`)).status).toBe(404);
    expect((await theirs.get(`/api/equipment/${equipment.id}`)).status).toBe(404);
    expect(
      (await theirs.fetch(`/api/channels/${channel.id}`, { method: "DELETE" })).status,
    ).toBe(404);
    expect(
      (await theirs.fetch(`/api/connection_points/${cp.id}`, { method: "DELETE" })).status,
    ).toBe(404);
  });

  test("cannot be named by a log entry", async () => {
    // Nothing checked this on the Python side: an entry could carry another
    // tenant's circuit_id, and then sit in our account describing their
    // installation.
    const { circuit } = await wired(mine);

    const res = await theirs.post("/api/changelog", {
      circuit_id: circuit.id, description: "Snik",
    });
    expect(res.status).toBe(404);
  });

  test("cannot be served by one's own channel", async () => {
    const { circuit } = await wired(mine);
    const ours = await wired(theirs);

    const res = await theirs.post(`/api/equipment/${ours.equipment.id}/channels`, {
      number: 9, circuit_id: circuit.id,
    });
    expect(res.status).toBe(404);
  });
});

// --- Writes that have to land whole ---------------------------------------

describe("deleting equipment", () => {
  test("takes its channels and its log entries with it", async () => {
    const { equipment } = await wired(mine);

    expect(
      (await (await mine.get(`/api/equipment/${equipment.id}/channels`)).json<unknown[]>()).length,
    ).toBe(4);

    expect(
      (await mine.fetch(`/api/equipment/${equipment.id}`, { method: "DELETE" })).status,
    ).toBe(200);

    const channels = await env.DB.prepare(
      "select count(*) as n from channel where equipment_id = ?",
    ).bind(equipment.id).first<{ n: number }>();
    expect(channels!.n).toBe(0);

    const orphans = await env.DB.prepare(
      "select count(*) as n from changelog where equipment_id = ?",
    ).bind(equipment.id).first<{ n: number }>();
    expect(orphans!.n).toBe(0);
  });

  test("records the deletion against the circuit", async () => {
    const { circuit, equipment } = await wired(mine);
    await mine.fetch(`/api/equipment/${equipment.id}`, { method: "DELETE" });

    const entries = await (await mine.get(`/api/circuits/${circuit.id}/changelog`)).json<
      Array<{ description: string }>
    >();
    expect(entries.some((e) => e.description.startsWith("Utstyr slettet"))).toBe(true);
  });

  test("is refused while files hang off it, and changes nothing", async () => {
    const { equipment } = await wired(mine);
    await env.DB.prepare(
      "insert into file (organization_id, equipment_id, filename, mimetype, storage_key) " +
        "select organization_id, id, 'a.jpg', 'image/jpeg', 'k' from equipment where id = ?",
    ).bind(equipment.id).run();

    expect(
      (await mine.fetch(`/api/equipment/${equipment.id}`, { method: "DELETE" })).status,
    ).toBe(409);
    expect((await mine.get(`/api/equipment/${equipment.id}`)).status).toBe(200);
    expect(
      (await (await mine.get(`/api/equipment/${equipment.id}/channels`)).json<unknown[]>()).length,
    ).toBe(4);
  });
});

describe("the log", () => {
  test("records a connection point being created, changed and removed", async () => {
    // The log is what an electrician hands over. It has to record work
    // done, not only what somebody typed into it.
    const { circuit, cp } = await wired(mine);

    await mine.fetch(`/api/connection_points/${cp.id}`, {
      method: "PUT",
      body: JSON.stringify({ location: "Tak gang" }),
    });
    await mine.fetch(`/api/connection_points/${cp.id}`, { method: "DELETE" });

    const entries = await (await mine.get(`/api/circuits/${circuit.id}/changelog`)).json<
      Array<{ description: string }>
    >();
    const kinds = entries.map((e) => e.description.split(":")[0]);

    expect(kinds).toContain("Koblingspunkt opprettet");
    expect(kinds).toContain("Koblingspunkt oppdatert");
    expect(kinds).toContain("Koblingspunkt slettet");
  });

  test("comes back newest first", async () => {
    const { circuit } = await wired(mine);
    await made(mine, "/api/changelog", { circuit_id: circuit.id, description: "Først" });
    await made(mine, "/api/changelog", { circuit_id: circuit.id, description: "Sist" });

    const entries = await (await mine.get(`/api/circuits/${circuit.id}/changelog`)).json<
      Array<{ id: number }>
    >();
    const ids = entries.map((e) => e.id);
    expect([...ids].sort((a, b) => b - a)).toEqual(ids);
  });

  test("refuses an entry attached to nothing", async () => {
    // It would be written, stored, and never appear in any listing again.
    const res = await mine.post("/api/changelog", { description: "Løs i lufta" });
    expect(res.status).toBe(422);
  });
});
