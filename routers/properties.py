from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List

from database import get_session
from models import Property
from schemas import PropertyCreate, PropertyRead, PropertyUpdate

router = APIRouter()


@router.get("/", response_model=List[PropertyRead])
def list_properties(session: Session = Depends(get_session)):
    return session.exec(select(Property)).all()


@router.get("/{property_id}", response_model=PropertyRead)
def get_property(property_id: int, session: Session = Depends(get_session)):
    prop = session.get(Property, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@router.post("/", response_model=PropertyRead, status_code=201)
def create_property(data: PropertyCreate, session: Session = Depends(get_session)):
    prop = Property(**data.model_dump())
    session.add(prop)
    session.commit()
    session.refresh(prop)
    return prop


@router.put("/{property_id}", response_model=PropertyRead)
def update_property(
    property_id: int, data: PropertyUpdate, session: Session = Depends(get_session)
):
    prop = session.get(Property, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(prop, field, value)
    session.add(prop)
    session.commit()
    session.refresh(prop)
    return prop


@router.delete("/{property_id}", status_code=204)
def delete_property(property_id: int, session: Session = Depends(get_session)):
    prop = session.get(Property, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    session.delete(prop)
    session.commit()
