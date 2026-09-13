"""Where uploaded files live, and the checks they pass on the way in.

Until now files were written to a directory next to the code, and the
upload logic — magic bytes, size limit, filename sanitising — was copied
into three routers. That meant a fix to one copy silently missed the other
two, and it tied the whole application to one machine's disk: on anything
ephemeral, every photo of a panel would be gone after a restart while the
database row kept pointing at a path that no longer exists.

The backend is swappable, like the mailer. Local disk stays the default so
a plain checkout needs no credentials; production points at R2, or any
S3-compatible store.

Serving goes through the API rather than presigned URLs. A presigned URL
is reachable by anyone holding it, and these are photographs of the inside
of customers' homes — so the tenant check runs on every read, and the
bytes travel through the application. Presigned URLs would be faster and
can come later, behind the same interface.
"""

import hashlib
import logging
import os
import re
import uuid
from dataclasses import dataclass
from typing import Optional, Protocol

logger = logging.getLogger(__name__)

MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_MIMETYPES = {"image/jpeg", "image/png", "application/pdf"}

# What the bytes say they are. Trusted over the Content-Type header, which
# the client chooses and can simply be wrong about.
MAGIC_BYTES = {
    b"\xff\xd8\xff": "image/jpeg",
    b"\x89PNG\r\n\x1a\n": "image/png",
    b"%PDF": "application/pdf",
}


class RejectedUpload(Exception):
    """The upload did not pass the checks. The message is shown to the user."""


def detect_mimetype(content: bytes) -> Optional[str]:
    for magic, mime in MAGIC_BYTES.items():
        if content[: len(magic)] == magic:
            return mime
    return None


def resolve_mimetype(content: bytes, content_type: str) -> Optional[str]:
    """What this file actually is, or None if it is not something we accept.

    Magic bytes win. The header is only consulted when the bytes say
    nothing, which is why a file can still be stored as a type it is not —
    a gap worth closing, but closing it would reject formats whose magic is
    not in the table above, so it is a deliberate decision rather than an
    oversight.
    """
    magic = detect_mimetype(content)
    if magic is not None:
        return magic if magic in ALLOWED_MIMETYPES else None
    return content_type if content_type in ALLOWED_MIMETYPES else None


def sanitize_filename(filename: str) -> str:
    """Reduce a client-supplied name to something safe to store and show.

    The name never reaches the filesystem — the stored key is a uuid — so
    this is about what gets displayed and sent back in Content-Disposition,
    not about traversal.
    """
    name = filename.replace("\\", "/").split("/")[-1]
    name = re.sub(r"\.\.+", ".", name)
    name = re.sub(r"[^\w\-. ]", "_", name)
    name = name.strip(". ").strip()
    return name or "file"


@dataclass(frozen=True)
class StoredFile:
    key: str
    mimetype: str
    filename: str
    size: int


class Storage(Protocol):
    def put(self, key: str, content: bytes, mimetype: str) -> None: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...
    def exists(self, key: str) -> bool: ...


class LocalStorage:
    """Files on disk. The default, so a checkout runs with no credentials.

    Not suitable for anything that can be rescheduled onto another machine:
    the rows survive and the bytes do not.
    """

    def __init__(self, root: str):
        self._root = root

    def _path(self, key: str) -> str:
        # Keys are generated here and are uuid-based, but join defensively
        # anyway so a key from elsewhere cannot climb out of the root.
        safe = key.replace("\\", "/").lstrip("/")
        if ".." in safe.split("/"):
            raise RejectedUpload("Ugyldig filreferanse")
        return os.path.join(self._root, safe)

    def put(self, key: str, content: bytes, mimetype: str) -> None:
        path = self._path(key)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as fh:
            fh.write(content)

    def get(self, key: str) -> bytes:
        with open(self._path(key), "rb") as fh:
            return fh.read()

    def delete(self, key: str) -> None:
        path = self._path(key)
        if os.path.exists(path):
            os.remove(path)

    def exists(self, key: str) -> bool:
        return os.path.exists(self._path(key))


class S3Storage:
    """R2, or any S3-compatible store."""

    def __init__(self, bucket: str, endpoint_url: str, access_key: str, secret_key: str,
                 region: str = "auto"):
        import boto3  # imported here so a local checkout need not have it

        self._bucket = bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )

    def put(self, key: str, content: bytes, mimetype: str) -> None:
        self._client.put_object(
            Bucket=self._bucket, Key=key, Body=content, ContentType=mimetype
        )

    def get(self, key: str) -> bytes:
        return self._client.get_object(Bucket=self._bucket, Key=key)["Body"].read()

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def exists(self, key: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except ClientError:
            return False


_storage: Optional[Storage] = None


def set_storage(backend: Storage) -> None:
    global _storage
    _storage = backend


def get_storage() -> Storage:
    if _storage is None:
        raise RuntimeError("Lagring er ikke konfigurert — kall configure_storage()")
    return _storage


def configure_storage() -> None:
    """Pick a backend from the environment. Called once at startup."""
    import config

    if config.R2_BUCKET:
        set_storage(S3Storage(
            bucket=config.R2_BUCKET,
            endpoint_url=config.R2_ENDPOINT_URL,
            access_key=config.R2_ACCESS_KEY_ID,
            secret_key=config.R2_SECRET_ACCESS_KEY,
        ))
        logger.info("Filer lagres i R2-bøtta %s", config.R2_BUCKET)
    else:
        set_storage(LocalStorage(config.UPLOAD_DIR))
        logger.info("Filer lagres lokalt i %s", config.UPLOAD_DIR)


def build_key(organization_id: int, filename: str) -> str:
    """Where a file goes in the store.

    Prefixed by organization so a bucket listing is separated by tenant and
    a misdirected read is obvious rather than subtle. The name itself is a
    uuid: the client's filename is kept in the database for display and
    never used as a path.
    """
    ext = os.path.splitext(filename)[1].lower()[:10]
    return f"org-{organization_id}/{uuid.uuid4()}{ext}"


def accept(content: bytes, filename: str, content_type: str, organization_id: int) -> StoredFile:
    """Check an upload and store it. Raises RejectedUpload if it fails."""
    if len(content) > MAX_FILE_SIZE:
        raise RejectedUpload(f"Filen er for stor. Maks {MAX_FILE_SIZE // (1024 * 1024)} MB")

    mimetype = resolve_mimetype(content, content_type or "")
    if mimetype is None:
        raise RejectedUpload("Filtype ikke støttet. Kun JPG, PNG og PDF er tillatt.")

    safe_name = sanitize_filename(filename or "file")
    key = build_key(organization_id, safe_name)
    get_storage().put(key, content, mimetype)

    return StoredFile(key=key, mimetype=mimetype, filename=safe_name, size=len(content))
