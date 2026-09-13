from sqlmodel import SQLModel, Field, Relationship, UniqueConstraint
from typing import Optional, List
from datetime import datetime, timezone
from enum import Enum


def utcnow() -> datetime:
    """Timezone-aware UTC timestamp.

    datetime.utcnow() is deprecated and returns a naive value, which
    serializes without a Z and is then read as local time by clients.
    """
    return datetime.now(timezone.utc)


def as_utc(value: datetime) -> datetime:
    """Read a stored timestamp as UTC.

    SQLite has no timezone type, so a value written as aware comes back
    naive, and comparing it to utcnow() raises TypeError rather than
    returning a wrong answer. Every comparison against a stored timestamp
    goes through here so it behaves the same on both databases.
    """
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


# Child rows a parent owns outright — deleting the parent deletes them.
# Independent records (panels, circuits, connection points, equipment, files)
# deliberately have NO cascade: their delete endpoints block with 409 instead,
# so the user removes them explicitly and never loses data by surprise.
CASCADE = {"cascade": "all, delete-orphan"}


# --- Enums ---

class ModuleType(str, Enum):
    breaker = "breaker"
    rcd = "rcd"
    rcd_breaker = "rcd_breaker"
    shelly = "shelly"
    dynalite = "dynalite"
    surge_protection = "surge_protection"
    main_switch = "main_switch"
    other = "other"


class ChannelType(str, Enum):
    relay = "relay"
    dimmer = "dimmer"


class CableType(str, Enum):
    NYM_J = "NYM-J"
    PFXP = "PFXP"
    PFSP = "PFSP"
    TFXP = "TFXP"
    XPK = "XPK"


class ConnectionPointType(str, Enum):
    junction_box = "junction_box"
    outlet = "outlet"
    light = "light"
    switch = "switch"
    motor = "motor"
    other = "other"


class EquipmentType(str, Enum):
    floor_heating = "floor_heating"
    ev_charger = "ev_charger"
    heat_pump = "heat_pump"
    boiler = "boiler"
    dynalite = "dynalite"
    shelly = "shelly"
    other = "other"


class Role(str, Enum):
    owner = "owner"
    admin = "admin"
    member = "member"


# --- Tenancy ---
#
# Organization is the tenant: the billing entity and the isolation boundary.
# A homeowner documenting their own house is an organization with one member,
# so there is no separate "B2C mode" anywhere in the code.
#
# Authentication is deliberately NOT modelled here. A provider owns "who is
# this person" (User.external_auth_id); this schema owns who belongs to which
# organization, because that is what row-level security will key on. Keeping
# membership local means tenant isolation never depends on staying in sync
# with a third party.

class Organization(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    created_at: datetime = Field(default_factory=utcnow)

    memberships: List["Membership"] = Relationship(
        back_populates="organization", sa_relationship_kwargs=CASCADE
    )


class User(SQLModel, table=True):
    __tablename__ = "app_user"  # "user" is reserved in PostgreSQL

    id: Optional[int] = Field(default=None, primary_key=True)
    # The auth provider's id. Passwordless, so no hash and no reset tokens
    # live here. Method-agnostic: magic link today, passkeys later, no
    # schema change either way. Our own `id` stays the foreign key everyone
    # else points at, so swapping provider touches one column.
    external_auth_id: Optional[str] = Field(default=None, unique=True, index=True)
    email: str = Field(unique=True, index=True)
    name: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)

    memberships: List["Membership"] = Relationship(
        back_populates="user", sa_relationship_kwargs=CASCADE
    )


class Membership(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("user_id", "organization_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="app_user.id", index=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    role: Role = Field(default=Role.member)
    created_at: datetime = Field(default_factory=utcnow)

    user: Optional[User] = Relationship(back_populates="memberships")
    organization: Optional[Organization] = Relationship(back_populates="memberships")


# --- Property ---

class Property(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    name: str
    address: str
    # The real-world owner of the installation, who is usually NOT a user.
    # An electrician documents a customer's house: the organization owns the
    # data, this names whose house it is. Keeping the two apart is what lets
    # a homeowner later be granted access to their own property.
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    owner_phone: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)

    panels: List["Panel"] = Relationship(back_populates="property")


# --- Panel ---

class Panel(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    property_id: int = Field(foreign_key="property.id")
    name: str
    location: str
    rows: int = Field(default=1, ge=1)
    modules_per_row: int = Field(default=12, ge=1)
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)

    property: Optional[Property] = Relationship(back_populates="panels")
    modules: List["Module"] = Relationship(back_populates="panel", sa_relationship_kwargs=CASCADE)
    circuits: List["Circuit"] = Relationship(back_populates="panel")


# --- ModuleTypeDefinition ---

class ModuleTypeDefinition(SQLModel, table=True):
    __tablename__ = "moduletypedefinition"
    # Custom types are per-organization. Built-in types have
    # organization_id = NULL and are shared by everyone.
    #
    # Note: SQL treats NULLs as distinct, so this constraint does not stop
    # duplicate built-ins. seed_builtin_types owns that list, so uniqueness
    # there is enforced by the seeding code rather than the database.
    __table_args__ = (UniqueConstraint("organization_id", "key"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: Optional[int] = Field(
        default=None, foreign_key="organization.id", index=True
    )
    key: str = Field(index=True)
    name_no: str
    color: str
    abbreviation: str
    can_have_circuit: bool = Field(default=False)
    can_have_ampere: bool = Field(default=False)
    is_builtin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utcnow)


# --- Module ---

class Module(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    panel_id: int = Field(foreign_key="panel.id")
    row: int = Field(ge=0)
    position: int = Field(ge=0)
    width: int = Field(default=1, ge=1)
    type: str
    label: Optional[str] = None
    ampere: Optional[int] = None
    has_rcd: bool = Field(default=False)
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuit.id")
    is_vacant: bool = Field(default=False)

    panel: Optional[Panel] = Relationship(back_populates="modules")


# --- Circuit ---

class Circuit(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    panel_id: int = Field(foreign_key="panel.id")
    designation: str                # B01, L03, K12...
    name: str                       # Lys stue/gang
    room: Optional[str] = None
    cable_type: Optional[CableType] = None
    cross_section: Optional[float] = None   # mm²
    conductor_count: Optional[int] = None   # 2, 3, 5
    length_m: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)

    panel: Optional[Panel] = Relationship(back_populates="circuits")
    connection_points: List["ConnectionPoint"] = Relationship(back_populates="circuit")
    equipment_items: List["Equipment"] = Relationship(back_populates="circuit")
    changelog: List["ChangeLog"] = Relationship(back_populates="circuit", sa_relationship_kwargs=CASCADE)
    channels: List["Channel"] = Relationship(back_populates="circuit")


# --- ConnectionPoint ---

class ConnectionPoint(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    circuit_id: int = Field(foreign_key="circuit.id")
    type: ConnectionPointType
    location: str
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)

    circuit: Optional[Circuit] = Relationship(back_populates="connection_points")
    files: List["File"] = Relationship(back_populates="connection_point")
    changelog: List["ChangeLog"] = Relationship(back_populates="connection_point", sa_relationship_kwargs=CASCADE)


# --- Equipment ---

class Equipment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    circuit_id: int = Field(foreign_key="circuit.id")
    type: EquipmentType
    brand: Optional[str] = None
    model: Optional[str] = None
    watt: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)

    circuit: Optional[Circuit] = Relationship(back_populates="equipment_items")
    files: List["File"] = Relationship(back_populates="equipment")
    changelog: List["ChangeLog"] = Relationship(back_populates="equipment", sa_relationship_kwargs=CASCADE)
    channels: List["Channel"] = Relationship(back_populates="equipment", sa_relationship_kwargs=CASCADE)


# --- File ---

class File(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    connection_point_id: Optional[int] = Field(default=None, foreign_key="connectionpoint.id")
    equipment_id: Optional[int] = Field(default=None, foreign_key="equipment.id")
    filename: str
    mimetype: str
    local_path: str
    r2_key: Optional[str] = None    # set after R2 sync
    uploaded_at: datetime = Field(default_factory=utcnow)

    connection_point: Optional[ConnectionPoint] = Relationship(back_populates="files")
    equipment: Optional[Equipment] = Relationship(back_populates="files")


# --- ChangeLog ---

class ChangeLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuit.id")
    connection_point_id: Optional[int] = Field(default=None, foreign_key="connectionpoint.id")
    equipment_id: Optional[int] = Field(default=None, foreign_key="equipment.id")
    # Free text today. This is the seam where a User foreign key goes once
    # auth lands; until then it records "system" or a hand-entered name.
    changed_by: str = Field(default="system")
    description: str
    changed_at: datetime = Field(default_factory=utcnow)

    circuit: Optional[Circuit] = Relationship(back_populates="changelog")
    connection_point: Optional[ConnectionPoint] = Relationship(back_populates="changelog")
    equipment: Optional[Equipment] = Relationship(back_populates="changelog")


# --- Channel ---

class Channel(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    equipment_id: int = Field(foreign_key="equipment.id")
    number: int = Field(ge=1)
    label: Optional[str] = None
    load: Optional[str] = None
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuit.id")
    notes: Optional[str] = None
    channel_type: ChannelType = Field(default=ChannelType.relay)
    watt: Optional[int] = None

    equipment: Optional[Equipment] = Relationship(back_populates="channels")
    circuit: Optional[Circuit] = Relationship(back_populates="channels")


# Every table carrying a tenant. Denormalised deliberately: a row-level
# security policy can then be the same one-liner on each table, instead of
# joining up the tree to find the owning property.
TENANT_MODELS = (
    Property, Panel, Module, Circuit, ConnectionPoint,
    Equipment, File, ChangeLog, Channel,
)


# --- Authentication ---
#
# Passwordless one-time codes. No password hashes, no reset tokens.
#
# Neither table is tenant-scoped: they exist to establish who someone is,
# which necessarily happens before an organization is known. They carry no
# customer content — only an email address and opaque token hashes.

class LoginCode(SQLModel, table=True):
    __tablename__ = "logincode"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True)
    # HMAC with a server-side secret, not a bare hash. Six digits is a
    # million possibilities, so a plain SHA-256 of it would be reversible
    # by brute force the moment the database leaked. The secret is not in
    # the database, so a dump alone is not enough.
    code_hash: str
    expires_at: datetime
    used_at: Optional[datetime] = None
    # Wrong guesses. A six-digit code needs a ceiling or it is guessable
    # long before it expires.
    attempts: int = Field(default=0)
    requested_ip: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow, index=True)


class UserSession(SQLModel, table=True):
    __tablename__ = "usersession"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="app_user.id", index=True)
    # The token is high-entropy, so a plain hash is enough here — unlike the
    # six-digit code above. Hashed so a database dump cannot be replayed as
    # a live session.
    token_hash: str = Field(unique=True, index=True)
    expires_at: datetime
    # Server-side sessions rather than a JWT, so signing out takes effect
    # immediately. A JWT stays valid until it expires, which is the wrong
    # answer when someone reports a lost phone.
    revoked_at: Optional[datetime] = None
    last_seen_at: datetime = Field(default_factory=utcnow)
    user_agent: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)
