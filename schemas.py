from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

from models import CableType, ConnectionPointType, EquipmentType, ModuleType


# --- Property ---

class PropertyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    address: str
    created_at: datetime


class PropertyCreate(BaseModel):
    name: str
    address: str


class PropertyUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None


# --- Panel ---

class PanelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    property_id: int
    name: str
    location: str
    rows: int
    modules_per_row: int
    notes: Optional[str] = None
    created_at: datetime


class PanelCreate(BaseModel):
    property_id: int
    name: str
    location: str
    rows: int = 1
    modules_per_row: int = 12
    notes: Optional[str] = None


class PanelUpdate(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    rows: Optional[int] = None
    modules_per_row: Optional[int] = None
    notes: Optional[str] = None


# --- Module ---

class ModuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    panel_id: int
    row: int
    position: int
    width: int
    type: ModuleType
    label: Optional[str] = None
    ampere: Optional[int] = None
    has_rcd: bool
    circuit_id: Optional[int] = None


class ModuleCreate(BaseModel):
    panel_id: int
    row: int
    position: int
    width: int = 1
    type: ModuleType
    label: Optional[str] = None
    ampere: Optional[int] = None
    has_rcd: bool = False
    circuit_id: Optional[int] = None


class ModuleUpdate(BaseModel):
    row: Optional[int] = None
    position: Optional[int] = None
    width: Optional[int] = None
    type: Optional[ModuleType] = None
    label: Optional[str] = None
    ampere: Optional[int] = None
    has_rcd: Optional[bool] = None
    circuit_id: Optional[int] = None


# --- Circuit ---

class CircuitRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    panel_id: int
    designation: str
    name: str
    room: Optional[str] = None
    cable_type: Optional[CableType] = None
    cross_section: Optional[float] = None
    conductor_count: Optional[int] = None
    length_m: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime


class CircuitCreate(BaseModel):
    panel_id: int
    designation: str
    name: str
    room: Optional[str] = None
    cable_type: Optional[CableType] = None
    cross_section: Optional[float] = None
    conductor_count: Optional[int] = None
    length_m: Optional[float] = None
    notes: Optional[str] = None


class CircuitUpdate(BaseModel):
    designation: Optional[str] = None
    name: Optional[str] = None
    room: Optional[str] = None
    cable_type: Optional[CableType] = None
    cross_section: Optional[float] = None
    conductor_count: Optional[int] = None
    length_m: Optional[float] = None
    notes: Optional[str] = None


# --- ConnectionPoint ---

class ConnectionPointRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    circuit_id: int
    type: ConnectionPointType
    location: str
    notes: Optional[str] = None
    created_at: datetime


class ConnectionPointCreate(BaseModel):
    circuit_id: int
    type: ConnectionPointType
    location: str
    notes: Optional[str] = None


class ConnectionPointUpdate(BaseModel):
    type: Optional[ConnectionPointType] = None
    location: Optional[str] = None
    notes: Optional[str] = None


# --- Equipment ---

class EquipmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    circuit_id: int
    type: EquipmentType
    brand: Optional[str] = None
    model: Optional[str] = None
    watt: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime


class EquipmentCreate(BaseModel):
    circuit_id: int
    type: EquipmentType
    brand: Optional[str] = None
    model: Optional[str] = None
    watt: Optional[int] = None
    notes: Optional[str] = None


class EquipmentUpdate(BaseModel):
    type: Optional[EquipmentType] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    watt: Optional[int] = None
    notes: Optional[str] = None


# --- File ---

class FileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    connection_point_id: Optional[int] = None
    equipment_id: Optional[int] = None
    filename: str
    mimetype: str
    local_path: str
    r2_key: Optional[str] = None
    uploaded_at: datetime


# --- ChangeLog ---

class ChangeLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    circuit_id: Optional[int] = None
    connection_point_id: Optional[int] = None
    equipment_id: Optional[int] = None
    changed_by: str
    description: str
    changed_at: datetime


class ChangeLogCreate(BaseModel):
    circuit_id: Optional[int] = None
    connection_point_id: Optional[int] = None
    equipment_id: Optional[int] = None
    changed_by: str = "system"
    description: str


class ChangeLogUpdate(BaseModel):
    changed_by: Optional[str] = None
    description: Optional[str] = None
