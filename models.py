from sqlmodel import SQLModel, Field, Relationship
from typing import Optional, List
from datetime import datetime
from enum import Enum


# --- Enums ---

class ModuleType(str, Enum):
    breaker = "breaker"
    rcd = "rcd"
    rcd_breaker = "rcd_breaker"
    shelly = "shelly"
    dynalite = "dynalite"
    surge_protection = "surge_protection"
    other = "other"


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
    other = "other"


# --- Property ---

class Property(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    address: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

    panels: List["Panel"] = Relationship(back_populates="property")


# --- Panel ---

class Panel(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    property_id: int = Field(foreign_key="property.id")
    name: str
    location: str
    rows: int = Field(default=1)
    modules_per_row: int = Field(default=12)
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    property: Optional[Property] = Relationship(back_populates="panels")
    modules: List["Module"] = Relationship(back_populates="panel")
    circuits: List["Circuit"] = Relationship(back_populates="panel")


# --- Module ---

class Module(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    panel_id: int = Field(foreign_key="panel.id")
    row: int                        # 0-indexed row on panel
    position: int                   # 0-indexed start position on row
    width: int = Field(default=1)   # width in module units
    type: ModuleType
    label: Optional[str] = None
    ampere: Optional[int] = None
    has_rcd: bool = Field(default=False)
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuit.id")

    panel: Optional[Panel] = Relationship(back_populates="modules")


# --- Circuit ---

class Circuit(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    panel_id: int = Field(foreign_key="panel.id")
    designation: str                # B01, L03, K12...
    name: str                       # Lys stue/gang
    room: Optional[str] = None
    cable_type: Optional[CableType] = None
    cross_section: Optional[float] = None   # mm²
    conductor_count: Optional[int] = None   # 2, 3, 5
    length_m: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    panel: Optional[Panel] = Relationship(back_populates="circuits")
    connection_points: List["ConnectionPoint"] = Relationship(back_populates="circuit")
    equipment_items: List["Equipment"] = Relationship(back_populates="circuit")
    changelog: List["ChangeLog"] = Relationship(back_populates="circuit")


# --- ConnectionPoint ---

class ConnectionPoint(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    circuit_id: int = Field(foreign_key="circuit.id")
    type: ConnectionPointType
    location: str
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    circuit: Optional[Circuit] = Relationship(back_populates="connection_points")
    files: List["File"] = Relationship(back_populates="connection_point")
    changelog: List["ChangeLog"] = Relationship(back_populates="connection_point")


# --- Equipment ---

class Equipment(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    circuit_id: int = Field(foreign_key="circuit.id")
    type: EquipmentType
    brand: Optional[str] = None
    model: Optional[str] = None
    watt: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

    circuit: Optional[Circuit] = Relationship(back_populates="equipment_items")
    files: List["File"] = Relationship(back_populates="equipment")
    changelog: List["ChangeLog"] = Relationship(back_populates="equipment")


# --- File ---

class File(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    connection_point_id: Optional[int] = Field(default=None, foreign_key="connectionpoint.id")
    equipment_id: Optional[int] = Field(default=None, foreign_key="equipment.id")
    filename: str
    mimetype: str
    local_path: str
    r2_key: Optional[str] = None    # set after R2 sync
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)

    connection_point: Optional[ConnectionPoint] = Relationship(back_populates="files")
    equipment: Optional[Equipment] = Relationship(back_populates="files")


# --- ChangeLog ---

class ChangeLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuit.id")
    connection_point_id: Optional[int] = Field(default=None, foreign_key="connectionpoint.id")
    equipment_id: Optional[int] = Field(default=None, foreign_key="equipment.id")
    changed_by: str = Field(default="system")
    description: str
    changed_at: datetime = Field(default_factory=datetime.utcnow)

    circuit: Optional[Circuit] = Relationship(back_populates="changelog")
    connection_point: Optional[ConnectionPoint] = Relationship(back_populates="changelog")
    equipment: Optional[Equipment] = Relationship(back_populates="changelog")
