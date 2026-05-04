from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional

from database import get_session
from models import Circuit, ConnectionPoint
from schemas import ConnectionPointCreate, ConnectionPointRead, ConnectionPointUpdate

router = APIRouter()


@router.get("/", response_model=List[ConnectionPointRead])
def list_connection_points(
    circuit_id: Optional[int] = None, session: Session = Depends(get_session)
):
    query = select(ConnectionPoint)
    if circuit_id is not None:
        query = query.where(ConnectionPoint.circuit_id == circuit_id)
    return session.exec(query).all()


@router.get("/{cp_id}", response_model=ConnectionPointRead)
def get_connection_point(cp_id: int, session: Session = Depends(get_session)):
    cp = session.get(ConnectionPoint, cp_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Connection point not found")
    return cp


@router.post("/", response_model=ConnectionPointRead, status_code=201)
def create_connection_point(
    data: ConnectionPointCreate, session: Session = Depends(get_session)
):
    if not session.get(Circuit, data.circuit_id):
        raise HTTPException(status_code=404, detail="Circuit not found")
    cp = ConnectionPoint(**data.model_dump())
    session.add(cp)
    session.commit()
    session.refresh(cp)
    return cp


@router.put("/{cp_id}", response_model=ConnectionPointRead)
def update_connection_point(
    cp_id: int,
    data: ConnectionPointUpdate,
    session: Session = Depends(get_session),
):
    cp = session.get(ConnectionPoint, cp_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Connection point not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(cp, field, value)
    session.add(cp)
    session.commit()
    session.refresh(cp)
    return cp


@router.delete("/{cp_id}", status_code=204)
def delete_connection_point(cp_id: int, session: Session = Depends(get_session)):
    cp = session.get(ConnectionPoint, cp_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Connection point not found")
    session.delete(cp)
    session.commit()
