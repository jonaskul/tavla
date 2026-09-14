/**
 * Kontrakten: hvert eneste endepunkt, over HTTP.
 *
 * Dette var en pytest-suite som snakket med en kjørende Tavla og ikke
 * visste noe om hvilken implementasjon som svarte. Den ble skrevet mot
 * FastAPI-versjonen mens den beviselig virket, og var definisjonen på når
 * omskrivingen var ferdig — ikke når koden så riktig ut.
 *
 * Den har gjort jobben sin: Python-versjonen er borte, og det finnes ikke
 * lenger to implementasjoner å sammenligne. Det som er igjen av verdien er
 * fortsatt verdt å ha, og er portert hit: bevis på at alle 69 endepunkter
 * svarer som avtalt, og en test som feiler hvis ett av dem ikke faktisk
 * ble truffet.
 *
 * Det siste er poenget. Uten det er «suiten dekker API-et» en påstand.
 *
 * Ett tap er verdt å nevne: den gamle kunne pekes mot en utrullet
 * instans. Denne kjører i workerd. `npm run smoke -- <url>` dekker
 * produksjonssjekken i stedet.
 */

import { beforeAll, beforeEach, describe, expect, test } from "vitest";

import inventory from "./endpoints.json";
import { setMailer } from "../../src/mail";
import { Client, outbox, signIn } from "./helpers";

// --- Hvilke endepunkter som ble truffet -----------------------------------

interface Endpoint {
  method: string;
  path: string;
}

const ENDPOINTS: Endpoint[] = inventory.endpoints;

/** Hver mal med et uttrykk som matcher de konkrete stiene dens. */
const TEMPLATES = ENDPOINTS.map((e) => ({
  ...e,
  pattern: new RegExp(
    "^" + e.path.replace(/\{[^}]+\}/g, "[^/]+").replace(/\//g, "\\/") + "$",
  ),
  // Lengst først, så /api/properties/{id}/panels vinner over
  // /api/properties/{id} for en sti som matcher begge.
})).sort((a, b) => b.path.length - a.path.length);

const TOUCHED = new Set<string>();

function record(method: string, url: string): void {
  const path = url.split("?")[0];
  for (const template of TEMPLATES) {
    if (template.method === method.toUpperCase() && template.pattern.test(path)) {
      TOUCHED.add(`${template.method} ${template.path}`);
      return;
    }
  }
  TOUCHED.add(`UKJENT ${method.toUpperCase()} ${path}`);
}

// --- Oppsett ---------------------------------------------------------------

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, ...new TextEncoder().encode("kontraktbilde")]);
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new TextEncoder().encode("piksler"),
]);
const PDF = new TextEncoder().encode("%PDF-1.7\nsider");

let api: Client;

beforeEach(async () => {
  const sent = outbox();
  api = new Client(record);
  await signIn(api, sent, "kontrakt@example.com");
  return () => setMailer(null);
});

/** Et svar som må ha gått bra, ellers sier feilmeldingen hvorfor. */
async function ok(res: Response, what: string) {
  if (res.status !== 200) {
    throw new Error(`${what} ga ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<Record<string, never>>;
}

// --- Byggere ---------------------------------------------------------------
//
// Hver returnerer en opprettet ressurs, og går gjennom API-et framfor
// databasen — for det er API-et som er kontrakten.

const makeProperty = (over = {}) =>
  api.post("/api/properties", {
    name: "Kontraktbolig", address: "Kontraktveien 1", ...over,
  }).then((r) => ok(r, "opprett anlegg"));

async function makePanel(propertyId?: number, over = {}) {
  const id = propertyId ?? (await makeProperty()).id;
  return api.post(`/api/properties/${id}/panels`, {
    name: "Hovedtavle", location: "Gang", rows: 2, modules_per_row: 24, ...over,
  }).then((r) => ok(r, "opprett skap"));
}

async function makeCircuit(panelId?: number, over = {}) {
  const id = panelId ?? (await makePanel()).id;
  return api.post(`/api/panels/${id}/circuits`, {
    designation: "B01", name: "Lys stue", ...over,
  }).then((r) => ok(r, "opprett kurs"));
}

async function makeModule(panelId?: number, over = {}) {
  const id = panelId ?? (await makePanel()).id;
  return api.post(`/api/panels/${id}/modules`, {
    row: 0, position: 0, width: 2, type: "breaker", label: "B01", ampere: 16, ...over,
  }).then((r) => ok(r, "plasser modul"));
}

async function makeConnectionPoint(circuitId?: number, over = {}) {
  const id = circuitId ?? (await makeCircuit()).id;
  return api.post(`/api/circuits/${id}/connection_points`, {
    type: "outlet", location: "Stue nord", ...over,
  }).then((r) => ok(r, "opprett koblingspunkt"));
}

async function makeEquipment(circuitId?: number, over = {}) {
  const id = circuitId ?? (await makeCircuit()).id;
  return api.post(`/api/circuits/${id}/equipment`, {
    type: "dynalite", brand: "Philips", watt: 1200, ...over,
  }).then((r) => ok(r, "opprett utstyr"));
}

async function makeChannel(equipmentId?: number, number = 1, over = {}) {
  const id = equipmentId ?? (await makeEquipment()).id;
  return api.post(`/api/equipment/${id}/channels`, { number, ...over })
    .then((r) => ok(r, "opprett kanal"));
}

async function upload(
  attach: { connectionPointId?: number; equipmentId?: number },
  bytes: Uint8Array = JPEG,
  filename = "bilde.jpg",
  type = "image/jpeg",
) {
  const url = attach.connectionPointId !== undefined
    ? `/api/connection_points/${attach.connectionPointId}/files`
    : `/api/equipment/${attach.equipmentId}/files`;

  const form = new FormData();
  form.append("file", new File([bytes as BufferSource], filename, { type }));
  return api.fetch(url, { method: "POST", body: form });
}

// --- Anlegg, skap og moduler ----------------------------------------------

describe("anlegg", () => {
  test("opprettes og leses tilbake", async () => {
    const body = await api.post("/api/properties", {
      name: "Bolig A", address: "Veien 1",
    }).then((r) => ok(r, "opprett"));

    expect(body.name).toBe("Bolig A");
    expect(typeof body.id).toBe("number");
    expect((await api.get(`/api/properties/${body.id}`)).status).toBe(200);
  });

  test("dukker opp i lista", async () => {
    const created = await makeProperty({ name: "Bolig i lista" });
    const listing = await (await api.get("/api/properties")).json<Array<{ id: number }>>();
    expect(listing.map((p) => p.id)).toContain(created.id);
  });

  test("oppdateres uten å miste feltene man ikke sendte", async () => {
    const prop = await makeProperty();
    const res = await api.fetch(`/api/properties/${prop.id}`, {
      method: "PUT", body: JSON.stringify({ name: "Nytt navn" }),
    });
    const body = await ok(res, "oppdater");

    expect(body.name).toBe("Nytt navn");
    expect(body.address).toBe(prop.address);
  });

  test("slettes når det er tomt", async () => {
    const prop = await makeProperty();
    expect((await api.fetch(`/api/properties/${prop.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await api.get(`/api/properties/${prop.id}`)).status).toBe(404);
  });

  test("nekter å slettes når det har skap", async () => {
    // 409, så ingenting går tapt ved et uhell.
    const prop = await makeProperty();
    await makePanel(prop.id);
    expect((await api.fetch(`/api/properties/${prop.id}`, { method: "DELETE" })).status).toBe(409);
  });

  test("som ikke finnes er 404", async () => {
    expect((await api.get("/api/properties/999999")).status).toBe(404);
  });

  test("krever navn og adresse", async () => {
    expect((await api.post("/api/properties", { name: "Uten adresse" })).status).toBe(422);
  });
});

describe("skap", () => {
  test("opprettes under et anlegg", async () => {
    const prop = await makeProperty();
    const body = await api.post(`/api/properties/${prop.id}/panels`, {
      name: "Hovedtavle", location: "Gang", rows: 2, modules_per_row: 24,
    }).then((r) => ok(r, "opprett skap"));

    expect(body.property_id).toBe(prop.id);
    expect(body.rows).toBe(2);
    expect(body.modules_per_row).toBe(24);
  });

  test("listes per anlegg", async () => {
    const prop = await makeProperty();
    const panel = await makePanel(prop.id);
    const listing = await (await api.get(`/api/properties/${prop.id}/panels`))
      .json<Array<{ id: number }>>();
    expect(listing.map((p) => p.id)).toContain(panel.id);
  });

  test("leses, listes, oppdateres og slettes", async () => {
    const panel = await makePanel();

    expect((await api.get(`/api/panels/${panel.id}`)).status).toBe(200);
    const all = await (await api.get("/api/panels")).json<Array<{ id: number }>>();
    expect(all.map((p) => p.id)).toContain(panel.id);

    const updated = await api.fetch(`/api/panels/${panel.id}`, {
      method: "PUT", body: JSON.stringify({ location: "Kjeller" }),
    }).then((r) => ok(r, "oppdater skap"));
    expect(updated.location).toBe("Kjeller");

    expect((await api.fetch(`/api/panels/${panel.id}`, { method: "DELETE" })).status).toBe(200);
  });

  test("kan også opprettes flatt, med anlegget i kroppen", async () => {
    const prop = await makeProperty();
    const body = await api.post("/api/panels", {
      property_id: prop.id, name: "Underfordeling", location: "Loft",
    }).then((r) => ok(r, "flat opprettelse"));
    expect(body.property_id).toBe(prop.id);
  });

  test("nekter å slettes når det har kurser", async () => {
    const panel = await makePanel();
    await makeCircuit(panel.id);
    expect((await api.fetch(`/api/panels/${panel.id}`, { method: "DELETE" })).status).toBe(409);
  });

  test("slettes sammen med modulene sine", async () => {
    // Moduler er skapoppsett, ikke selvstendige poster. Et skap med
    // moduler i er det helt alminnelige tilfellet, og det svarte 500 helt
    // til nylig: ingenting erklærte kaskaden.
    const panel = await makePanel();
    await makeModule(panel.id);
    expect((await api.fetch(`/api/panels/${panel.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await api.get(`/api/panels/${panel.id}`)).status).toBe(404);
  });
});

describe("moduler", () => {
  test("plasseres i skapet", async () => {
    const panel = await makePanel();
    const body = await api.post(`/api/panels/${panel.id}/modules`, {
      row: 0, position: 4, width: 2, type: "breaker", label: "B02", ampere: 16,
    }).then((r) => ok(r, "plasser"));

    expect([body.row, body.position, body.width]).toEqual([0, 4, 2]);
  });

  test("listes per skap", async () => {
    const panel = await makePanel();
    const module = await makeModule(panel.id);
    const listing = await (await api.get(`/api/panels/${panel.id}/modules`))
      .json<Array<{ id: number }>>();
    expect(listing.map((m) => m.id)).toContain(module.id);
  });

  test("kan flyttes", async () => {
    const module = await makeModule();
    const body = await api.fetch(`/api/modules/${module.id}`, {
      method: "PUT", body: JSON.stringify({ position: 10 }),
    }).then((r) => ok(r, "flytt"));
    expect(body.position).toBe(10);
  });

  test("kan ikke flyttes oppå en annen", async () => {
    // 409 — skapvisningen bygger på dette for å avvise slippet.
    const panel = await makePanel();
    await makeModule(panel.id, { row: 0, position: 0, width: 2 });
    const mover = await makeModule(panel.id, { row: 0, position: 8, width: 2 });

    const res = await api.fetch(`/api/modules/${mover.id}`, {
      method: "PUT", body: JSON.stringify({ position: 0 }),
    });
    expect(res.status).toBe(409);

    const after = await (await api.get(`/api/panels/${panel.id}/modules`))
      .json<Array<{ id: number; position: number }>>();
    expect(after.find((m) => m.id === mover.id)!.position).toBe(8);
  });

  test("kan ikke overlappe ved opprettelse", async () => {
    const panel = await makePanel();
    await makeModule(panel.id, { row: 0, position: 0, width: 2 });
    const res = await api.post(`/api/panels/${panel.id}/modules`, {
      row: 0, position: 1, width: 2, type: "breaker",
    });
    expect(res.status).toBe(409);
  });

  test("kan ikke henge ut over skinnen", async () => {
    const prop = await makeProperty();
    const panel = await makePanel(prop.id, { modules_per_row: 12 });
    const res = await api.post(`/api/panels/${panel.id}/modules`, {
      row: 0, position: 11, width: 4, type: "breaker",
    });
    expect([400, 422]).toContain(res.status);
  });

  test("kan slettes", async () => {
    const module = await makeModule();
    expect((await api.fetch(`/api/modules/${module.id}`, { method: "DELETE" })).status).toBe(200);
  });
});

// --- Kurser ----------------------------------------------------------------

describe("kurser", () => {
  test("opprettes under et skap, med alle feltene", async () => {
    const panel = await makePanel();
    const body = await api.post(`/api/panels/${panel.id}/circuits`, {
      designation: "B05", name: "Stikk kjøkken", room: "Kjøkken",
      cable_type: "PFXP", cross_section: 2.5, conductor_count: 3,
      length_m: 14.5, notes: "Langs taket",
    }).then((r) => ok(r, "opprett kurs"));

    expect(body.panel_id).toBe(panel.id);
    expect(body.cable_type).toBe("PFXP");
    expect(body.cross_section).toBe(2.5);
  });

  test("kan også opprettes flatt", async () => {
    const panel = await makePanel();
    const res = await api.post("/api/circuits", {
      panel_id: panel.id, designation: "B09", name: "Vaskerom",
    });
    expect(res.status).toBe(200);
  });

  test("listes per skap og globalt", async () => {
    const panel = await makePanel();
    const circuit = await makeCircuit(panel.id);

    const perPanel = await (await api.get(`/api/panels/${panel.id}/circuits`))
      .json<Array<{ id: number }>>();
    expect(perPanel.map((c) => c.id)).toContain(circuit.id);

    const listed = await (await api.get(`/api/circuits?panel_id=${panel.id}`))
      .json<Array<{ id: number }>>();
    expect(listed.map((c) => c.id)).toContain(circuit.id);
  });

  test("leses og oppdateres", async () => {
    const circuit = await makeCircuit();
    expect((await api.get(`/api/circuits/${circuit.id}`)).status).toBe(200);

    const body = await api.fetch(`/api/circuits/${circuit.id}`, {
      method: "PUT", body: JSON.stringify({ room: "Bod" }),
    }).then((r) => ok(r, "oppdater kurs"));
    expect(body.room).toBe("Bod");
  });

  test("kan ikke ha samme kursnummer to ganger i ett skap", async () => {
    const panel = await makePanel();
    await makeCircuit(panel.id, { designation: "B01" });
    const res = await api.post(`/api/panels/${panel.id}/circuits`, {
      designation: "B01", name: "Duplikat",
    });
    expect(res.status).toBe(400);
  });

  test("slettes når ingenting henger på", async () => {
    const circuit = await makeCircuit();
    expect((await api.fetch(`/api/circuits/${circuit.id}`, { method: "DELETE" })).status).toBe(200);
  });

  test("nekter å slettes med koblingspunkter på", async () => {
    const circuit = await makeCircuit();
    await makeConnectionPoint(circuit.id);
    expect((await api.fetch(`/api/circuits/${circuit.id}`, { method: "DELETE" })).status).toBe(409);
  });

  test("nekter å slettes med utstyr på", async () => {
    // Svarte 500 helt til nylig — vakten dekket koblingspunkter og glemte
    // utstyr.
    const circuit = await makeCircuit();
    await makeEquipment(circuit.id);
    expect((await api.fetch(`/api/circuits/${circuit.id}`, { method: "DELETE" })).status).toBe(409);
  });

  test("frigjør modulene som pekte på den når den slettes", async () => {
    // Ellers tegner skapvisningen en sikring koblet til ingenting.
    const panel = await makePanel();
    const circuit = await makeCircuit(panel.id);
    await makeModule(panel.id, { circuit_id: circuit.id });

    expect((await api.fetch(`/api/circuits/${circuit.id}`, { method: "DELETE" })).status).toBe(200);

    const modules = await (await api.get(`/api/panels/${panel.id}/modules`))
      .json<Array<{ circuit_id: number | null }>>();
    expect(modules.every((m) => m.circuit_id !== circuit.id)).toBe(true);
  });
});

// --- Koblingspunkter -------------------------------------------------------

describe("koblingspunkter", () => {
  test("opprettes, leses og oppdateres", async () => {
    const circuit = await makeCircuit();
    const cp = await api.post(`/api/circuits/${circuit.id}/connection_points`, {
      type: "light", location: "Tak stue", notes: "Dimbar",
    }).then((r) => ok(r, "opprett"));

    expect(cp.type).toBe("light");
    expect((await api.get(`/api/connection_points/${cp.id}`)).status).toBe(200);

    const updated = await api.fetch(`/api/connection_points/${cp.id}`, {
      method: "PUT", body: JSON.stringify({ location: "Tak gang" }),
    }).then((r) => ok(r, "oppdater"));
    expect(updated.location).toBe("Tak gang");
  });

  test("kan opprettes flatt", async () => {
    const circuit = await makeCircuit();
    const res = await api.post("/api/connection_points", {
      circuit_id: circuit.id, type: "switch", location: "Ved dør",
    });
    expect(res.status).toBe(200);
  });

  test("listes per kurs og globalt", async () => {
    const circuit = await makeCircuit();
    const cp = await makeConnectionPoint(circuit.id);

    const perCircuit = await (await api.get(`/api/circuits/${circuit.id}/connection_points`))
      .json<Array<{ id: number }>>();
    expect(perCircuit.map((c) => c.id)).toContain(cp.id);

    const listed = await (await api.get(`/api/connection_points?circuit_id=${circuit.id}`))
      .json<Array<{ id: number }>>();
    expect(listed.map((c) => c.id)).toContain(cp.id);
  });

  test("slettes", async () => {
    const cp = await makeConnectionPoint();
    expect((await api.fetch(`/api/connection_points/${cp.id}`, { method: "DELETE" })).status).toBe(200);
  });

  test("nekter å slettes når det har filer", async () => {
    const cp = await makeConnectionPoint();
    await upload({ connectionPointId: cp.id });
    expect((await api.fetch(`/api/connection_points/${cp.id}`, { method: "DELETE" })).status).toBe(409);
  });
});

// --- Utstyr ----------------------------------------------------------------

describe("utstyr", () => {
  test("opprettes, leses og oppdateres", async () => {
    const circuit = await makeCircuit();
    const eq = await api.post(`/api/circuits/${circuit.id}/equipment`, {
      type: "ev_charger", brand: "Easee", model: "Home", watt: 7400, notes: "Utvendig",
    }).then((r) => ok(r, "opprett"));

    expect(eq.type).toBe("ev_charger");
    expect(eq.watt).toBe(7400);
    expect((await api.get(`/api/equipment/${eq.id}`)).status).toBe(200);

    const updated = await api.fetch(`/api/equipment/${eq.id}`, {
      method: "PUT", body: JSON.stringify({ watt: 11000 }),
    }).then((r) => ok(r, "oppdater"));
    expect(updated.watt).toBe(11000);
  });

  test("kan opprettes flatt", async () => {
    const circuit = await makeCircuit();
    const res = await api.post("/api/equipment", {
      circuit_id: circuit.id, type: "heat_pump", brand: "Mitsubishi",
    });
    expect(res.status).toBe(200);
  });

  test("listes per kurs og globalt", async () => {
    const circuit = await makeCircuit();
    const eq = await makeEquipment(circuit.id);

    const perCircuit = await (await api.get(`/api/circuits/${circuit.id}/equipment`))
      .json<Array<{ id: number }>>();
    expect(perCircuit.map((e) => e.id)).toContain(eq.id);

    const listed = await (await api.get(`/api/equipment?circuit_id=${circuit.id}`))
      .json<Array<{ id: number }>>();
    expect(listed.map((e) => e.id)).toContain(eq.id);
  });

  test("kan opprettes med kanaler i én operasjon", async () => {
    const circuit = await makeCircuit();
    const eq = await api.post(`/api/circuits/${circuit.id}/equipment`, {
      type: "dynalite", brand: "Philips", channel_count: 4,
    }).then((r) => ok(r, "opprett med kanaler"));

    const channels = await (await api.get(`/api/equipment/${eq.id}/channels`))
      .json<Array<{ number: number }>>();
    expect(channels.map((c) => c.number)).toEqual([1, 2, 3, 4]);
  });

  test("slettes sammen med kanalene sine", async () => {
    // Kanaler er utstyrsdetalj, ikke selvstendige poster. Svarte 500 helt
    // til nylig, av samme grunn som skap og moduler.
    const eq = await makeEquipment();
    await makeChannel(eq.id, 1);
    await makeChannel(eq.id, 2);

    expect((await api.fetch(`/api/equipment/${eq.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await api.get(`/api/equipment/${eq.id}`)).status).toBe(404);
  });

  test("nekter å slettes når det har filer", async () => {
    const eq = await makeEquipment();
    await upload({ equipmentId: eq.id });
    expect((await api.fetch(`/api/equipment/${eq.id}`, { method: "DELETE" })).status).toBe(409);
  });
});

// --- Kanaler ---------------------------------------------------------------

describe("kanaler", () => {
  test("legges til og oppdateres", async () => {
    const eq = await makeEquipment();
    const channel = await api.post(`/api/equipment/${eq.id}/channels`, {
      number: 1, label: "Downlights", load: "12 spots", watt: 240, channel_type: "dimmer",
    }).then((r) => ok(r, "opprett kanal"));

    expect(channel.channel_type).toBe("dimmer");

    const updated = await api.fetch(`/api/channels/${channel.id}`, {
      method: "PUT", body: JSON.stringify({ watt: 300 }),
    }).then((r) => ok(r, "oppdater kanal"));
    expect(updated.watt).toBe(300);
  });

  test("kan ikke ha samme nummer to ganger på ett utstyr", async () => {
    const eq = await makeEquipment();
    await makeChannel(eq.id, 1);
    expect((await api.post(`/api/equipment/${eq.id}/channels`, { number: 1 })).status).toBe(400);
  });

  test("kan betjene en annen kurs enn utstyret sitt", async () => {
    // Ikke utledbart fra nestingen, så det er en ekte referanse.
    const panel = await makePanel();
    const own = await makeCircuit(panel.id, { designation: "B20" });
    const other = await makeCircuit(panel.id, { designation: "B21" });
    const eq = await makeEquipment(own.id);

    const body = await api.post(`/api/equipment/${eq.id}/channels`, {
      number: 1, circuit_id: other.id,
    }).then((r) => ok(r, "kanal mot annen kurs"));
    expect(body.circuit_id).toBe(other.id);
  });

  test("slettes", async () => {
    const channel = await makeChannel();
    expect((await api.fetch(`/api/channels/${channel.id}`, { method: "DELETE" })).status).toBe(200);
  });
});

// --- Filer -----------------------------------------------------------------

describe("filer", () => {
  test("lastes opp, leses og slettes", async () => {
    const cp = await makeConnectionPoint();
    const record = await upload({ connectionPointId: cp.id }, JPEG, "skap.jpg")
      .then((r) => ok(r, "last opp"));

    expect(record.filename).toBe("skap.jpg");
    expect(record.mimetype).toBe("image/jpeg");
    expect(record.connection_point_id).toBe(cp.id);

    expect((await api.get(`/api/files/${record.id}`)).status).toBe(200);

    const content = await api.get(`/api/files/${record.id}/content`);
    expect(content.status).toBe(200);
    expect(new Uint8Array(await content.arrayBuffer())).toEqual(JPEG);

    expect((await api.fetch(`/api/files/${record.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await api.get(`/api/files/${record.id}/content`)).status).toBe(404);
  });

  test("kan henge på utstyr", async () => {
    const eq = await makeEquipment();
    const body = await upload({ equipmentId: eq.id }, PDF, "datablad.pdf", "application/pdf")
      .then((r) => ok(r, "last opp mot utstyr"));

    expect(body.equipment_id).toBe(eq.id);
    expect(body.mimetype).toBe("application/pdf");
  });

  test("har to flate opplastingsruter", async () => {
    // Id-en som spørreparameter, og som skjemafelt. Begge er i kontrakten.
    const cp = await makeConnectionPoint();

    const legacy = new FormData();
    legacy.append("file", new File([PNG as BufferSource], "a.png", { type: "image/png" }));
    expect((await api.fetch(
      `/api/files/upload?connection_point_id=${cp.id}`,
      { method: "POST", body: legacy },
    )).status).toBe(200);

    const form = new FormData();
    form.append("file", new File([PNG as BufferSource], "b.png", { type: "image/png" }));
    form.append("connection_point_id", String(cp.id));
    expect((await api.fetch("/api/files", { method: "POST", body: form })).status).toBe(200);
  });

  test("listes og filtreres", async () => {
    const cp = await makeConnectionPoint();
    const file = await upload({ connectionPointId: cp.id }).then((r) => ok(r, "last opp"));

    const perCp = await (await api.get(`/api/connection_points/${cp.id}/files`))
      .json<Array<{ id: number }>>();
    expect(perCp.map((f) => f.id)).toContain(file.id);

    const listed = await (await api.get(`/api/files?connection_point_id=${cp.id}`))
      .json<Array<{ id: number }>>();
    expect(listed.map((f) => f.id)).toContain(file.id);
  });

  test("listes per utstyr", async () => {
    const eq = await makeEquipment();
    const file = await upload({ equipmentId: eq.id }).then((r) => ok(r, "last opp"));

    const perEquipment = await (await api.get(`/api/equipment/${eq.id}/files`))
      .json<Array<{ id: number }>>();
    expect(perEquipment.map((f) => f.id)).toContain(file.id);

    const listed = await (await api.get(`/api/files?equipment_id=${eq.id}`))
      .json<Array<{ id: number }>>();
    expect(listed.map((f) => f.id)).toContain(file.id);
  });

  test("typebestemmes av bytene, ikke av headeren", async () => {
    // En PDF som utgir seg for å være en JPEG lagres som en PDF.
    const cp = await makeConnectionPoint();
    const body = await upload({ connectionPointId: cp.id }, PDF, "lureri.jpg", "image/jpeg")
      .then((r) => ok(r, "last opp"));
    expect(body.mimetype).toBe("application/pdf");
  });

  test("av en type vi ikke tar imot avvises", async () => {
    const cp = await makeConnectionPoint();
    const res = await upload(
      { connectionPointId: cp.id },
      new TextEncoder().encode("<html>hei</html>"),
      "side.html",
      "text/html",
    );
    expect(res.status).toBe(400);
  });

  test("røper ikke hvor de ligger", async () => {
    // Å dele ut nøkkelen inviterer noen til å prøve bøtta direkte.
    const cp = await makeConnectionPoint();
    const record = await upload({ connectionPointId: cp.id }).then((r) => ok(r, "last opp"));
    expect(Object.keys(record)).not.toContain("storage_key");
    expect(Object.keys(record)).not.toContain("local_path");
  });
});

// --- Modultyper ------------------------------------------------------------

describe("modultyper", () => {
  test("de innebygde er på plass", async () => {
    const listing = await (await api.get("/api/module_types"))
      .json<Array<{ key: string; is_builtin: boolean }>>();
    const keys = listing.map((t) => t.key);

    for (const key of ["breaker", "rcd", "main_switch"]) expect(keys).toContain(key);
    expect(listing.find((t) => t.key === "breaker")!.is_builtin).toBe(true);
  });

  test("egne opprettes, leses, oppdateres og slettes", async () => {
    const kind = await api.post("/api/module_types", {
      key: "kontrakttype", name_no: "Kontrakttype", color: "#123456",
      abbreviation: "KT", can_have_circuit: true, can_have_ampere: false,
    }).then((r) => ok(r, "opprett type"));

    expect(kind.is_builtin).toBe(false);
    expect((await api.get(`/api/module_types/${kind.id}`)).status).toBe(200);

    const updated = await api.fetch(`/api/module_types/${kind.id}`, {
      method: "PUT", body: JSON.stringify({ color: "#654321" }),
    }).then((r) => ok(r, "oppdater type"));
    expect(updated.color).toBe("#654321");

    expect((await api.fetch(`/api/module_types/${kind.id}`, { method: "DELETE" })).status).toBe(200);
  });

  test("en nøkkel kan ikke brukes to ganger", async () => {
    await api.post("/api/module_types", {
      key: "dobbel", name_no: "Første", color: "#000000", abbreviation: "D1",
    }).then((r) => ok(r, "første"));

    const res = await api.post("/api/module_types", {
      key: "dobbel", name_no: "Andre", color: "#111111", abbreviation: "D2",
    });
    expect(res.status).toBe(400);
  });

  test("en innebygd kan ikke slettes", async () => {
    // Den deles av alle, så den er ikke én organisasjons å fjerne.
    const listing = await (await api.get("/api/module_types"))
      .json<Array<{ key: string; id: number }>>();
    const surge = listing.find((t) => t.key === "surge_protection")!;
    expect((await api.fetch(`/api/module_types/${surge.id}`, { method: "DELETE" })).status).toBe(409);
  });

  test("å redigere en innebygd lager en kopi i stedet", async () => {
    const before = (await (await api.get("/api/module_types"))
      .json<Array<{ key: string; id: number; color: string; is_builtin: boolean }>>())
      .find((t) => t.key === "surge_protection")!;
    expect(before.is_builtin).toBe(true);

    const copy = await api.fetch(`/api/module_types/${before.id}`, {
      method: "PUT", body: JSON.stringify({ color: "#ff0000" }),
    }).then((r) => ok(r, "rediger innebygd"));

    const listing = (await (await api.get("/api/module_types"))
      .json<Array<{ key: string; color: string }>>())
      .filter((t) => t.key === "surge_protection");

    expect(listing, "kopien skal skygge for den delte, ikke komme i tillegg").toHaveLength(1);
    expect(listing[0].color).toBe("#ff0000");

    // Og å fjerne kopien gir standarden tilbake.
    expect((await api.fetch(`/api/module_types/${copy.id}`, { method: "DELETE" })).status).toBe(200);
    const after = (await (await api.get("/api/module_types"))
      .json<Array<{ key: string; color: string }>>())
      .find((t) => t.key === "surge_protection")!;
    expect(after.color).toBe(before.color);
  });

  test("bruken telles per nøkkel", async () => {
    const panel = await makePanel();
    await api.post(`/api/panels/${panel.id}/modules`, {
      row: 1, position: 0, width: 1, type: "rcd",
    }).then((r) => ok(r, "plasser rcd"));

    const body = await (await api.get("/api/module_types/rcd/usage"))
      .json<{ key: string; count: number }>();
    expect(body.count).toBeGreaterThanOrEqual(1);
  });

  test("en type i bruk kan ikke slettes", async () => {
    const kind = await api.post("/api/module_types", {
      key: "i_bruk", name_no: "I bruk", color: "#222222", abbreviation: "IB",
    }).then((r) => ok(r, "opprett type"));

    const panel = await makePanel();
    await api.post(`/api/panels/${panel.id}/modules`, {
      row: 0, position: 0, width: 1, type: "i_bruk",
    }).then((r) => ok(r, "plasser"));

    expect((await api.fetch(`/api/module_types/${kind.id}`, { method: "DELETE" })).status).toBe(409);
  });
});

// --- Endringslogg ----------------------------------------------------------

describe("endringsloggen", () => {
  test("skrives og leses", async () => {
    const circuit = await makeCircuit();
    const entry = await api.post("/api/changelog", {
      circuit_id: circuit.id, changed_by: "Ola", description: "Byttet sikring til 16A",
    }).then((r) => ok(r, "skriv logg"));

    expect((await api.get(`/api/changelog/${entry.id}`)).status).toBe(200);

    const perCircuit = await (await api.get(`/api/circuits/${circuit.id}/changelog`))
      .json<Array<{ id: number }>>();
    expect(perCircuit.map((e) => e.id)).toContain(entry.id);

    expect((await api.get(`/api/changelog?circuit_id=${circuit.id}`)).status).toBe(200);
  });

  test("føres av seg selv når et koblingspunkt opprettes", async () => {
    // Loggen skal vise utført arbeid, ikke bare det noen skrev inn i den.
    const circuit = await makeCircuit();
    await api.post(`/api/circuits/${circuit.id}/connection_points`, {
      type: "outlet", location: "Stue sør",
    }).then((r) => ok(r, "opprett koblingspunkt"));

    const entries = await (await api.get(`/api/circuits/${circuit.id}/changelog`))
      .json<Array<{ description: string }>>();
    expect(entries.some((e) => e.description.includes("Koblingspunkt"))).toBe(true);
  });

  test("kan leses per koblingspunkt", async () => {
    const cp = await makeConnectionPoint();
    const res = await api.get(`/api/connection_points/${cp.id}/changelog`);
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });
});

// --- Eksport og import -----------------------------------------------------

describe("eksport", () => {
  test("bærer hele anlegget", async () => {
    const prop = await makeProperty({
      owner_name: "Ola Nordmann", owner_email: "ola@example.com",
    });
    const panel = await makePanel(prop.id);
    await makeCircuit(panel.id);
    await api.post(`/api/panels/${panel.id}/modules`, {
      row: 0, position: 0, width: 2, type: "breaker", ampere: 16,
    }).then((r) => ok(r, "plasser modul"));

    const body = await (await api.get(`/api/export/${prop.id}`)).json<{
      owner_name: string;
      format_version: number;
      panels: Array<{ modules: unknown[]; circuits: unknown[] }>;
    }>();

    expect(body.owner_name).toBe("Ola Nordmann");
    expect(body.format_version).toBeGreaterThanOrEqual(2);
    expect(body.panels).toHaveLength(1);
    // Format 1 utelot disse, som gjorde en rundtur til et tap av hele
    // skapoversikten.
    expect(body.panels[0].modules).toHaveLength(1);
    expect(body.panels[0].circuits).toHaveLength(1);
  });

  test("importeres tilbake til noe identisk", async () => {
    const prop = await makeProperty();
    const panel = await makePanel(prop.id);
    const circuit = await makeCircuit(panel.id);
    await api.post(`/api/panels/${panel.id}/modules`, {
      row: 0, position: 0, width: 2, type: "breaker", circuit_id: circuit.id,
    }).then((r) => ok(r, "plasser modul"));

    const original = await (await api.get(`/api/export/${prop.id}`)).json<Record<string, never>>();
    const imported = await api.post("/api/export", original).then((r) => ok(r, "importer"));

    expect(imported.id, "import skal opprette, ikke overskrive").not.toBe(prop.id);

    const roundTripped = await (await api.get(`/api/export/${imported.id}`))
      .json<Record<string, never>>();

    expect(comparable(roundTripped)).toEqual(comparable(original));
  });

  test("avviser et format fra framtiden", async () => {
    const res = await api.post("/api/export", {
      format_version: 99, name: "Fra framtiden", address: "X", panels: [],
    });
    expect(res.status).toBe(422);
  });

  test("avviser en ødelagt fil", async () => {
    expect((await api.post("/api/export", { name: "Mangler adresse" })).status).toBe(422);
  });
});

/**
 * Eksporten uten det som lovlig endrer seg i en rundtur.
 *
 * Id-er og tidsstempler er nye etter en import; kurshenvisninger byttes
 * ut med kursens eget nummer, som er stabilt. Alt annet skal være likt,
 * og det er hele påstanden om at eksport og import er inverser.
 */
function comparable(node: unknown, designations?: Map<number, string>): unknown {
  if (designations === undefined) {
    const map = new Map<number, string>();
    const doc = node as { panels?: Array<{ circuits?: Array<{ id: number; designation: string }> }> };
    for (const panel of doc.panels ?? []) {
      for (const circuit of panel.circuits ?? []) map.set(circuit.id, circuit.designation);
    }
    return comparable(node, map);
  }

  if (Array.isArray(node)) return node.map((v) => comparable(v, designations));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "id" || key === "created_at") continue;
      out[key] = key === "circuit_id"
        ? (value === null ? null : designations.get(value as number) ?? null)
        : comparable(value, designations);
    }
    return out;
  }
  return node;
}

// --- Innlogging ------------------------------------------------------------

describe("innlogging", () => {
  test("forteller hvem som ringer", async () => {
    const body = await (await api.get("/api/auth/me")).json<{
      email: string; organizations: unknown[];
    }>();
    expect(body.email).toBeTruthy();
    expect(Array.isArray(body.organizations)).toBe(true);
  });

  test("helsesjekken er åpen og sier ok", async () => {
    const res = await api.get("/api/health");
    expect(res.status).toBe(200);
    expect((await res.json<{ status: string }>()).status).toBe("ok");
  });

  test("svarer likt for kjent og ukjent adresse", async () => {
    // Ellers er endepunktet en måte å finne ut hvem som er kunder.
    const first = await api.post("/api/auth/request-code", { email: "a@example.com" });
    const second = await api.post("/api/auth/request-code", { email: "b@example.com" });

    expect(first.status).toBe(second.status);
    expect(await first.text()).toBe(await second.text());
  });

  test("avviser en adresse som ikke er en", async () => {
    expect((await api.post("/api/auth/request-code", { email: "ikke-en-adresse" })).status).toBe(422);
    expect((await api.post("/api/auth/request-code", {})).status).toBe(422);
  });

  test("avviser feil kode", async () => {
    await api.post("/api/auth/request-code", { email: "feilkode@example.com" });
    const res = await api.post("/api/auth/verify", {
      email: "feilkode@example.com", code: "000000",
    });
    expect(res.status).toBe(400);
  });

  test("avviser verifisering uten en utestående kode", async () => {
    const res = await api.post("/api/auth/verify", {
      email: "ingen-kode@example.com", code: "123456",
    });
    expect(res.status).toBe(400);
  });

  test("krever begge feltene ved verifisering", async () => {
    expect((await api.post("/api/auth/verify", { email: "a@example.com" })).status).toBe(422);
  });

  test("utlogging kan kalles uansett", async () => {
    // Den må svare likt med og uten sesjon, så en klient alltid kan kalle
    // den uten å sjekke først.
    expect((await api.post("/api/auth/logout")).status).toBe(200);
    expect((await api.post("/api/auth/logout")).status).toBe(200);
  });
});

// --- Dekningen -------------------------------------------------------------
//
// Må stå sist: den leser tilstand resten av fila har produsert.

describe("dekningen", () => {
  test("hvert endepunkt i kontrakten ble faktisk truffet", () => {
    const expected = ENDPOINTS.map((e) => `${e.method} ${e.path}`);
    const missing = expected.filter((key) => !TOUCHED.has(key)).sort();

    expect(
      missing,
      `${missing.length} av ${expected.length} endepunkter er ikke dekket. ` +
        "Et endepunkt uten dekning er et sted koden kan avvike fra " +
        "kontrakten uten at noe sier fra.",
    ).toEqual([]);
  });

  test("ingenting ble truffet som ikke står i kontrakten", () => {
    // En forespørsel mot noe ulistet betyr at inventaret er utdatert.
    const surprising = [...TOUCHED].filter((key) => key.startsWith("UKJENT")).sort();
    expect(surprising).toEqual([]);
  });
});
