"""File storage.

Uploads used to be written to a directory next to the code, with the
checking logic copied into three routers. Both halves of that mattered: a
fix to one copy silently missed the other two, and the files could not
outlive the machine they landed on.

These cover the checks, the key layout, and the S3 path against a stub —
no bucket, no credentials, no network.
"""

import io

import pytest

import storage


@pytest.fixture
def local(tmp_path):
    backend = storage.LocalStorage(str(tmp_path))
    storage.set_storage(backend)
    return backend


JPEG = b"\xff\xd8\xff" + b"resten av bildet"
PNG = b"\x89PNG\r\n\x1a\n" + b"pikslene"
PDF = b"%PDF-1.7\n" + b"sider"


# --- What is accepted ------------------------------------------------------

@pytest.mark.parametrize("content,expected", [
    (JPEG, "image/jpeg"),
    (PNG, "image/png"),
    (PDF, "application/pdf"),
])
def test_the_bytes_decide_the_type(content, expected):
    """Not the Content-Type header, which the client chooses and can be wrong."""
    assert storage.resolve_mimetype(content, "application/octet-stream") == expected


def test_a_lying_header_cannot_smuggle_a_known_type():
    """Claiming to be a JPEG does not make a PDF one."""
    assert storage.resolve_mimetype(PDF, "image/jpeg") == "application/pdf"


def test_something_with_no_recognised_magic_falls_back_to_the_header():
    """A documented gap: the header is trusted when the bytes say nothing.

    Closing it would reject formats whose magic is not in the table, so it
    is a decision rather than an oversight — but it does mean arbitrary
    bytes can be stored as image/jpeg.
    """
    assert storage.resolve_mimetype(b"bare tekst", "image/jpeg") == "image/jpeg"
    assert storage.resolve_mimetype(b"bare tekst", "text/html") is None


def test_an_oversized_file_is_refused(local):
    too_big = JPEG + b"x" * storage.MAX_FILE_SIZE
    with pytest.raises(storage.RejectedUpload, match="for stor"):
        storage.accept(too_big, "stor.jpg", "image/jpeg", organization_id=1)


def test_an_unsupported_type_is_refused(local):
    with pytest.raises(storage.RejectedUpload, match="ikke støttet"):
        storage.accept(b"<html>hei</html>", "side.html", "text/html", organization_id=1)


# --- Names and keys --------------------------------------------------------

@pytest.mark.parametrize("given,expected", [
    # Takes the basename, so the directory part never survives at all.
    ("../../etc/passwd", "passwd"),
    ("/abs/olutt/bilde.jpg", "bilde.jpg"),
    ("C:\\Users\\ola\\skap.png", "skap.png"),
    ("..", "file"),
    ("", "file"),
])
def test_filenames_are_reduced_to_something_safe(given, expected):
    assert storage.sanitize_filename(given) == expected


def test_the_stored_key_is_not_the_uploaded_name(local):
    """The client's name is for display; it never becomes a path."""
    stored = storage.accept(JPEG, "skapet mitt.jpg", "image/jpeg", organization_id=7)
    assert stored.filename == "skapet mitt.jpg"
    assert "skapet" not in stored.key
    assert stored.key.endswith(".jpg")


def test_keys_are_separated_by_organization(local):
    """So a bucket listing is divided by tenant and a stray read is obvious."""
    mine = storage.accept(JPEG, "a.jpg", "image/jpeg", organization_id=1)
    theirs = storage.accept(JPEG, "a.jpg", "image/jpeg", organization_id=2)
    assert mine.key.startswith("org-1/")
    assert theirs.key.startswith("org-2/")
    assert mine.key != theirs.key


def test_two_uploads_of_the_same_name_do_not_collide(local):
    first = storage.accept(JPEG, "bilde.jpg", "image/jpeg", organization_id=1)
    second = storage.accept(JPEG, "bilde.jpg", "image/jpeg", organization_id=1)
    assert first.key != second.key


# --- Round trip ------------------------------------------------------------

def test_local_storage_round_trip(local):
    stored = storage.accept(PNG, "skap.png", "image/png", organization_id=3)
    assert local.exists(stored.key)
    assert local.get(stored.key) == PNG

    local.delete(stored.key)
    assert not local.exists(stored.key)


def test_deleting_something_absent_is_not_an_error(local):
    """Delete runs after the row is gone, so it must not fail the request."""
    local.delete("org-1/finnes-ikke.jpg")


def test_a_key_cannot_climb_out_of_the_storage_root(local):
    with pytest.raises(storage.RejectedUpload):
        local.get("../../../etc/passwd")


# --- The S3 path, without a bucket ----------------------------------------

class FakeS3:
    """Enough of the boto3 client to exercise S3Storage."""

    def __init__(self):
        self.objects = {}

    def put_object(self, Bucket, Key, Body, ContentType):
        self.objects[(Bucket, Key)] = (Body, ContentType)

    def get_object(self, Bucket, Key):
        body, _ = self.objects[(Bucket, Key)]
        return {"Body": io.BytesIO(body)}

    def delete_object(self, Bucket, Key):
        self.objects.pop((Bucket, Key), None)

    def head_object(self, Bucket, Key):
        if (Bucket, Key) not in self.objects:
            raise KeyError(Key)
        return {}


@pytest.fixture
def s3(monkeypatch):
    backend = storage.S3Storage.__new__(storage.S3Storage)
    backend._bucket = "tavla-filer"
    backend._client = FakeS3()
    storage.set_storage(backend)
    return backend


def test_s3_round_trip(s3):
    stored = storage.accept(JPEG, "skap.jpg", "image/jpeg", organization_id=4)
    assert s3.get(stored.key) == JPEG
    assert s3._client.objects[("tavla-filer", stored.key)][1] == "image/jpeg"


def test_s3_delete(s3):
    stored = storage.accept(JPEG, "skap.jpg", "image/jpeg", organization_id=4)
    s3.delete(stored.key)
    assert ("tavla-filer", stored.key) not in s3._client.objects


def test_the_same_checks_apply_whichever_backend(s3):
    """The backend decides where bytes go, never whether they are allowed."""
    with pytest.raises(storage.RejectedUpload):
        storage.accept(b"<html>", "x.html", "text/html", organization_id=4)
