from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List

from database import get_session
from models import Panel, Property
from schemas import (
    PanelCreateNested,
    PanelRead,
    PropertyCreate,
    PropertyRead,
    PropertyUpdate,
)
from tenancy import CurrentOrg

router = APIRouter()


def _get_owned(property_id: int, session: Session, org_id: int) -> Property:
    """Fetch a property, treating another tenant's as non-existent.

    404 rather than 403 on purpose: a tenant should not be able to learn
    that an id exists at all.
    """
    prop = session.get(Property, property_id)
    if not prop or prop.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@router.get("", response_model=List[PropertyRead])
def list_properties(org: CurrentOrg, session: Session = Depends(get_session)):
    return session.exec(
        select(Property).where(Property.organization_id == org)
    ).all()


@router.get("/{property_id}", response_model=PropertyRead)
def get_property(property_id: int, org: CurrentOrg, session: Session = Depends(get_session)):
    return _get_owned(property_id, session, org)


@router.post("", response_model=PropertyRead)
def create_property(data: PropertyCreate, session: Session = Depends(get_session)):
    prop = Property(**data.model_dump())
    session.add(prop)
    session.commit()
    session.refresh(prop)
    return prop


@router.put("/{property_id}", response_model=PropertyRead)
def update_property(
    property_id: int,
    data: PropertyUpdate,
    org: CurrentOrg,
    session: Session = Depends(get_session),
):
    prop = _get_owned(property_id, session, org)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(prop, field, value)
    session.add(prop)
    session.commit()
    session.refresh(prop)
    return prop


@router.delete("/{property_id}", response_model=PropertyRead)
def delete_property(property_id: int, org: CurrentOrg, session: Session = Depends(get_session)):
    prop = _get_owned(property_id, session, org)
    existing_panel = session.exec(
        select(Panel).where(Panel.property_id == property_id)
    ).first()
    if existing_panel:
        raise HTTPException(
            status_code=409, detail="Cannot delete property that has panels"
        )
    prop_data = PropertyRead.model_validate(prop)
    session.delete(prop)
    session.commit()
    return prop_data


# --- Nested panel routes ---

@router.get("/{property_id}/panels", response_model=List[PanelRead])
def list_panels_for_property(
    property_id: int, org: CurrentOrg, session: Session = Depends(get_session)
):
    _get_owned(property_id, session, org)
    return session.exec(select(Panel).where(Panel.property_id == property_id)).all()


@router.post("/{property_id}/panels", response_model=PanelRead)
def create_panel_for_property(
    property_id: int,
    data: PanelCreateNested,
    org: CurrentOrg,
    session: Session = Depends(get_session),
):
    _get_owned(property_id, session, org)
    panel = Panel(property_id=property_id, **data.model_dump())
    session.add(panel)
    session.commit()
    session.refresh(panel)
    return panel
