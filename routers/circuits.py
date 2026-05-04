from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional

from database import get_session
from models import Circuit, Panel
from schemas import CircuitCreate, CircuitRead, CircuitUpdate

router = APIRouter()


@router.get("/", response_model=List[CircuitRead])
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


@router.post("/", response_model=CircuitRead, status_code=201)
def create_circuit(data: CircuitCreate, session: Session = Depends(get_session)):
    if not session.get(Panel, data.panel_id):
        raise HTTPException(status_code=404, detail="Panel not found")
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


@router.delete("/{circuit_id}", status_code=204)
def delete_circuit(circuit_id: int, session: Session = Depends(get_session)):
    circuit = session.get(Circuit, circuit_id)
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")
    session.delete(circuit)
    session.commit()
