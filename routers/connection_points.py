import os
import re
import uuid

from fastapi import APIRouter, Depends, File as FileField, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from typing import List, Optional

from database import get_session
from models import ChangeLog, Circuit, ConnectionPoint, File
from schemas import ConnectionPointCreate, ConnectionPointRead, ConnectionPointUpdate, FileRead

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

CP_TYPE_LABELS = {
    "junction_box": "Koblingsboks",
    "outlet": "Stikkontakt",
    "light": "Lampe/armatur",
    "switch": "Bryter",
    "motor": "Motor",
    "other": "Annet",
}

MAGIC_BYTES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"%PDF": "application/pdf",
}


def detect_mimetype(content: bytes) -> Optional[str]:
    for magic, mime in MAGIC_BYTES.items():
        if content[: len(magic)] == magic:
            return mime
    return None


def sanitize_filename(filename: str) -> str:
    name = filename.replace("\\", "/").split("/")[-1]
    name = re.sub(r"\.\.+", ".", name)
    name = re.sub(r"[^\w\-. ]", "_", name)
    name = name.strip(". ").strip()
    return name or "file"


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

    type_label = CP_TYPE_LABELS.get(cp.type.value if hasattr(cp.type, "value") else cp.type, str(cp.type))
    entry = ChangeLog(
        circuit_id=cp.circuit_id,
        connection_point_id=cp.id,
        changed_by="system",
        description=f"Koblingspunkt oppdatert: {type_label} – {cp.location}",
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

    type_label = CP_TYPE_LABELS.get(cp.type.value if hasattr(cp.type, "value") else cp.type, str(cp.type))
    circuit_id = cp.circuit_id
    location = cp.location

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
    file: UploadFile = FileField(...),
    session: Session = Depends(get_session),
):
    cp = session.get(ConnectionPoint, cp_id)
    if not cp:
        raise HTTPException(status_code=404, detail="Connection point not found")

    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")

    real_mime = detect_mimetype(content)
    if real_mime is None:
        raise HTTPException(
            status_code=415,
            detail="Unsupported file type. Only JPG, PNG, and PDF are allowed.",
        )

    safe_name = sanitize_filename(file.filename or "file")
    ext = os.path.splitext(safe_name)[1]
    unique_name = f"{uuid.uuid4()}{ext}"

    cp_dir = os.path.join(UPLOAD_DIR, str(cp_id))
    os.makedirs(cp_dir, exist_ok=True)
    local_path = os.path.join(cp_dir, unique_name)

    with open(local_path, "wb") as fh:
        fh.write(content)

    record = File(
        connection_point_id=cp_id,
        filename=safe_name,
        mimetype=real_mime,
        local_path=local_path,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record
