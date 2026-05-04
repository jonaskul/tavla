from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import desc
from sqlmodel import Session, select
from typing import List, Optional

from database import get_session
from models import ChangeLog, Circuit, ConnectionPoint, File, Panel
from schemas import (
    ChangeLogRead,
    CircuitCreate,
    CircuitRead,
    CircuitUpdate,
    ConnectionPointCreateNested,
    ConnectionPointRead,
)

router = APIRouter()

CP_TYPE_LABELS = {
    "junction_box": "Koblingsboks",
    "outlet": "Stikkontakt",
    "light": "Lampe/armatur",
    "switch": "Bryter",
    "motor": "Motor",
    "other": "Annet",
}


@router.get("", response_model=List[CircuitRead])
def list_circuits(
    panel_id: Optional[int] = None, session: Session = Depends(get_session)
):
    query = select(Circuit)
    if panel_id is not None:
        query = query.where(Circuit.panel_id == panel_id)
    return session.exec(query).all()


@router.get("/{circuit_id}", response_model=CircuitRead)
def get_circuit(circuit_id: int, session: Session = Depends(get_session)):
    circuit = session.get(Circuit, circuit_id)
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")
    return circuit


@router.post("", response_model=CircuitRead)
def create_circuit(data: CircuitCreate, session: Session = Depends(get_session)):
    if not session.get(Panel, data.panel_id):
        raise HTTPException(status_code=404, detail="Panel not found")
    duplicate = session.exec(
        select(Circuit).where(
            Circuit.panel_id == data.panel_id,
            Circuit.designation == data.designation,
        )
    ).first()
    if duplicate:
        raise HTTPException(
            status_code=400,
            detail="Circuit designation already used in this panel",
        )
    circuit = Circuit(**data.model_dump())
    session.add(circuit)
    session.commit()
    session.refresh(circuit)
    return circuit


@router.put("/{circuit_id}", response_model=CircuitRead)
def update_circuit(
    circuit_id: int, data: CircuitUpdate, session: Session = Depends(get_session)
):
    circuit = session.get(Circuit, circuit_id)
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(circuit, field, value)
    session.add(circuit)
    session.commit()
    session.refresh(circuit)
    return circuit


@router.delete("/{circuit_id}", response_model=CircuitRead)
def delete_circuit(circuit_id: int, session: Session = Depends(get_session)):
    circuit = session.get(Circuit, circuit_id)
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")
    existing_cp = session.exec(
        select(ConnectionPoint).where(ConnectionPoint.circuit_id == circuit_id)
    ).first()
    if existing_cp:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete circuit that has connection points",
        )
    circuit_data = CircuitRead.model_validate(circuit)
    session.delete(circuit)
    session.commit()
    return circuit_data


# --- Nested: connection points under circuit ---

@router.get("/{circuit_id}/connection_points", response_model=List[ConnectionPointRead])
def list_connection_points_for_circuit(
    circuit_id: int, session: Session = Depends(get_session)
):
    if not session.get(Circuit, circuit_id):
        raise HTTPException(status_code=404, detail="Circuit not found")
    return session.exec(
        select(ConnectionPoint).where(ConnectionPoint.circuit_id == circuit_id)
    ).all()


@router.post("/{circuit_id}/connection_points", response_model=ConnectionPointRead)
def create_connection_point_for_circuit(
    circuit_id: int,
    data: ConnectionPointCreateNested,
    session: Session = Depends(get_session),
):
    circuit = session.get(Circuit, circuit_id)
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")
    cp = ConnectionPoint(circuit_id=circuit_id, **data.model_dump())
    session.add(cp)
    session.commit()
    session.refresh(cp)

    type_label = CP_TYPE_LABELS.get(cp.type.value if hasattr(cp.type, "value") else cp.type, cp.type)
    entry = ChangeLog(
        circuit_id=circuit_id,
        changed_by="system",
        description=f"Koblingspunkt opprettet: {type_label} – {cp.location}",
    )
    session.add(entry)
    session.commit()

    return cp


# --- Nested: changelog under circuit ---

@router.get("/{circuit_id}/changelog", response_model=List[ChangeLogRead])
def list_changelog_for_circuit(
    circuit_id: int, session: Session = Depends(get_session)
):
    if not session.get(Circuit, circuit_id):
        raise HTTPException(status_code=404, detail="Circuit not found")
    return session.exec(
        select(ChangeLog)
        .where(ChangeLog.circuit_id == circuit_id)
        .order_by(desc(ChangeLog.changed_at))
    ).all()
