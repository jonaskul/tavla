/**
 * Export and import a whole property as JSON.
 *
 * These two are inverses, and the round-trip test pins that down: export,
 * import, export again, require equality. That matters for three separate
 * reasons — data portability, which is a GDPR obligation once there are
 * paying customers; onboarding, which is how a customer arrives with
 * existing documentation instead of retyping it; and rescue, which is the
 * only way data survives moving between installations.
 *
 * ---
 *
 * The import is where D1 costs something, and it is worth being precise
 * about what.
 *
 * The Python version did the whole thing in one transaction: seven
 * `flush()` calls to get generated ids, one `commit()` at the end. A file
 * that failed partway left nothing behind, "because half a documented
 * installation is worse than none".
 *
 * D1 refuses interactive transactions — BEGIN is rejected outright. What
 * it has is `batch()`, which is atomic and does hand back the ids each
 * statement generated; both were verified against a real local D1 rather
 * than assumed. But a batch has to be built before any of it runs, so
 * anything needing an id from earlier in the same import needs its own
 * batch.
 *
 * That gives five rounds, each atomic in itself:
 *
 *   1. the property
 *   2. every panel
 *   3. every circuit          <- before anything that references one
 *   4. modules, connection points, equipment
 *   5. channels               <- need the equipment ids from round 4
 *
 * Round 3 is the reason for the shape. A channel may serve a circuit under
 * a different panel, so all circuits must exist before anything points at
 * one.
 *
 * The rounds are not atomic with each other, and that cannot be recovered
 * on D1. Two things get close:
 *
 * - Everything that can be refused is refused before round 1, so what is
 *   left to fail is a database error rather than a bad file.
 * - If a later round fails, the property and everything under it is
 *   deleted. That cleanup is itself one batch, so it either happens or the
 *   error says so.
 *
 * This is the bill for choosing integer primary keys in session 2. UUIDs
 * would have made the whole import a single atomic batch, since every id
 * would be known up front. Integers were the right call — the contract
 * says ids are integers and the frontend puts them in URLs — but this is
 * where it is paid.
 */

import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";

import * as s from "../schema";
import type { Env } from "../context";
import type { Tenant } from "../db";
import { fail, intParam } from "../http";
import {
  CABLE_TYPES,
  CONNECTION_POINT_TYPES,
  EQUIPMENT_TYPES,
  CHANNEL_TYPES,
  type CableType,
  type ChannelType,
  type ConnectionPointType,
  type EquipmentType,
  propertyRead,
} from "../schemas";
import { checkField, readBody, type Problem, type Shape } from "../validate";
import { invalid } from "../http";
import { must } from "./lookup";

export const exportRoutes = new Hono<Env>();

/**
 * Bumped when the shape changes incompatibly, so an old file fails loudly
 * instead of importing as something subtly wrong.
 */
export const FORMAT_VERSION = 2;

// --- Export ----------------------------------------------------------------

exportRoutes.get("/:property_id", async (c) => {
  const tenant = c.get("tenant");
  const id = intParam(c.req.param("property_id"), "property_id");
  const property = await must(tenant, s.property, id, "Property not found");

  const panels = await tenant.list(s.panel, eq(s.panel.propertyId, id));

  const panelsOut = [];
  for (const panel of panels) {
    const modules = await tenant.list(s.module, eq(s.module.panelId, panel.id));
    const circuits = await tenant.list(s.circuit, eq(s.circuit.panelId, panel.id));

    const circuitsOut = [];
    for (const circuit of circuits) {
      const cps = await tenant.list(
        s.connectionPoint,
        eq(s.connectionPoint.circuitId, circuit.id),
      );
      const items = await tenant.list(s.equipment, eq(s.equipment.circuitId, circuit.id));

      const equipmentOut = [];
      for (const item of items) {
        const channels = await tenant.list(s.channel, eq(s.channel.equipmentId, item.id));
        equipmentOut.push({
          id: item.id,
          type: item.type,
          brand: item.brand,
          model: item.model,
          watt: item.watt,
          notes: item.notes,
          channels: [...channels]
            .sort((a, b) => a.number - b.number)
            .map((ch) => ({
              id: ch.id,
              number: ch.number,
              label: ch.label,
              load: ch.load,
              watt: ch.watt,
              channel_type: ch.channelType,
              notes: ch.notes,
              // A channel may serve a circuit other than the one its
              // equipment hangs off, so this is a real reference and not
              // derivable from nesting.
              circuit_id: ch.circuitId,
            })),
        });
      }

      circuitsOut.push({
        id: circuit.id,
        designation: circuit.designation,
        name: circuit.name,
        room: circuit.room,
        cable_type: circuit.cableType,
        cross_section: circuit.crossSection,
        conductor_count: circuit.conductorCount,
        length_m: circuit.lengthM,
        notes: circuit.notes,
        connection_points: cps.map((cp) => ({
          id: cp.id,
          type: cp.type,
          location: cp.location,
          notes: cp.notes,
        })),
        equipment: equipmentOut,
      });
    }

    panelsOut.push({
      id: panel.id,
      name: panel.name,
      location: panel.location,
      rows: panel.rows,
      modules_per_row: panel.modulesPerRow,
      notes: panel.notes,
      // The panel layout. Absent from format 1, which made the export
      // lossy in exactly the place the app is most useful.
      modules: [...modules]
        .sort((a, b) => a.row - b.row || a.position - b.position)
        .map((m) => ({
          row: m.row,
          position: m.position,
          width: m.width,
          type: m.type,
          label: m.label,
          ampere: m.ampere,
          has_rcd: m.hasRcd,
          is_vacant: m.isVacant,
          // Original circuit id; the importer remaps it.
          circuit_id: m.circuitId,
        })),
      circuits: circuitsOut,
    });
  }

  return c.json({
    format_version: FORMAT_VERSION,
    id: property.id,
    name: property.name,
    address: property.address,
    owner_name: property.ownerName,
    owner_email: property.ownerEmail,
    owner_phone: property.ownerPhone,
    created_at: property.createdAt.toISOString(),
    panels: panelsOut,
  });
});

// --- The file, checked before anything is written --------------------------
//
// Validating the whole tree up front is what makes the phased import
// tolerable: by the time round 1 runs, everything a bad file could do has
// already been refused, and what is left to fail is the database itself.

const CHANNEL_IN: Shape = {
  number: { kind: "int", required: true, min: 1 },
  label: { kind: "string" },
  load: { kind: "string" },
  watt: { kind: "int" },
  channel_type: { kind: "string", default: "relay", values: CHANNEL_TYPES },
  notes: { kind: "string" },
  circuit_id: { kind: "int" },
};

const EQUIPMENT_IN: Shape = {
  id: { kind: "int" },
  type: { kind: "string", required: true, values: EQUIPMENT_TYPES },
  brand: { kind: "string" },
  model: { kind: "string" },
  watt: { kind: "int" },
  notes: { kind: "string" },
};

const CONNECTION_POINT_IN: Shape = {
  id: { kind: "int" },
  type: { kind: "string", required: true, values: CONNECTION_POINT_TYPES },
  location: { kind: "string", required: true },
  notes: { kind: "string" },
};

const CIRCUIT_IN: Shape = {
  id: { kind: "int" },
  designation: { kind: "string", required: true },
  name: { kind: "string", required: true },
  room: { kind: "string" },
  cable_type: { kind: "string", values: CABLE_TYPES },
  cross_section: { kind: "number" },
  conductor_count: { kind: "int" },
  length_m: { kind: "number" },
  notes: { kind: "string" },
};

const MODULE_IN: Shape = {
  row: { kind: "int", required: true, min: 0 },
  position: { kind: "int", required: true, min: 0 },
  width: { kind: "int", default: 1, min: 1 },
  type: { kind: "string", required: true },
  label: { kind: "string" },
  ampere: { kind: "int" },
  has_rcd: { kind: "boolean", default: false },
  is_vacant: { kind: "boolean", default: false },
  circuit_id: { kind: "int" },
};

const PANEL_IN: Shape = {
  id: { kind: "int" },
  name: { kind: "string", required: true },
  location: { kind: "string", required: true },
  rows: { kind: "int", default: 1, min: 1 },
  modules_per_row: { kind: "int", default: 12, min: 1 },
  notes: { kind: "string" },
};

const PROPERTY_IN: Shape = {
  // Absent in files written before the format was versioned; those predate
  // modules being exported at all.
  format_version: { kind: "int", default: 1 },
  name: { kind: "string", required: true },
  address: { kind: "string", required: true },
  owner_name: { kind: "string" },
  owner_email: { kind: "string" },
  owner_phone: { kind: "string" },
};

type Row = Record<string, unknown>;

/**
 * A nested list, checked against a shape. Empty when the key is absent.
 *
 * Returns the checked object *and* the original. `check` keeps only the
 * fields the shape names, which is what makes the validated tree safe to
 * write — but the nesting lives in keys no shape names, so reading the
 * children out of the checked object finds nothing.
 *
 * That is not hypothetical: it is what this did at first. The import then
 * created the property and its panels and stopped, silently, and the
 * round-trip test was the only thing that said so.
 */
function children(
  node: Row,
  key: string,
  shape: Shape,
  at: string[],
): Array<{ ok: Row; raw: Row }> {
  const raw = node[key];
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw invalid([
      { type: "list_type", loc: [...at, key], msg: "Input should be a valid list" },
    ]);
  }
  return raw.map((entry, i) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw invalid([
        {
          type: "model_attributes_type",
          loc: [...at, key, String(i)],
          msg: "Input should be a valid dictionary",
        },
      ]);
    }
    return {
      ok: check(entry as Row, shape, [...at, key, String(i)]),
      raw: entry as Row,
    };
  });
}

/**
 * One object against a shape, with the request validator's own rules.
 *
 * `checkField` rather than a local copy, and that is not tidiness. The
 * first version of this checked only whether a field was present and let
 * the value through untouched — so a module with `"row": "øverst"` passed
 * validation and reached the insert, where it became a database error
 * halfway through a phased import. The whole "refuse everything before
 * round 1" argument rested on a check that was not doing it.
 */
function check(node: Row, shape: Shape, at: string[]): Row {
  const problems: Problem[] = [];
  const out: Row = {};

  for (const [name, field] of Object.entries(shape)) {
    const raw = node[name];
    if (raw === undefined || raw === null) {
      if (field.required) {
        problems.push({ type: "missing", loc: [...at, name], msg: "Field required" });
        continue;
      }
      out[name] = field.default !== undefined ? field.default : null;
      continue;
    }
    const value = checkField(field, raw, [...at, name], problems);
    out[name] = value === undefined ? null : value;
  }

  if (problems.length > 0) throw invalid(problems);
  return out;
}

// --- Import ----------------------------------------------------------------

exportRoutes.post("/", async (c) => {
  const tenant = c.get("tenant");

  // The top level goes through the request validator, so a body that is
  // not an object at all fails the same way every other endpoint's does.
  const head = await readBody(c.req.raw.clone(), PROPERTY_IN);
  const body = (await c.req.raw.json()) as Row;

  const version = head.format_version as number;
  if (version > FORMAT_VERSION) {
    throw fail(
      422,
      `Ukjent filformat (versjon ${version}). Oppdater Tavla.`,
    );
  }

  // Everything the file can get wrong, refused here — before a row exists.
  const panels = children(body, "panels", PANEL_IN, ["body"]).map((panel, p) => {
    const at = ["body", "panels", String(p)];
    return {
      ...panel.ok,
      modules: children(panel.raw, "modules", MODULE_IN, at).map((m) => m.ok),
      circuits: children(panel.raw, "circuits", CIRCUIT_IN, at).map((circuit, ci) => {
        const cat = [...at, "circuits", String(ci)];
        return {
          ...circuit.ok,
          connection_points: children(
            circuit.raw, "connection_points", CONNECTION_POINT_IN, cat,
          ).map((cp) => cp.ok),
          equipment: children(circuit.raw, "equipment", EQUIPMENT_IN, cat).map(
            (item, ei) => ({
              ...item.ok,
              channels: children(
                item.raw, "channels", CHANNEL_IN, [...cat, "equipment", String(ei)],
              ).map((ch) => ch.ok),
            }),
          ),
        };
      }),
    };
  });

  // Round 1. Always creates; never merges into an existing property, so
  // importing the same file twice gives two independent properties rather
  // than a conflict.
  const property = await tenant.insert(s.property, {
    name: head.name as string,
    address: head.address as string,
    ownerName: head.owner_name as string | null,
    ownerEmail: head.owner_email as string | null,
    ownerPhone: head.owner_phone as string | null,
  });

  try {
    await build(tenant, property.id, panels);
  } catch (error) {
    // Not a transaction, but it converges: half a documented installation
    // is worse than none, so what did land is removed.
    await rollback(tenant, property.id);
    throw error;
  }

  return c.json(propertyRead(property));
});

/** Rounds 2 to 5. */
async function build(tenant: Tenant, propertyId: number, panels: Row[]): Promise<void> {
  if (panels.length === 0) return;

  // Round 2: every panel, ids back in order.
  const panelRows = await insertMany(
    tenant,
    panels.map((panel) =>
      tenant.op.insert(s.panel, {
        propertyId,
        name: panel.name as string,
        location: panel.location as string,
        rows: panel.rows as number,
        modulesPerRow: panel.modules_per_row as number,
        notes: panel.notes as string | null,
      }),
    ),
  );

  // Round 3: every circuit in the file, across all panels, before anything
  // references one. The map is from the file's ids to the new rows'.
  const circuitPlan: Array<{ panelIndex: number; circuit: Row }> = [];
  panels.forEach((panel, i) => {
    for (const circuit of panel.circuits as Row[]) {
      circuitPlan.push({ panelIndex: i, circuit });
    }
  });

  const circuitRows = await insertMany(
    tenant,
    circuitPlan.map(({ panelIndex, circuit }) =>
      tenant.op.insert(s.circuit, {
        panelId: panelRows[panelIndex].id,
        designation: circuit.designation as string,
        name: circuit.name as string,
        room: circuit.room as string | null,
        cableType: circuit.cable_type as CableType | null,
        crossSection: circuit.cross_section as number | null,
        conductorCount: circuit.conductor_count as number | null,
        lengthM: circuit.length_m as number | null,
        notes: circuit.notes as string | null,
      }),
    ),
  );

  const remapped = new Map<number, number>();
  circuitPlan.forEach(({ circuit }, i) => {
    if (circuit.id !== null) remapped.set(circuit.id as number, circuitRows[i].id);
  });

  /** A circuit reference from the file; dangling ones are dropped. */
  const remap = (old: unknown) =>
    old === null || old === undefined ? null : remapped.get(old as number) ?? null;

  // Round 4: everything that needs a circuit id but gives none back that
  // anything else needs — except equipment, whose ids round 5 uses.
  const equipmentPlan: Array<{ circuitIndex: number; item: Row }> = [];
  circuitPlan.forEach(({ circuit }, i) => {
    for (const item of circuit.equipment as Row[]) {
      equipmentPlan.push({ circuitIndex: i, item });
    }
  });

  const fourth = [
    ...panels.flatMap((panel, i) =>
      (panel.modules as Row[]).map((m) =>
        tenant.op.insert(s.module, {
          panelId: panelRows[i].id,
          row: m.row as number,
          position: m.position as number,
          width: m.width as number,
          type: m.type as string,
          label: m.label as string | null,
          ampere: m.ampere as number | null,
          hasRcd: m.has_rcd as boolean,
          isVacant: m.is_vacant as boolean,
          circuitId: remap(m.circuit_id),
        }),
      ),
    ),
    ...circuitPlan.flatMap(({ circuit }, i) =>
      (circuit.connection_points as Row[]).map((cp) =>
        tenant.op.insert(s.connectionPoint, {
          circuitId: circuitRows[i].id,
          type: cp.type as ConnectionPointType,
          location: cp.location as string,
          notes: cp.notes as string | null,
        }),
      ),
    ),
  ];

  const equipmentOps = equipmentPlan.map(({ circuitIndex, item }) =>
    tenant.op.insert(s.equipment, {
      circuitId: circuitRows[circuitIndex].id,
      type: item.type as EquipmentType,
      brand: item.brand as string | null,
      model: item.model as string | null,
      watt: item.watt as number | null,
      notes: item.notes as string | null,
    }),
  );

  // Equipment last in the batch so its returned ids are the tail — one
  // round rather than two, and still atomic.
  const fourthRows = await insertMany(tenant, [...fourth, ...equipmentOps]);
  const equipmentRows = fourthRows.slice(fourth.length);

  // Round 5: channels, which need the equipment ids.
  await insertMany(
    tenant,
    equipmentPlan.flatMap(({ item }, i) =>
      (item.channels as Row[]).map((ch) =>
        tenant.op.insert(s.channel, {
          equipmentId: equipmentRows[i].id,
          number: ch.number as number,
          label: ch.label as string | null,
          load: ch.load as string | null,
          watt: ch.watt as number | null,
          channelType: ch.channel_type as ChannelType,
          notes: ch.notes as string | null,
          circuitId: remap(ch.circuit_id),
        }),
      ),
    ),
  );
}

/** One atomic batch, with each statement's generated row read back. */
async function insertMany(
  tenant: Tenant,
  ops: ReturnType<Tenant["op"]["insert"]>[],
): Promise<Array<{ id: number }>> {
  if (ops.length === 0) return [];
  const results = (await tenant.atomically(ops)) as Array<Array<{ id: number }>>;
  return results.map((rows) => rows[0]);
}

/**
 * Undo a partial import.
 *
 * Children first, because the foreign keys say so and D1 will not defer
 * them. One batch, so this either happens or it reports that it did not.
 */
export async function rollback(tenant: Tenant, propertyId: number): Promise<void> {
  const panels = await tenant.list(s.panel, eq(s.panel.propertyId, propertyId));
  const panelIds = panels.map((p) => p.id);

  const circuits =
    panelIds.length === 0
      ? []
      : await tenant.list(s.circuit, inArray(s.circuit.panelId, panelIds));
  const circuitIds = circuits.map((circuit) => circuit.id);

  const items =
    circuitIds.length === 0
      ? []
      : await tenant.list(s.equipment, inArray(s.equipment.circuitId, circuitIds));
  const equipmentIds = items.map((item) => item.id);

  const ops = [];
  if (equipmentIds.length > 0) {
    ops.push(tenant.op.removeWhere(s.channel, inArray(s.channel.equipmentId, equipmentIds)));
  }
  if (circuitIds.length > 0) {
    ops.push(
      tenant.op.removeWhere(s.changelog, inArray(s.changelog.circuitId, circuitIds)),
      tenant.op.removeWhere(
        s.connectionPoint,
        inArray(s.connectionPoint.circuitId, circuitIds),
      ),
      tenant.op.removeWhere(s.equipment, inArray(s.equipment.circuitId, circuitIds)),
    );
  }
  if (panelIds.length > 0) {
    ops.push(
      tenant.op.removeWhere(s.module, inArray(s.module.panelId, panelIds)),
      tenant.op.removeWhere(s.circuit, inArray(s.circuit.panelId, panelIds)),
      tenant.op.removeWhere(s.panel, eq(s.panel.propertyId, propertyId)),
    );
  }
  ops.push(tenant.op.remove(s.property, propertyId));

  await tenant.atomically(ops);
}
