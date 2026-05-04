from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional

from database import get_session
from models import ChangeLog
from schemas import ChangeLogCreate, ChangeLogRead, ChangeLogUpdate

router = APIRouter()


@router.get("/", response_model=List[ChangeLogRead])
def list_changelog(
    circuit_id: Optional[int] = None,
    connection_point_id: Optional[int] = None,
    equipment_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    query = select(ChangeLog)
    if circuit_id is not None:
        query = query.where(ChangeLog.circuit_id == circuit_id)
    if connection_point_id is not None:
        query = query.where(ChangeLog.connection_point_id == connection_point_id)
    if equipment_id is not None:
        query = query.where(ChangeLog.equipment_id == equipment_id)
    return session.exec(query).all()


@router.get("/{entry_id}", response_model=ChangeLogRead)
def get_changelog_entry(entry_id: int, session: Session = Depends(get_session)):
    entry = session.get(ChangeLog, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Changelog entry not found")
    return entry


@router.post("/", response_model=ChangeLogRead, status_code=201)
def create_changelog_entry(
    data: ChangeLogCreate, session: Session = Depends(get_session)
):
    entry = ChangeLog(**data.model_dump())
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


@router.put("/{entry_id}", response_model=ChangeLogRead)
def update_changelog_entry(
    entry_id: int, data: ChangeLogUpdate, session: Session = Depends(get_session)
):
    entry = session.get(ChangeLog, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Changelog entry not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(entry, field, value)
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=204)
def delete_changelog_entry(entry_id: int, session: Session = Depends(get_session)):
    entry = session.get(ChangeLog, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Changelog entry not found")
    session.delete(entry)
    session.commit()
