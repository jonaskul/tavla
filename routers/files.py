import os
import uuid

from fastapi import APIRouter, Depends, File as FileField, Form, HTTPException, UploadFile
from sqlmodel import Session, select
from typing import List, Optional

from database import get_session
from models import File
from schemas import FileRead

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "uploads")


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
def get_file(file_id: int, session: Session = Depends(get_session)):
    record = session.get(File, file_id)
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    return record


@router.post("", response_model=FileRead)
async def upload_file(
    file: UploadFile = FileField(...),
    connection_point_id: Optional[int] = Form(None),
    equipment_id: Optional[int] = Form(None),
    session: Session = Depends(get_session),
):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1]
    unique_name = f"{uuid.uuid4()}{ext}"
    local_path = os.path.join(UPLOAD_DIR, unique_name)

    content = await file.read()
    with open(local_path, "wb") as fh:
        fh.write(content)

    record = File(
        connection_point_id=connection_point_id,
        equipment_id=equipment_id,
        filename=file.filename or unique_name,
        mimetype=file.content_type or "application/octet-stream",
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
