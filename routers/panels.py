from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional

from database import get_session
from models import Panel, Property
from schemas import PanelCreate, PanelRead, PanelUpdate

router = APIRouter()


@router.get("/", response_model=List[PanelRead])
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


@router.post("/", response_model=PanelRead, status_code=201)
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


@router.delete("/{panel_id}", status_code=204)
def delete_panel(panel_id: int, session: Session = Depends(get_session)):
    panel = session.get(Panel, panel_id)
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")
    session.delete(panel)
    session.commit()
