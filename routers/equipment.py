import os
import re
import uuid

from fastapi import APIRouter, Depends, File as FileField, HTTPException, UploadFile
from sqlalchemy import desc
from sqlmodel import Session, select
from typing import List, Optional

from database import get_session
from models import ChangeLog, Circuit, Equipment, File
from schemas import (
    EquipmentCreate,
    EquipmentCreateNested,
    EquipmentRead,
    EquipmentUpdate,
    FileRead,
)

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
MAX_FILE_SIZE = 20 * 1024 * 1024
ALLOWED_MIMETYPES = {"image/jpeg", "image/png", "application/pdf"}

MAGIC_BYTES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"%PDF": "application/pdf",
}

EQUIPMENT_TYPE_LABELS = {
    "floor_heating": "Varmekabler",
    "ev_charger": "Elbillader",
    "heat_pump": "Varmepumpe",
    "boiler": "Varmtvannsbereder",
    "other": "Annet",
}


def detect_magic(content: bytes) -> Optional[str]:
    for magic, mime in MAGIC_BYTES.items():
        if content[: len(magic)] == magic:
            return mime
    return None


def resolve_mimetype(content: bytes, content_type: str) -> Optional[str]:
    magic = detect_magic(content)
    if magic is not None:
        return magic if magic in ALLOWED_MIMETYPES else None
    return content_type if content_type in ALLOWED_MIMETYPES else None


def sanitize_filename(filename: str) -> str:
    name = filename.replace("\\", "/").split("/")[-1]
    name = re.sub(r"\.\.+", ".", name)
    name = re.sub(r"[^\w\-. ]", "_", name)
    name = name.strip(". ").strip()
    return name or "file"


def _type_label(eq_type) -> str:
    val = eq_type.value if hasattr(eq_type, "value") else str(eq_type)
    return EQUIPMENT_TYPE_LABELS.get(val, val)


# --- Flat CRUD ---

@router.get("", response_model=List[EquipmentRead])
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


@router.post("", response_model=EquipmentRead)
def create_equipment(data: EquipmentCreate, session: Session = Depends(get_session)):
    circuit = session.get(Circuit, data.circuit_id)
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")
    item = Equipment(**data.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    _log_create(item, session)
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


@router.delete("/{equipment_id}", response_model=EquipmentRead)
def delete_equipment(equipment_id: int, session: Session = Depends(get_session)):
    item = session.get(Equipment, equipment_id)
    if not item:
        raise HTTPException(status_code=404, detail="Equipment not found")
    _check_no_files(item, session)
    item_data = EquipmentRead.model_validate(item)
    circuit_id = item.circuit_id
    label = _type_label(item.type)
    session.delete(item)
    session.commit()
    _log_delete(circuit_id, label, session)
    return item_data


# --- Nested: files under equipment ---

@router.get("/{equipment_id}/files", response_model=List[FileRead])
def list_files_for_equipment(
    equipment_id: int, session: Session = Depends(get_session)
):
    if not session.get(Equipment, equipment_id):
        raise HTTPException(status_code=404, detail="Equipment not found")
    return session.exec(select(File).where(File.equipment_id == equipment_id)).all()


@router.post("/{equipment_id}/files", response_model=FileRead)
async def upload_file_for_equipment(
    equipment_id: int,
    file: UploadFile = FileField(...),
    session: Session = Depends(get_session),
):
    if not session.get(Equipment, equipment_id):
        raise HTTPException(status_code=404, detail="Equipment not found")

    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB)")

    real_mime = resolve_mimetype(content, file.content_type or "")
    if real_mime is None:
        raise HTTPException(
            status_code=400,
            detail="Filtype ikke støttet. Kun JPG, PNG og PDF er tillatt.",
        )

    safe_name = sanitize_filename(file.filename or "file")
    ext = os.path.splitext(safe_name)[1]
    unique_name = f"{uuid.uuid4()}{ext}"

    eq_dir = os.path.join(UPLOAD_DIR, "equipment", str(equipment_id))
    os.makedirs(eq_dir, exist_ok=True)
    local_path = os.path.join(eq_dir, unique_name)

    with open(local_path, "wb") as fh:
        fh.write(content)

    record = File(
        equipment_id=equipment_id,
        filename=safe_name,
        mimetype=real_mime,
        local_path=local_path,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


# --- Helpers ---

def _check_no_files(item: Equipment, session: Session) -> None:
    if session.exec(select(File).where(File.equipment_id == item.id)).first():
        raise HTTPException(
            status_code=409,
            detail="Cannot delete equipment that has files",
        )


def _log_create(item: Equipment, session: Session) -> None:
    brand_model = " ".join(filter(None, [item.brand, item.model]))
    desc = f"Utstyr opprettet: {_type_label(item.type)}"
    if brand_model:
        desc += f" – {brand_model}"
    session.add(ChangeLog(circuit_id=item.circuit_id, description=desc))
    session.commit()


def _log_delete(circuit_id: int, label: str, session: Session) -> None:
    session.add(ChangeLog(
        circuit_id=circuit_id,
        description=f"Utstyr slettet: {label}",
    ))
    session.commit()
