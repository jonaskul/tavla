from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional

from database import get_session
from models import Circuit, Panel, Property
from schemas import (
    CircuitCreateNested,
    CircuitRead,
    PanelCreate,
    PanelRead,
    PanelUpdate,
)

router = APIRouter()


@router.get("", response_model=List[PanelRead])
def list_panels(
    property_id: Optional[int] = None, session: Session = Depends(get_session)
):
    query = select(Panel)
    if property_id is not None:
        query = query.where(Panel.property_id == property_id)
    return session.exec(query).all()


@router.get("/{panel_id}", response_model=PanelRead)
def get_panel(panel_id: int, session: Session = Depends(get_session)):
    panel = session.get(Panel, panel_id)
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")
    return panel


@router.post("", response_model=PanelRead)
def create_panel(data: PanelCreate, session: Session = Depends(get_session)):
    if not session.get(Property, data.property_id):
        raise HTTPException(status_code=404, detail="Property not found")
    panel = Panel(**data.model_dump())
    session.add(panel)
    session.commit()
    session.refresh(panel)
    return panel


@router.put("/{panel_id}", response_model=PanelRead)
def update_panel(
    panel_id: int, data: PanelUpdate, session: Session = Depends(get_session)
):
    panel = session.get(Panel, panel_id)
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(panel, field, value)
    session.add(panel)
    session.commit()
    session.refresh(panel)
    return panel


@router.delete("/{panel_id}", response_model=PanelRead)
def delete_panel(panel_id: int, session: Session = Depends(get_session)):
    panel = session.get(Panel, panel_id)
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")
    existing_circuit = session.exec(
        select(Circuit).where(Circuit.panel_id == panel_id)
    ).first()
    if existing_circuit:
        raise HTTPException(
            status_code=409, detail="Cannot delete panel that has circuits"
        )
    panel_data = PanelRead.model_validate(panel)
    session.delete(panel)
    session.commit()
    return panel_data


# --- Nested circuit routes ---

@router.get("/{panel_id}/circuits", response_model=List[CircuitRead])
def list_circuits_for_panel(panel_id: int, session: Session = Depends(get_session)):
    if not session.get(Panel, panel_id):
        raise HTTPException(status_code=404, detail="Panel not found")
    return session.exec(select(Circuit).where(Circuit.panel_id == panel_id)).all()


@router.post("/{panel_id}/circuits", response_model=CircuitRead)
def create_circuit_for_panel(
    panel_id: int,
    data: CircuitCreateNested,
    session: Session = Depends(get_session),
):
    if not session.get(Panel, panel_id):
        raise HTTPException(status_code=404, detail="Panel not found")
    duplicate = session.exec(
        select(Circuit).where(
            Circuit.panel_id == panel_id,
            Circuit.designation == data.designation,
        )
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=400,
            detail="Circuit designation already used in this panel",
        )
    circuit = Circuit(panel_id=panel_id, **data.model_dump())
    session.add(circuit)
    session.commit()
    session.refresh(circuit)
    return circuit
