from fastapi import APIRouter, Depends, File as FileField, HTTPException, UploadFile
from sqlalchemy import desc
from sqlmodel import Session, select
from typing import List, Optional

from database import get_session
from routers.files import store_upload
from tenancy import CurrentOrg
from models import ChangeLog, Circuit, ConnectionPoint, File
from schemas import (
    ChangeLogRead,
    ConnectionPointCreate,
    ConnectionPointRead,
    ConnectionPointUpdate,
    FileRead,
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

def _cp_type_label(cp_type) -> str:
    val = cp_type.value if hasattr(cp_type, "value") else str(cp_type)
    return CP_TYPE_LABELS.get(val, val)


@router.get("", response_model=List[ConnectionPointRead])
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


@router.post("", response_model=ConnectionPointRead)
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

    entry = ChangeLog(
        circuit_id=cp.circuit_id,
        changed_by="system",
        description=f"Koblingspunkt oppdatert: {_cp_type_label(cp.type)} – {cp.location}",
    )
    session.add(entry)
    session.commit()

    return cp


@router.delete("/{cp_id}", response_model=ConnectionPointRead)
def delete_connection_point(cp_id: int, session: Session = Depends(get_session)):
    cp = session.get(ConnectionPoint, cp_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Connection point not found")
    has_files = session.exec(
        select(File).where(File.connection_point_id == cp_id)
    ).first()
    if has_files:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete connection point that has files",
        )

    circuit_id = cp.circuit_id
    location = cp.location
    type_label = _cp_type_label(cp.type)

    cp_data = ConnectionPointRead.model_validate(cp)
    session.delete(cp)
    session.commit()

    entry = ChangeLog(
        circuit_id=circuit_id,
        changed_by="system",
        description=f"Koblingspunkt slettet: {type_label} – {location}",
    )
    session.add(entry)
    session.commit()

    return cp_data


# --- Nested: changelog under connection point ---

@router.get("/{cp_id}/changelog", response_model=List[ChangeLogRead])
def list_changelog_for_connection_point(
    cp_id: int, session: Session = Depends(get_session)
):
    if not session.get(ConnectionPoint, cp_id):
        raise HTTPException(status_code=404, detail="Connection point not found")
    return session.exec(
        select(ChangeLog)
        .where(ChangeLog.connection_point_id == cp_id)
        .order_by(desc(ChangeLog.changed_at))
    ).all()


# --- Nested: files under connection point ---

@router.get("/{cp_id}/files", response_model=List[FileRead])
def list_files_for_connection_point(
    cp_id: int, session: Session = Depends(get_session)
):
    if not session.get(ConnectionPoint, cp_id):
        raise HTTPException(status_code=404, detail="Connection point not found")
    return session.exec(select(File).where(File.connection_point_id == cp_id)).all()


@router.post("/{cp_id}/files", response_model=FileRead)
async def upload_file_for_connection_point(
    cp_id: int,
    org: CurrentOrg,
    file: UploadFile = FileField(...),
    session: Session = Depends(get_session),
):
    cp = session.get(ConnectionPoint, cp_id)
    if not cp or cp.organization_id != org:
        raise HTTPException(status_code=404, detail="Connection point not found")
    return await store_upload(file, session, org, connection_point_id=cp_id)
