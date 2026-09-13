/**
 * Session 2's proof: the schema builds against D1 and every table can be
 * written and read.
 *
 * This is a smoke worker, not the API. It exists so the foundation is
 * demonstrated rather than assumed — the endpoints arrive in later
 * sessions and replace this file entirely.
 */

import { drizzle } from "drizzle-orm/d1";
import { eq } from "drizzle-orm";

import * as s from "./schema";

export interface Env {
  DB: D1Database;
  FILES: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const db = drizzle(env.DB, { schema: s });
    const url = new URL(request.url);

    if (url.pathname !== "/smoke") {
      return new Response("smoke worker: GET /smoke", { status: 404 });
    }

    const touched: Record<string, number> = {};

    // Walk the whole tree the way the application does, so a missing
    // column or a broken foreign key shows up here rather than three
    // sessions from now.
    const [org] = await db
      .insert(s.organization)
      .values({ name: "Smoke" })
      .returning();
    touched.organization = org.id;

    const [user] = await db
      .insert(s.appUser)
      .values({ email: `smoke-${crypto.randomUUID()}@example.com` })
      .returning();
    touched.app_user = user.id;

    const [member] = await db
      .insert(s.membership)
      .values({ userId: user.id, organizationId: org.id, role: "owner" })
      .returning();
    touched.membership = member.id;

    const [prop] = await db
      .insert(s.property)
      .values({
        organizationId: org.id,
        name: "Smokebolig",
        address: "Røykveien 1",
        ownerName: "Ola Nordmann",
      })
      .returning();
    touched.property = prop.id;

    const [pnl] = await db
      .insert(s.panel)
      .values({
        organizationId: org.id,
        propertyId: prop.id,
        name: "Hovedtavle",
        location: "Gang",
        rows: 2,
        modulesPerRow: 24,
      })
      .returning();
    touched.panel = pnl.id;

    const [crc] = await db
      .insert(s.circuit)
      .values({
        organizationId: org.id,
        panelId: pnl.id,
        designation: "B01",
        name: "Lys stue",
        cableType: "PFXP",
        crossSection: 1.5,
      })
      .returning();
    touched.circuit = crc.id;

    const [mod] = await db
      .insert(s.module)
      .values({
        organizationId: org.id,
        panelId: pnl.id,
        row: 0,
        position: 0,
        width: 2,
        type: "breaker",
        ampere: 16,
        circuitId: crc.id,
      })
      .returning();
    touched.module = mod.id;

    const [cp] = await db
      .insert(s.connectionPoint)
      .values({
        organizationId: org.id,
        circuitId: crc.id,
        type: "outlet",
        location: "Stue nord",
      })
      .returning();
    touched.connectionpoint = cp.id;

    const [eq_] = await db
      .insert(s.equipment)
      .values({
        organizationId: org.id,
        circuitId: crc.id,
        type: "dynalite",
        brand: "Philips",
        watt: 1200,
      })
      .returning();
    touched.equipment = eq_.id;

    const [chn] = await db
      .insert(s.channel)
      .values({
        organizationId: org.id,
        equipmentId: eq_.id,
        number: 1,
        channelType: "dimmer",
        circuitId: crc.id,
      })
      .returning();
    touched.channel = chn.id;

    const [mtd] = await db
      .insert(s.moduleTypeDefinition)
      .values({
        organizationId: org.id,
        key: `smoke-${crypto.randomUUID().slice(0, 8)}`,
        nameNo: "Smoketype",
        color: "#123456",
        abbreviation: "SM",
        canHaveCircuit: true,
      })
      .returning();
    touched.moduletypedefinition = mtd.id;

    // R2 as well: the bytes have to leave the instance or every uploaded
    // photo dies with it.
    const key = `org-${org.id}/${crypto.randomUUID()}.jpg`;
    await env.FILES.put(key, new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]));
    const stored = await env.FILES.get(key);
    const bytes = stored ? (await stored.arrayBuffer()).byteLength : 0;

    const [fil] = await db
      .insert(s.file)
      .values({
        organizationId: org.id,
        connectionPointId: cp.id,
        filename: "skap.jpg",
        mimetype: "image/jpeg",
        storageKey: key,
      })
      .returning();
    touched.file = fil.id;

    const [log] = await db
      .insert(s.changelog)
      .values({
        organizationId: org.id,
        circuitId: crc.id,
        changedBy: "smoke",
        description: "Røyktest",
      })
      .returning();
    touched.changelog = log.id;

    const [code] = await db
      .insert(s.loginCode)
      .values({
        email: "smoke@example.com",
        codeHash: "x".repeat(64),
        expiresAt: new Date(Date.now() + 600_000),
      })
      .returning();
    touched.logincode = code.id;

    const [sess] = await db
      .insert(s.userSession)
      .values({
        userId: user.id,
        tokenHash: crypto.randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning();
    touched.usersession = sess.id;

    // Read something back through a relation, and check the types survive
    // the round trip: SQLite has no boolean and no datetime.
    const readBack = await db
      .select()
      .from(s.property)
      .where(eq(s.property.id, prop.id))
      .get();

    return Response.json({
      tables_written: Object.keys(touched).length,
      touched,
      r2_bytes_round_tripped: bytes,
      types: {
        created_at_is_date: readBack?.createdAt instanceof Date,
        boolean_survives: (await db
          .select()
          .from(s.moduleTypeDefinition)
          .where(eq(s.moduleTypeDefinition.id, mtd.id))
          .get())?.canHaveCircuit === true,
        owner_name: readBack?.ownerName ?? null,
      },
    });
  },
};
