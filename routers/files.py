import os
import re
import uuid

from fastapi import APIRouter, Depends, File as FileField, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from typing import List, Optional

from database import get_session
from models import File
from schemas import FileRead

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

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


@router.get("", response_model=List[FileRead])
def list_files(
    connection_point_id: Optional[int] = None,
    equipment_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    query = select(File)
    if connection_point_id is not None:
        query = query.where(File.connection_point_id == connection_point_id)
    if equipment_id is not None:
        query = query.where(File.equipment_id == equipment_id)
    return session.exec(query).all()


@router.get("/{file_id}", response_model=FileRead)
def get_file_meta(file_id: int, session: Session = Depends(get_session)):
    record = session.get(File, file_id)
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    return record


@router.get("/{file_id}/content")
def get_file_content(file_id: int, session: Session = Depends(get_session)):
    record = session.get(File, file_id)
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    if not os.path.exists(record.local_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(
        path=record.local_path,
        media_type=record.mimetype,
        filename=record.filename,
    )


@router.post("", response_model=FileRead)
async def upload_file(
    file: UploadFile = FileField(...),
    connection_point_id: Optional[int] = Form(None),
    equipment_id: Optional[int] = Form(None),
    session: Session = Depends(get_session),
):
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

    subdir = str(connection_point_id) if connection_point_id else "misc"
    dest_dir = os.path.join(UPLOAD_DIR, subdir)
    os.makedirs(dest_dir, exist_ok=True)
    local_path = os.path.join(dest_dir, unique_name)

    with open(local_path, "wb") as fh:
        fh.write(content)

    record = File(
        connection_point_id=connection_point_id,
        equipment_id=equipment_id,
        filename=safe_name,
        mimetype=real_mime,
        local_path=local_path,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.delete("/{file_id}", response_model=FileRead)
def delete_file(file_id: int, session: Session = Depends(get_session)):
    record = session.get(File, file_id)
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    if os.path.exists(record.local_path):
        os.remove(record.local_path)
    record_data = FileRead.model_validate(record)
    session.delete(record)
    session.commit()
    return record_data
