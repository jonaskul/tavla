/**
 * What goes in and what comes out, ported from schemas.py.
 *
 * Kept beside the routes rather than inside them so the two halves stay
 * visibly paired: the shape a create accepts and the shape a read returns
 * are the contract, and a field added to one and forgotten in the other is
 * the mistake this file exists to make obvious.
 *
 * That has already happened once on the Python side. Property grew
 * owner_name, owner_email and owner_phone when tenancy landed, and the
 * schemas did not, so the fields were unreachable through the API until
 * the contract suite noticed.
 */

import type * as s from "./schema";
import type { Field, Shape } from "./validate";

/** Cable types, as models.CableType lists them. */
export const CABLE_TYPES = ["NYM-J", "PFXP", "PFSP", "TFXP", "XPK"] as const;
export type CableType = (typeof CABLE_TYPES)[number];

const optionalText: Field = { kind: "string" };

/**
 * Timestamps as ISO 8601 with a Z.
 *
 * SQLite has no datetime; the column holds milliseconds and Drizzle hands
 * back a Date. The contract says ISO string, and the frontend parses it
 * with `new Date(...)`, which takes this form.
 */
function iso(value: Date): string {
  return value.toISOString();
}

// --- Property --------------------------------------------------------------

export const PROPERTY_CREATE: Shape = {
  name: { kind: "string", required: true },
  address: { kind: "string", required: true },
  owner_name: optionalText,
  owner_email: optionalText,
  owner_phone: optionalText,
};

export const PROPERTY_UPDATE: Shape = {
  name: { kind: "string" },
  address: { kind: "string" },
  owner_name: optionalText,
  owner_email: optionalText,
  owner_phone: optionalText,
};

export function propertyRead(row: typeof s.property.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    owner_name: row.ownerName,
    owner_email: row.ownerEmail,
    owner_phone: row.ownerPhone,
    created_at: iso(row.createdAt),
  };
}

// --- Panel -----------------------------------------------------------------

const PANEL_BODY: Shape = {
  name: { kind: "string", required: true },
  location: { kind: "string", required: true },
  rows: { kind: "int", default: 1, min: 1 },
  modules_per_row: { kind: "int", default: 12, min: 1 },
  notes: optionalText,
};

/** The flat route takes the property in the body; the nested one in the URL. */
export const PANEL_CREATE: Shape = {
  property_id: { kind: "int", required: true },
  ...PANEL_BODY,
};

export const PANEL_CREATE_NESTED: Shape = PANEL_BODY;

export const PANEL_UPDATE: Shape = {
  name: { kind: "string" },
  location: { kind: "string" },
  rows: { kind: "int", min: 1 },
  modules_per_row: { kind: "int", min: 1 },
  notes: optionalText,
};

export function panelRead(row: typeof s.panel.$inferSelect) {
  return {
    id: row.id,
    property_id: row.propertyId,
    name: row.name,
    location: row.location,
    rows: row.rows,
    modules_per_row: row.modulesPerRow,
    notes: row.notes,
    created_at: iso(row.createdAt),
  };
}

// --- Module ----------------------------------------------------------------

const MODULE_BODY: Shape = {
  row: { kind: "int", required: true, min: 0 },
  position: { kind: "int", required: true, min: 0 },
  width: { kind: "int", default: 1, min: 1 },
  type: { kind: "string", required: true },
  label: optionalText,
  ampere: { kind: "int" },
  has_rcd: { kind: "boolean", default: false },
  circuit_id: { kind: "int" },
  is_vacant: { kind: "boolean", default: false },
};

export const MODULE_CREATE_NESTED: Shape = MODULE_BODY;

export const MODULE_UPDATE: Shape = {
  row: { kind: "int", min: 0 },
  position: { kind: "int", min: 0 },
  width: { kind: "int", min: 1 },
  type: { kind: "string" },
  label: optionalText,
  ampere: { kind: "int" },
  has_rcd: { kind: "boolean" },
  circuit_id: { kind: "int" },
  is_vacant: { kind: "boolean" },
};

/** No created_at here, and there is none on the Python side either. */
export function moduleRead(row: typeof s.module.$inferSelect) {
  return {
    id: row.id,
    panel_id: row.panelId,
    row: row.row,
    position: row.position,
    width: row.width,
    type: row.type,
    label: row.label,
    ampere: row.ampere,
    has_rcd: row.hasRcd,
    circuit_id: row.circuitId,
    is_vacant: row.isVacant,
  };
}

// --- Circuit ---------------------------------------------------------------

const CIRCUIT_BODY: Shape = {
  designation: { kind: "string", required: true },
  name: { kind: "string", required: true },
  room: optionalText,
  cable_type: { kind: "string", values: CABLE_TYPES },
  cross_section: { kind: "number" },
  conductor_count: { kind: "int" },
  length_m: { kind: "number" },
  notes: optionalText,
};

export const CIRCUIT_CREATE: Shape = {
  panel_id: { kind: "int", required: true },
  ...CIRCUIT_BODY,
};

export const CIRCUIT_CREATE_NESTED: Shape = CIRCUIT_BODY;

export const CIRCUIT_UPDATE: Shape = {
  designation: { kind: "string" },
  name: { kind: "string" },
  room: optionalText,
  cable_type: { kind: "string", values: CABLE_TYPES },
  cross_section: { kind: "number" },
  conductor_count: { kind: "int" },
  length_m: { kind: "number" },
  notes: optionalText,
};

export function circuitRead(row: typeof s.circuit.$inferSelect) {
  return {
    id: row.id,
    panel_id: row.panelId,
    designation: row.designation,
    name: row.name,
    room: row.room,
    cable_type: row.cableType,
    cross_section: row.crossSection,
    conductor_count: row.conductorCount,
    length_m: row.lengthM,
    notes: row.notes,
    created_at: iso(row.createdAt),
  };
}

// --- ConnectionPoint -------------------------------------------------------

export const CONNECTION_POINT_TYPES = [
  "junction_box", "outlet", "light", "switch", "motor", "other",
] as const;
export type ConnectionPointType = (typeof CONNECTION_POINT_TYPES)[number];

/** What the log calls each kind, in Norwegian. */
export const CONNECTION_POINT_LABELS: Record<string, string> = {
  junction_box: "Koblingsboks",
  outlet: "Stikkontakt",
  light: "Lampe/armatur",
  switch: "Bryter",
  motor: "Motor",
  other: "Annet",
};

const CONNECTION_POINT_BODY: Shape = {
  type: { kind: "string", required: true, values: CONNECTION_POINT_TYPES },
  location: { kind: "string", required: true },
  notes: optionalText,
};

export const CONNECTION_POINT_CREATE: Shape = {
  circuit_id: { kind: "int", required: true },
  ...CONNECTION_POINT_BODY,
};

export const CONNECTION_POINT_CREATE_NESTED: Shape = CONNECTION_POINT_BODY;

export const CONNECTION_POINT_UPDATE: Shape = {
  type: { kind: "string", values: CONNECTION_POINT_TYPES },
  location: { kind: "string" },
  notes: optionalText,
};

export function connectionPointRead(row: typeof s.connectionPoint.$inferSelect) {
  return {
    id: row.id,
    circuit_id: row.circuitId,
    type: row.type,
    location: row.location,
    notes: row.notes,
    created_at: iso(row.createdAt),
  };
}

// --- Equipment -------------------------------------------------------------

export const EQUIPMENT_TYPES = [
  "floor_heating", "ev_charger", "heat_pump", "boiler", "dynalite", "shelly", "other",
] as const;
export type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

export const EQUIPMENT_LABELS: Record<string, string> = {
  floor_heating: "Varmekabler",
  ev_charger: "Elbillader",
  heat_pump: "Varmepumpe",
  boiler: "Varmtvannsbereder",
  dynalite: "Dynalite",
  shelly: "Shelly",
  other: "Annet",
};

const EQUIPMENT_BODY: Shape = {
  type: { kind: "string", required: true, values: EQUIPMENT_TYPES },
  brand: optionalText,
  model: optionalText,
  watt: { kind: "int" },
  notes: optionalText,
  // Not a column: a convenience that makes N channels along with the
  // equipment, because a four-channel dimmer is four rows nobody wants to
  // add one at a time.
  channel_count: { kind: "int" },
};

export const EQUIPMENT_CREATE: Shape = {
  circuit_id: { kind: "int", required: true },
  ...EQUIPMENT_BODY,
};

export const EQUIPMENT_CREATE_NESTED: Shape = EQUIPMENT_BODY;

export const EQUIPMENT_UPDATE: Shape = {
  type: { kind: "string", values: EQUIPMENT_TYPES },
  brand: optionalText,
  model: optionalText,
  watt: { kind: "int" },
  notes: optionalText,
};

export function equipmentRead(row: typeof s.equipment.$inferSelect) {
  return {
    id: row.id,
    circuit_id: row.circuitId,
    type: row.type,
    brand: row.brand,
    model: row.model,
    watt: row.watt,
    notes: row.notes,
    created_at: iso(row.createdAt),
  };
}

// --- Channel ---------------------------------------------------------------

export const CHANNEL_TYPES = ["relay", "dimmer"] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const CHANNEL_CREATE_NESTED: Shape = {
  number: { kind: "int", required: true },
  label: optionalText,
  load: optionalText,
  circuit_id: { kind: "int" },
  notes: optionalText,
  channel_type: { kind: "string", default: "relay", values: CHANNEL_TYPES },
  watt: { kind: "int" },
};

export const CHANNEL_UPDATE: Shape = {
  label: optionalText,
  load: optionalText,
  circuit_id: { kind: "int" },
  notes: optionalText,
  channel_type: { kind: "string", values: CHANNEL_TYPES },
  watt: { kind: "int" },
};

/** No created_at on a channel, here or on the Python side. */
export function channelRead(row: typeof s.channel.$inferSelect) {
  return {
    id: row.id,
    equipment_id: row.equipmentId,
    number: row.number,
    label: row.label,
    load: row.load,
    circuit_id: row.circuitId,
    notes: row.notes,
    channel_type: row.channelType,
    watt: row.watt,
  };
}

// --- ChangeLog -------------------------------------------------------------

export const CHANGELOG_CREATE: Shape = {
  circuit_id: { kind: "int" },
  connection_point_id: { kind: "int" },
  equipment_id: { kind: "int" },
  changed_by: { kind: "string", default: "system" },
  description: { kind: "string", required: true },
};

export function changelogRead(row: typeof s.changelog.$inferSelect) {
  return {
    id: row.id,
    circuit_id: row.circuitId,
    connection_point_id: row.connectionPointId,
    equipment_id: row.equipmentId,
    changed_by: row.changedBy,
    description: row.description,
    changed_at: iso(row.changedAt),
  };
}

// --- ModuleTypeDefinition --------------------------------------------------

export const MODULE_TYPE_CREATE: Shape = {
  key: { kind: "string", required: true },
  name_no: { kind: "string", required: true },
  color: { kind: "string", required: true },
  // Three characters, because it is drawn inside a module on the rail and
  // there is no room for a fourth.
  abbreviation: { kind: "string", required: true, maxLength: 3 },
  can_have_circuit: { kind: "boolean", default: false },
  can_have_ampere: { kind: "boolean", default: false },
};

export const MODULE_TYPE_UPDATE: Shape = {
  name_no: { kind: "string" },
  color: { kind: "string" },
  abbreviation: { kind: "string", maxLength: 3 },
  can_have_circuit: { kind: "boolean" },
  can_have_ampere: { kind: "boolean" },
};

export function moduleTypeRead(
  row: typeof s.moduleTypeDefinition.$inferSelect,
  usageCount: number,
) {
  return {
    id: row.id,
    key: row.key,
    name_no: row.nameNo,
    color: row.color,
    abbreviation: row.abbreviation,
    can_have_circuit: row.canHaveCircuit,
    can_have_ampere: row.canHaveAmpere,
    is_builtin: row.isBuiltin,
    created_at: iso(row.createdAt),
    usage_count: usageCount,
  };
}
