import io
from typing import List, Optional

from fastapi import APIRouter, Depends, File as FileField, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

import storage
from database import get_session
from models import ConnectionPoint, Equipment, File
from schemas import FileRead
from tenancy import CurrentOrg

router = APIRouter()


def owned_file(file_id: int, session: Session, org_id: int) -> File:
    """Fetch a file, treating another tenant's as non-existent."""
    record = session.get(File, file_id)
    if not record or record.organization_id != org_id:
        raise HTTPException(status_code=404, detail="File not found")
    return record


async def store_upload(
    upload: UploadFile,
    session: Session,
    org_id: int,
    *,
    connection_point_id: Optional[int] = None,
    equipment_id: Optional[int] = None,
) -> File:
    """Read, check and store one upload, and record it.

    The single place uploads are handled. It used to be copied into three
    routers, so a fix to one — the magic-byte check, the size limit — would
    silently miss the other two.
    """
    content = await upload.read()
    try:
        stored = storage.accept(
            content, upload.filename or "file", upload.content_type or "", org_id
        )
    except storage.RejectedUpload as exc:
        # 413 for size, 400 for everything else: a client can act on the
        # difference between "too big" and "wrong kind of file".
        too_big = len(content) > storage.MAX_FILE_SIZE
        raise HTTPException(status_code=413 if too_big else 400, detail=str(exc))

    record = File(
        connection_point_id=connection_point_id,
        equipment_id=equipment_id,
        filename=stored.filename,
        mimetype=stored.mimetype,
        storage_key=stored.key,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


@router.get("", response_model=List[FileRead])
def list_files(
    org: CurrentOrg,
    connection_point_id: Optional[int] = None,
    equipment_id: Optional[int] = None,
    session: Session = Depends(get_session),
):
    query = select(File).where(File.organization_id == org)
    if connection_point_id is not None:
        query = query.where(File.connection_point_id == connection_point_id)
    if equipment_id is not None:
        query = query.where(File.equipment_id == equipment_id)
    return session.exec(query).all()


@router.get("/{file_id}", response_model=FileRead)
def get_file_meta(file_id: int, org: CurrentOrg, session: Session = Depends(get_session)):
    return owned_file(file_id, session, org)


@router.get("/{file_id}/content")
def get_file_content(file_id: int, org: CurrentOrg, session: Session = Depends(get_session)):
    """Serve the bytes.

    Through the application rather than a presigned URL, so the tenant check
    runs on every read. These are photographs of the inside of customers'
    homes; a link that works for whoever holds it is the wrong default.
    """
    record = owned_file(file_id, session, org)
    try:
        content = storage.get_storage().get(record.storage_key)
    except Exception:
        raise HTTPException(status_code=404, detail="File not found in storage")

    return StreamingResponse(
        io.BytesIO(content),
        media_type=record.mimetype,
        headers={
            # attachment, not inline: the browser saves it instead of
            # rendering it in the page's own origin.
            "Content-Disposition": f'attachment; filename="{record.filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


async def _upload(
    upload: UploadFile,
    connection_point_id: Optional[int],
    equipment_id: Optional[int],
    session: Session,
    org_id: int,
) -> File:
    if connection_point_id is not None and equipment_id is not None:
        raise HTTPException(
            status_code=400,
            detail="Specify either connection_point_id or equipment_id, not both",
        )

    # Attaching to something means it has to exist, and be ours. Without
    # this a file could be hung off another tenant's connection point, or
    # off an id that was never there.
    if connection_point_id is not None:
        parent = session.get(ConnectionPoint, connection_point_id)
        if not parent or parent.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Connection point not found")
    if equipment_id is not None:
        parent = session.get(Equipment, equipment_id)
        if not parent or parent.organization_id != org_id:
            raise HTTPException(status_code=404, detail="Equipment not found")

    return await store_upload(
        upload,
        session,
        org_id,
        connection_point_id=connection_point_id,
        equipment_id=equipment_id,
    )


@router.post("/upload", response_model=FileRead)
async def upload_file_legacy(
    org: CurrentOrg,
    file: UploadFile = FileField(...),
    connection_point_id: Optional[int] = Query(None),
    equipment_id: Optional[int] = Query(None),
    session: Session = Depends(get_session),
):
    """POST /api/files/upload — connection_point_id as query parameter."""
    return await _upload(file, connection_point_id, equipment_id, session, org)


@router.post("", response_model=FileRead)
async def upload_file(
    org: CurrentOrg,
    file: UploadFile = FileField(...),
    connection_point_id: Optional[int] = Form(None),
    equipment_id: Optional[int] = Form(None),
    session: Session = Depends(get_session),
):
    """POST /api/files — connection_point_id as form field."""
    return await _upload(file, connection_point_id, equipment_id, session, org)


@router.delete("/{file_id}", response_model=FileRead)
def delete_file(file_id: int, org: CurrentOrg, session: Session = Depends(get_session)):
    record = owned_file(file_id, session, org)
    record_data = FileRead.model_validate(record)
    key = record.storage_key

    # The row first, then the bytes. The other order leaves a row pointing
    # at nothing if the commit fails, and a 404 on every later read.
    session.delete(record)
    session.commit()
    try:
        storage.get_storage().delete(key)
    except Exception:
        # The row is gone, so the object is unreachable either way. Worth a
        # line in the log rather than a failed request.
        import logging
        logging.getLogger(__name__).warning("Klarte ikke slette %s fra lagring", key)

    return record_data
