/**
 * The schema, ported from models.py.
 *
 * Table and column names are kept identical to the Python side. Nothing
 * outside this file depends on that, but it makes the two implementations
 * comparable while both exist, which is the whole point of doing the
 * rewrite against a contract suite.
 *
 * Two D1 facts shape this file:
 *
 * - SQLite has no boolean and no datetime. Booleans are integers with a
 *   mode, timestamps are integers holding milliseconds. The API still
 *   serialises them as JSON booleans and ISO strings, because the contract
 *   says so.
 * - Primary keys stay autoincrementing integers. The contract asserts ids
 *   are integers and the frontend puts them in URLs (/anlegg/3), so UUIDs
 *   would change the contract. That decides it — and it means the importer
 *   has to read ids back with RETURNING rather than knowing them upfront,
 *   since D1 refuses interactive transactions.
 */

import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** Every row carries the moment it was made. */
const createdAt = integer("created_at", { mode: "timestamp_ms" })
  .notNull()
  .default(sql`(unixepoch() * 1000)`);

// --- Tenancy ---------------------------------------------------------------
//
// Organization is the tenant: the billing entity and the isolation boundary.
// A homeowner documenting their own house is an organization with one
// member, so there is no separate "B2C mode" anywhere in the code.
//
// D1 has no row-level security. On PostgreSQL the database refuses to return
// another tenant's rows even to a query that forgot its filter; here the
// application layer is the only thing standing between tenants. That is why
// the next session builds a query layer where an unscoped read cannot be
// written, rather than one where it is merely discouraged.

export const organization = sqliteTable("organization", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  createdAt,
});

export const appUser = sqliteTable(
  // "user" is reserved in PostgreSQL; the name is kept for parity.
  "app_user",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // The auth provider's id, when there is one. Our own login leaves it
    // empty and `id` is the identity; a provider fills it in and is matched
    // on email. Nullable so neither choice needs a migration.
    externalAuthId: text("external_auth_id"),
    email: text("email").notNull(),
    name: text("name"),
    createdAt,
  },
  (t) => [
    uniqueIndex("ix_app_user_external_auth_id").on(t.externalAuthId),
    uniqueIndex("ix_app_user_email").on(t.email),
  ],
);

export const membership = sqliteTable(
  "membership",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => appUser.id),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organization.id),
    role: text("role", { enum: ["owner", "admin", "member"] })
      .notNull()
      .default("member"),
    createdAt,
  },
  (t) => [
    uniqueIndex("ux_membership_user_org").on(t.userId, t.organizationId),
    index("ix_membership_user_id").on(t.userId),
    index("ix_membership_organization_id").on(t.organizationId),
  ],
);

// --- Authentication --------------------------------------------------------
//
// Neither table is tenant-scoped: they establish who someone is, which
// necessarily happens before an organization is known.

export const loginCode = sqliteTable(
  "logincode",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    // HMAC with a server-side secret, not a bare hash. Six digits is a
    // million possibilities, so a plain SHA-256 would be reversible by
    // brute force the moment the database leaked.
    codeHash: text("code_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp_ms" }),
    // Wrong guesses. A six-digit code needs a ceiling or it is guessable
    // long before it expires.
    attempts: integer("attempts").notNull().default(0),
    requestedIp: text("requested_ip"),
    createdAt,
  },
  (t) => [
    index("ix_logincode_email").on(t.email),
    index("ix_logincode_created_at").on(t.createdAt),
  ],
);

export const userSession = sqliteTable(
  "usersession",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => appUser.id),
    // The token carries 256 bits, so a plain hash is enough here. Hashed so
    // a database dump cannot be replayed as a live session.
    tokenHash: text("token_hash").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    // Rows rather than KV. Sessions live here so signing out takes effect
    // immediately; KV is eventually consistent, which would leave a
    // revoked session usable for a while — exactly the property that made
    // server-side sessions worth the trouble in the first place.
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    userAgent: text("user_agent"),
    createdAt,
  },
  (t) => [
    uniqueIndex("ix_usersession_token_hash").on(t.tokenHash),
    index("ix_usersession_user_id").on(t.userId),
  ],
);

// --- Content ---------------------------------------------------------------
//
// organization_id is denormalised onto every one of these rather than being
// reached through the tree. On PostgreSQL that let one row-level security
// policy be the same line on each table; here it keeps the scoping check
// uniform and cheap for the same reason.

export const property = sqliteTable(
  "property",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organization.id),
    name: text("name").notNull(),
    address: text("address").notNull(),
    // The real-world owner of the installation, who is usually NOT a user.
    // An electrician documents a customer's house: the organization owns
    // the data, this names whose house it is.
    ownerName: text("owner_name"),
    ownerEmail: text("owner_email"),
    ownerPhone: text("owner_phone"),
    createdAt,
  },
  (t) => [index("ix_property_organization_id").on(t.organizationId)],
);

export const panel = sqliteTable(
  "panel",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organization.id),
    propertyId: integer("property_id")
      .notNull()
      .references(() => property.id),
    name: text("name").notNull(),
    location: text("location").notNull(),
    rows: integer("rows").notNull().default(1),
    modulesPerRow: integer("modules_per_row").notNull().default(12),
    notes: text("notes"),
    createdAt,
  },
  (t) => [index("ix_panel_organization_id").on(t.organizationId)],
);

export const moduleTypeDefinition = sqliteTable(
  "moduletypedefinition",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    // Built-in types are shared by every tenant and have no organization.
    // A tenant editing one gets a copy that shadows it by key, so one
    // organization's change cannot reach another's dropdown.
    organizationId: integer("organization_id").references(() => organization.id),
    key: text("key").notNull(),
    nameNo: text("name_no").notNull(),
    color: text("color").notNull(),
    abbreviation: text("abbreviation").notNull(),
    canHaveCircuit: integer("can_have_circuit", { mode: "boolean" })
      .notNull()
      .default(false),
    canHaveAmpere: integer("can_have_ampere", { mode: "boolean" })
      .notNull()
      .default(false),
    isBuiltin: integer("is_builtin", { mode: "boolean" }).notNull().default(false),
    createdAt,
  },
  (t) => [
    // SQL treats NULLs as distinct, so this does not stop duplicate
    // built-ins. The seeding code owns that list and enforces it there.
    uniqueIndex("ux_moduletype_org_key").on(t.organizationId, t.key),
    index("ix_moduletypedefinition_key").on(t.key),
    index("ix_moduletypedefinition_organization_id").on(t.organizationId),
  ],
);

export const circuit = sqliteTable(
  "circuit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organization.id),
    panelId: integer("panel_id")
      .notNull()
      .references(() => panel.id),
    designation: text("designation").notNull(), // B01, L03, K12...
    name: text("name").notNull(),
    room: text("room"),
    cableType: text("cable_type", {
      enum: ["NYM-J", "PFXP", "PFSP", "TFXP", "XPK"],
    }),
    crossSection: real("cross_section"), // mm²
    conductorCount: integer("conductor_count"), // 2, 3, 5
    lengthM: real("length_m"),
    notes: text("notes"),
    createdAt,
  },
  (t) => [index("ix_circuit_organization_id").on(t.organizationId)],
);

export const module = sqliteTable(
  "module",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organization.id),
    panelId: integer("panel_id")
      .notNull()
      .references(() => panel.id),
    row: integer("row").notNull(),
    position: integer("position").notNull(),
    width: integer("width").notNull().default(1),
    type: text("type").notNull(),
    label: text("label"),
    ampere: integer("ampere"),
    hasRcd: integer("has_rcd", { mode: "boolean" }).notNull().default(false),
    // A module points at a circuit without owning it. Deleting the circuit
    // clears this rather than deleting the module, or the panel view keeps
    // drawing a breaker wired to something that is gone.
    circuitId: integer("circuit_id").references(() => circuit.id),
    isVacant: integer("is_vacant", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("ix_module_organization_id").on(t.organizationId)],
);

export const connectionPoint = sqliteTable(
  "connectionpoint",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organization.id),
    circuitId: integer("circuit_id")
      .notNull()
      .references(() => circuit.id),
    type: text("type", {
      enum: ["junction_box", "outlet", "light", "switch", "motor", "other"],
    }).notNull(),
    location: text("location").notNull(),
    notes: text("notes"),
    createdAt,
  },
  (t) => [index("ix_connectionpoint_organization_id").on(t.organizationId)],
);

export const equipment = sqliteTable(
  "equipment",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organization.id),
    circuitId: integer("circuit_id")
      .notNull()
      .references(() => circuit.id),
    type: text("type", {
      enum: [
        "floor_heating",
        "ev_charger",
        "heat_pump",
        "boiler",
        "dynalite",
        "shelly",
        "other",
      ],
    }).notNull(),
    brand: text("brand"),
    model: text("model"),
    watt: integer("watt"),
    notes: text("notes"),
    createdAt,
  },
  (t) => [index("ix_equipment_organization_id").on(t.organizationId)],
);

export const channel = sqliteTable(
  "channel",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organization.id),
    equipmentId: integer("equipment_id")
      .notNull()
      .references(() => equipment.id),
    number: integer("number").notNull(),
    label: text("label"),
    load: text("load"),
    // A channel may serve a circuit other than the one its equipment hangs
    // off, so this is a real reference and not derivable from the nesting.
    circuitId: integer("circuit_id").references(() => circuit.id),
    notes: text("notes"),
    channelType: text("channel_type", { enum: ["relay", "dimmer"] })
      .notNull()
      .default("relay"),
    watt: integer("watt"),
  },
  (t) => [index("ix_channel_organization_id").on(t.organizationId)],
);

export const file = sqliteTable(
  "file",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organization.id),
    connectionPointId: integer("connection_point_id").references(
      () => connectionPoint.id,
    ),
    equipmentId: integer("equipment_id").references(() => equipment.id),
    filename: text("filename").notNull(), // what the uploader called it
    mimetype: text("mimetype").notNull(),
    // Where the bytes are in R2. Never exposed to the client: bytes are
    // fetched through the API, where the tenant check runs.
    storageKey: text("storage_key").notNull(),
    uploadedAt: integer("uploaded_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("ix_file_organization_id").on(t.organizationId)],
);

export const changelog = sqliteTable(
  "changelog",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organization.id),
    circuitId: integer("circuit_id").references(() => circuit.id),
    connectionPointId: integer("connection_point_id").references(
      () => connectionPoint.id,
    ),
    equipmentId: integer("equipment_id").references(() => equipment.id),
    // Free text. This is where a user reference goes once there is a reason
    // to have one; until then it records "system" or a hand-entered name.
    changedBy: text("changed_by").notNull().default("system"),
    description: text("description").notNull(),
    changedAt: integer("changed_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => [index("ix_changelog_organization_id").on(t.organizationId)],
);

/** Tables whose every row belongs to exactly one tenant. */
export const TENANT_TABLES = [
  property,
  panel,
  module,
  circuit,
  connectionPoint,
  equipment,
  file,
  changelog,
  channel,
] as const;
