/**
 * What the contract suite cannot see.
 *
 * The contract runs as one signed-in tenant, so it proves the endpoints
 * work and says nothing about whether they leak. On the Python side that
 * gap was filled by PostgreSQL: panels.py, circuits.py and modules.py
 * never filtered by organization at all, and row-level security caught it.
 * Run the same code on SQLite and three quarters of the API is readable
 * across tenants.
 *
 * D1 has no row-level security. So the question these ask is the one that
 * has no other answer here: with two real accounts, signed in through the
 * real flow, can one reach the other's installation.
 *
 * The second half covers the writes that have to land whole — deleting a
 * panel with modules in it, deleting a circuit that breakers point at.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";

import { setMailer } from "../../src/mail";
import { Client, outbox, signIn } from "./helpers";

let mine: Client;
let theirs: Client;
let sent: Array<[string, string, string]>;

/**
 * A property, a panel, a circuit and a module, made through the API.
 *
 * Every step is checked. An unchecked fixture hid a real failure once
 * already: clearing the seeded module types between tests made this
 * function's last call answer 422, and the tests downstream reported
 * "expected 422 to be 404" from a URL containing the word undefined.
 */
async function made(client: Client, path: string, body: unknown) {
  const res = await client.post(path, body);
  if (res.status !== 200) {
    throw new Error(`POST ${path} ga ${res.status}: ${await res.text()}`);
  }
  return res.json<{ id: number }>();
}

async function installation(client: Client) {
  const property = await made(client, "/api/properties", {
    name: "Bolig", address: "Veien 1",
  });
  const panel = await made(client, `/api/properties/${property.id}/panels`, {
    name: "Hovedtavle", location: "Gang", rows: 2, modules_per_row: 24,
  });
  const circuit = await made(client, `/api/panels/${panel.id}/circuits`, {
    designation: "B01", name: "Lys stue",
  });
  const module = await made(client, `/api/panels/${panel.id}/modules`, {
    row: 0, position: 0, width: 2, type: "breaker", circuit_id: circuit.id,
  });

  return { property, panel, circuit, module };
}

beforeEach(async () => {
  sent = outbox();
  mine = new Client();
  theirs = new Client();
  await signIn(mine, sent, "ola@example.com");
  await signIn(theirs, sent, "kari@example.com");
  return () => setMailer(null);
});

// --- Two accounts ---------------------------------------------------------

describe("another tenant's installation", () => {
  test("does not appear in any listing", async () => {
    await installation(mine);

    for (const path of ["/api/properties", "/api/panels", "/api/circuits"]) {
      const rows = await (await theirs.get(path)).json<unknown[]>();
      expect(rows, path).toEqual([]);
    }
  });

  test("cannot be fetched by id", async () => {
    const { property, panel, circuit } = await installation(mine);

    expect((await theirs.get(`/api/properties/${property.id}`)).status).toBe(404);
    expect((await theirs.get(`/api/panels/${panel.id}`)).status).toBe(404);
    expect((await theirs.get(`/api/circuits/${circuit.id}`)).status).toBe(404);
  });

  test("cannot be reached through a nested listing", async () => {
    // The route that would have leaked most quietly: the id is in the URL
    // and the handler's own filter is on the parent, not on the tenant.
    const { property, panel } = await installation(mine);

    expect((await theirs.get(`/api/properties/${property.id}/panels`)).status).toBe(404);
    expect((await theirs.get(`/api/panels/${panel.id}/circuits`)).status).toBe(404);
    expect((await theirs.get(`/api/panels/${panel.id}/modules`)).status).toBe(404);
  });

  test("cannot be reached through a query filter", async () => {
    // ?property_id= and ?panel_id= name someone else's row. The filter is
    // and'ed with the tenant's, so this is empty rather than forbidden.
    const { property, panel } = await installation(mine);

    expect(
      await (await theirs.get(`/api/panels?property_id=${property.id}`)).json(),
    ).toEqual([]);
    expect(
      await (await theirs.get(`/api/circuits?panel_id=${panel.id}`)).json(),
    ).toEqual([]);
  });

  test("cannot be edited or deleted", async () => {
    const { property, panel, circuit, module } = await installation(mine);

    expect(
      (await theirs.fetch(`/api/properties/${property.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: "Kapret" }),
      })).status,
    ).toBe(404);
    expect((await theirs.fetch(`/api/panels/${panel.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await theirs.fetch(`/api/circuits/${circuit.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await theirs.fetch(`/api/modules/${module.id}`, { method: "DELETE" })).status).toBe(404);

    // And none of it was a partial success.
    expect((await mine.get(`/api/properties/${property.id}`)).status).toBe(200);
    expect(
      (await (await mine.get(`/api/properties/${property.id}`)).json<{ name: string }>()).name,
    ).toBe("Bolig");
  });

  test("cannot be written into", async () => {
    const { property, panel } = await installation(mine);

    expect(
      (await theirs.post(`/api/properties/${property.id}/panels`, {
        name: "Snik", location: "Loft",
      })).status,
    ).toBe(404);
    expect(
      (await theirs.post(`/api/panels/${panel.id}/circuits`, {
        designation: "X99", name: "Snik",
      })).status,
    ).toBe(404);
    expect((await theirs.post("/api/panels", {
      property_id: property.id, name: "Snik", location: "Loft",
    })).status).toBe(404);
  });

  test("cannot be referenced from one's own rows", async () => {
    // Nothing in the Python version checked this: a module could carry
    // another tenant's circuit_id, and the foreign key was happy because
    // the circuit exists. The reference is invisible when read back, which
    // is what made it easy to miss.
    const { circuit } = await installation(mine);
    const ours = await installation(theirs);

    const res = await theirs.post(`/api/panels/${ours.panel.id}/modules`, {
      row: 1, position: 0, width: 2, type: "breaker", circuit_id: circuit.id,
    });
    expect(res.status).toBe(404);

    const stored = await env.DB.prepare(
      "select count(*) as n from module where circuit_id = ? and organization_id != " +
        "(select organization_id from circuit where id = ?)",
    )
      .bind(circuit.id, circuit.id)
      .first<{ n: number }>();
    expect(stored!.n).toBe(0);
  });
});

// --- Writes that have to land whole ---------------------------------------

describe("deleting a panel", () => {
  test("takes its modules with it, and only its own", async () => {
    const { panel, circuit, module } = await installation(mine);

    // The circuit would refuse the delete, so clear it first.
    expect((await mine.fetch(`/api/circuits/${circuit.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await mine.fetch(`/api/panels/${panel.id}`, { method: "DELETE" })).status).toBe(200);

    expect((await mine.get(`/api/panels/${panel.id}`)).status).toBe(404);
    const left = await env.DB.prepare("select count(*) as n from module where id = ?")
      .bind(module.id)
      .first<{ n: number }>();
    expect(left!.n).toBe(0);
  });

  test("is refused while it holds circuits, and changes nothing", async () => {
    const { panel } = await installation(mine);

    expect((await mine.fetch(`/api/panels/${panel.id}`, { method: "DELETE" })).status).toBe(409);
    expect((await mine.get(`/api/panels/${panel.id}`)).status).toBe(200);
    expect(
      (await (await mine.get(`/api/panels/${panel.id}/modules`)).json<unknown[]>()).length,
    ).toBe(1);
  });
});

describe("deleting a circuit", () => {
  test("releases the modules that pointed at it", async () => {
    // Otherwise the panel view keeps drawing a breaker wired to nothing.
    const { circuit, module } = await installation(mine);

    expect((await mine.fetch(`/api/circuits/${circuit.id}`, { method: "DELETE" })).status).toBe(200);

    const after = await env.DB.prepare("select circuit_id from module where id = ?")
      .bind(module.id)
      .first<{ circuit_id: number | null }>();
    expect(after!.circuit_id).toBeNull();
  });

  test("is refused while equipment hangs off it", async () => {
    // The guard that was forgotten on the Python side, where this answered
    // 500 from a foreign key rather than 409.
    const { circuit } = await installation(mine);
    await env.DB.prepare(
      "insert into equipment (organization_id, circuit_id, type) " +
        "select organization_id, id, 'dynalite' from circuit where id = ?",
    )
      .bind(circuit.id)
      .run();

    expect((await mine.fetch(`/api/circuits/${circuit.id}`, { method: "DELETE" })).status).toBe(409);
    expect((await mine.get(`/api/circuits/${circuit.id}`)).status).toBe(200);
  });
});

// --- The shapes the frontend depends on -----------------------------------

describe("bodies", () => {
  test("a partial update leaves the rest alone", async () => {
    const property = await (
      await mine.post("/api/properties", {
        name: "Bolig", address: "Veien 1", owner_name: "Ola",
      })
    ).json<{ id: number }>();

    const updated = await (
      await mine.fetch(`/api/properties/${property.id}`, {
        method: "PUT",
        body: JSON.stringify({ name: "Nytt navn" }),
      })
    ).json<{ name: string; address: string; owner_name: string }>();

    expect(updated.name).toBe("Nytt navn");
    expect(updated.address).toBe("Veien 1");
    expect(updated.owner_name, "a field not sent is not cleared").toBe("Ola");
  });

  test("an explicit null does clear a field", async () => {
    const property = await (
      await mine.post("/api/properties", {
        name: "Bolig", address: "Veien 1", owner_name: "Ola",
      })
    ).json<{ id: number }>();

    const updated = await (
      await mine.fetch(`/api/properties/${property.id}`, {
        method: "PUT",
        body: JSON.stringify({ owner_name: null }),
      })
    ).json<{ owner_name: string | null }>();

    expect(updated.owner_name).toBeNull();
  });

  test("numbers may arrive as strings, as pydantic allowed", async () => {
    // The frontend parses its form fields, in about a dozen places. Being
    // stricter than the implementation being replaced is still a change.
    const property = await (
      await mine.post("/api/properties", { name: "B", address: "A" })
    ).json<{ id: number }>();

    const res = await mine.post(`/api/properties/${property.id}/panels`, {
      name: "Tavle", location: "Gang", rows: "2", modules_per_row: "24",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ rows: 2, modules_per_row: 24 });
  });

  test("a bad value is a 422 with a list under detail", async () => {
    // FastAPI's shape, which the frontend reads.
    const res = await mine.post("/api/properties", { name: "Uten adresse" });
    expect(res.status).toBe(422);

    const body = await res.json<{ detail: unknown }>();
    expect(Array.isArray(body.detail)).toBe(true);
  });

  test("an unknown enum value is refused", async () => {
    const { panel } = await installation(mine);
    const res = await mine.post(`/api/panels/${panel.id}/circuits`, {
      designation: "B02", name: "Kurs", cable_type: "IKKE-EN-TYPE",
    });
    expect(res.status).toBe(422);
  });

  test("a malformed id is 422, not 404", async () => {
    // Malformed is a different thing from naming something that is not
    // there, and FastAPI told them apart.
    expect((await mine.get("/api/properties/abc")).status).toBe(422);
  });

  test("timestamps come back as ISO strings", async () => {
    const property = await (
      await mine.post("/api/properties", { name: "B", address: "A" })
    ).json<{ created_at: string }>();

    expect(property.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    expect(Number.isNaN(Date.parse(property.created_at))).toBe(false);
  });
});
