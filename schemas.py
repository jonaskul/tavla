from pydantic import BaseModel, ConfigDict, model_validator
from typing import Optional
from datetime import datetime

from models import CableType, ChannelType, ConnectionPointType, EquipmentType


# --- ModuleTypeDefinition ---

class ModuleTypeDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    key: str
    name_no: str
    color: str
    abbreviation: str
    can_have_circuit: bool
    can_have_ampere: bool
    is_builtin: bool
    created_at: datetime


class ModuleTypeDefinitionCreate(BaseModel):
    key: str
    name_no: str
    color: str
    abbreviation: str
    can_have_circuit: bool = False
    can_have_ampere: bool = False


class ModuleTypeDefinitionUpdate(BaseModel):
    name_no: Optional[str] = None
    color: Optional[str] = None
    abbreviation: Optional[str] = None
    can_have_circuit: Optional[bool] = None
    can_have_ampere: Optional[bool] = None


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


class PanelCreateNested(BaseModel):
    """Body schema for POST /api/properties/{id}/panels (property_id from URL)."""
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
    type: str
    label: Optional[str] = None
    ampere: Optional[int] = None
    has_rcd: bool
    circuit_id: Optional[int] = None
    is_vacant: bool = False


class ModuleCreate(BaseModel):
    panel_id: int
    row: int
    position: int
    width: int = 1
    type: str
    label: Optional[str] = None
    ampere: Optional[int] = None
    has_rcd: bool = False
    circuit_id: Optional[int] = None
    is_vacant: bool = False


class ModuleUpdate(BaseModel):
    row: Optional[int] = None
    position: Optional[int] = None
    width: Optional[int] = None
    type: Optional[str] = None
    label: Optional[str] = None
    ampere: Optional[int] = None
    has_rcd: Optional[bool] = None
    circuit_id: Optional[int] = None
    is_vacant: Optional[bool] = None


class ModuleCreateNested(BaseModel):
    """Body schema for POST /api/panels/{id}/modules (panel_id from URL)."""
    row: int
    position: int
    width: int = 1
    type: str
    label: Optional[str] = None
    ampere: Optional[int] = None
    has_rcd: bool = False
    circuit_id: Optional[int] = None
    is_vacant: bool = False


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


class CircuitCreateNested(BaseModel):
    """Body schema for POST /api/panels/{id}/circuits (panel_id from URL)."""
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


class ConnectionPointCreateNested(BaseModel):
    """Body schema for POST /api/circuits/{id}/connection_points (circuit_id from URL)."""
    type: ConnectionPointType
    location: str
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
    channel_count: Optional[int] = None


class EquipmentUpdate(BaseModel):
    type: Optional[EquipmentType] = None
    brand: Optional[str] = None
    model: Optional[str] = None
    watt: Optional[int] = None
    notes: Optional[str] = None


class EquipmentCreateNested(BaseModel):
    """Body schema for POST /api/circuits/{id}/equipment (circuit_id from URL)."""
    type: EquipmentType
    brand: Optional[str] = None
    model: Optional[str] = None
    watt: Optional[int] = None
    notes: Optional[str] = None
    channel_count: Optional[int] = None


# --- Channel ---

class ChannelRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    equipment_id: int
    number: int
    label: Optional[str] = None
    load: Optional[str] = None
    circuit_id: Optional[int] = None
    notes: Optional[str] = None
    channel_type: ChannelType = ChannelType.relay
    watt: Optional[int] = None


class ChannelCreateNested(BaseModel):
    """Body schema for POST /api/equipment/{id}/channels (equipment_id from URL)."""
    number: int
    label: Optional[str] = None
    load: Optional[str] = None
    circuit_id: Optional[int] = None
    notes: Optional[str] = None
    channel_type: ChannelType = ChannelType.relay
    watt: Optional[int] = None


class ChannelUpdate(BaseModel):
    label: Optional[str] = None
    load: Optional[str] = None
    circuit_id: Optional[int] = None
    notes: Optional[str] = None
    channel_type: Optional[ChannelType] = None
    watt: Optional[int] = None


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

    @model_validator(mode="after")
    def require_entity(self) -> "ChangeLogCreate":
        if all(
            v is None
            for v in [self.circuit_id, self.connection_point_id, self.equipment_id]
        ):
            raise ValueError(
                "At least one of circuit_id, connection_point_id, or equipment_id must be set"
            )
        return self
