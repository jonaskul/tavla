import io
import os


JPEG_HEADER = b"\xff\xd8\xff"
PNG_HEADER = b"\x89PNG\r\n\x1a\n"
PDF_HEADER = b"%PDF"


def _jpeg(size=200):
    return JPEG_HEADER + b"\x00" * size


def _png(size=200):
    return PNG_HEADER + b"\x00" * size


def _pdf(size=200):
    return PDF_HEADER + b"\x00" * size


def test_upload_jpeg(client, cp_factory):
    cp = cp_factory()
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("photo.jpg", io.BytesIO(_jpeg()), "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["mimetype"] == "image/jpeg"
    assert data["connection_point_id"] == cp["id"]


def test_upload_png(client, cp_factory):
    cp = cp_factory()
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("image.png", io.BytesIO(_png()), "image/png")},
    )
    assert res.status_code == 200
    assert res.json()["mimetype"] == "image/png"


def test_upload_pdf(client, cp_factory):
    cp = cp_factory()
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("doc.pdf", io.BytesIO(_pdf()), "application/pdf")},
    )
    assert res.status_code == 200
    assert res.json()["mimetype"] == "application/pdf"


def test_reject_wrong_magic_bytes(client, cp_factory):
    cp = cp_factory()
    # Send exe-like content but claim image/jpeg
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("evil.jpg", io.BytesIO(b"MZ" + b"\x00" * 200), "image/jpeg")},
    )
    assert res.status_code == 415


def test_reject_text_file(client, cp_factory):
    cp = cp_factory()
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("notes.txt", io.BytesIO(b"Hello world"), "text/plain")},
    )
    assert res.status_code == 415


def test_reject_oversized_file(client, cp_factory):
    cp = cp_factory()
    big = JPEG_HEADER + b"\x00" * (20 * 1024 * 1024 + 1)
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("big.jpg", io.BytesIO(big), "image/jpeg")},
    )
    assert res.status_code == 413


def test_sanitize_path_traversal_filename(client, cp_factory):
    cp = cp_factory()
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("../../../etc/passwd.jpg", io.BytesIO(_jpeg()), "image/jpeg")},
    )
    assert res.status_code == 200
    filename = res.json()["filename"]
    assert "/" not in filename
    assert "\\" not in filename
    assert ".." not in filename


def test_sanitize_special_chars_filename(client, cp_factory):
    cp = cp_factory()
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("my file; rm -rf.jpg", io.BytesIO(_jpeg()), "image/jpeg")},
    )
    assert res.status_code == 200
    filename = res.json()["filename"]
    assert ";" not in filename


def test_delete_file_removes_from_db_and_disk(client, cp_factory):
    cp = cp_factory()
    upload_res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("photo.jpg", io.BytesIO(_jpeg()), "image/jpeg")},
    )
    assert upload_res.status_code == 200
    file_id = upload_res.json()["id"]
    local_path = upload_res.json()["local_path"]

    del_res = client.delete(f"/api/files/{file_id}")
    assert del_res.status_code == 200

    assert client.get(f"/api/files/{file_id}").status_code == 404
    assert not os.path.exists(local_path)


def test_file_stored_in_cp_subdirectory(client, cp_factory):
    cp = cp_factory()
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("img.jpg", io.BytesIO(_jpeg()), "image/jpeg")},
    )
    assert res.status_code == 200
    local_path = res.json()["local_path"]
    assert str(cp["id"]) in local_path


def test_content_type_header_ignored_magic_bytes_used(client, cp_factory):
    """Content-Type header claiming PDF but file has JPEG magic bytes → stored as JPEG."""
    cp = cp_factory()
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("photo.pdf", io.BytesIO(_jpeg()), "application/pdf")},
    )
    assert res.status_code == 200
    assert res.json()["mimetype"] == "image/jpeg"
