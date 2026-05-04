from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional

from database import get_session
from models import Circuit, Equipment
from schemas import EquipmentCreate, EquipmentRead, EquipmentUpdate

router = APIRouter()


@router.get("/", response_model=List[EquipmentRead])
def list_equipment(
    circuit_id: Optional[int] = None, session: Session = Depends(get_session)
):
    query = select(Equipment)
    if circuit_id is not None:
        query = query.where(Equipment.circuit_id == circuit_id)
    return session.exec(query).all()


@router.get("/{equipment_id}", response_model=EquipmentRead)
def get_equipment(equipment_id: int, session: Session = Depends(get_session)):
    item = session.get(Equipment, equipment_id)
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    return item


@router.post("/", response_model=EquipmentRead, status_code=201)
def create_equipment(data: EquipmentCreate, session: Session = Depends(get_session)):
    if not session.get(Circuit, data.circuit_id):
        raise HTTPException(status_code=404, detail="Circuit not found")
    item = Equipment(**data.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.put("/{equipment_id}", response_model=EquipmentRead)
def update_equipment(
    equipment_id: int, data: EquipmentUpdate, session: Session = Depends(get_session)
):
    item = session.get(Equipment, equipment_id)
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/{equipment_id}", status_code=204)
def delete_equipment(equipment_id: int, session: Session = Depends(get_session)):
    item = session.get(Equipment, equipment_id)
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    session.delete(item)
    session.commit()
