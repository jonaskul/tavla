import io
import os


def test_upload_image(client, connection_point_factory):
    cp = connection_point_factory()
    fake_image = io.BytesIO(b"fake jpeg content")
    res = client.post(
        f"/api/files/upload?connection_point_id={cp['id']}",
        files={"file": ("test.jpg", fake_image, "image/jpeg")},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["filename"] == "test.jpg"
    assert data["connection_point_id"] == cp["id"]


def test_upload_pdf(client, connection_point_factory):
    cp = connection_point_factory()
    fake_pdf = io.BytesIO(b"%PDF-1.4 fake content")
    res = client.post(
        f"/api/files/upload?connection_point_id={cp['id']}",
        files={"file": ("tegning.pdf", fake_pdf, "application/pdf")},
    )
    assert res.status_code == 200


def test_upload_invalid_type_blocked(client, connection_point_factory):
    cp = connection_point_factory()
    fake_exe = io.BytesIO(b"MZ fake exe")
    res = client.post(
        f"/api/files/upload?connection_point_id={cp['id']}",
        files={"file": ("virus.exe", fake_exe, "application/octet-stream")},
    )
    assert res.status_code == 400


def test_upload_too_large_blocked(client, connection_point_factory):
    cp = connection_point_factory()
    large_file = io.BytesIO(b"x" * (21 * 1024 * 1024))  # 21 MB
    res = client.post(
        f"/api/files/upload?connection_point_id={cp['id']}",
        files={"file": ("stor.jpg", large_file, "image/jpeg")},
    )
    assert res.status_code == 413


def test_delete_file(client, file_factory):
    file = file_factory()
    res = client.delete(f"/api/files/{file['id']}")
    assert res.status_code == 200
    assert client.get(f"/api/files/{file['id']}").status_code == 404


def test_filename_sanitized(client, connection_point_factory):
    cp = connection_point_factory()
    fake_image = io.BytesIO(b"fake jpeg")
    res = client.post(
        f"/api/files/upload?connection_point_id={cp['id']}",
        files={"file": ("../../../etc/passwd.jpg", fake_image, "image/jpeg")},
    )
    assert res.status_code == 200
    assert "../" not in res.json()["filename"]
    assert res.json()["filename"] == "passwd.jpg"


# --- Additional tests ---

def test_upload_jpeg_with_magic_bytes(client, connection_point_factory):
    cp = connection_point_factory()
    jpeg = b"\xff\xd8\xff" + b"\x00" * 100
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("photo.jpg", io.BytesIO(jpeg), "image/jpeg")},
    )
    assert res.status_code == 200
    assert res.json()["mimetype"] == "image/jpeg"


def test_upload_png_with_magic_bytes(client, connection_point_factory):
    cp = connection_point_factory()
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("image.png", io.BytesIO(png), "image/png")},
    )
    assert res.status_code == 200
    assert res.json()["mimetype"] == "image/png"


def test_delete_removes_from_disk(client, connection_point_factory):
    cp = connection_point_factory()
    jpeg = b"\xff\xd8\xff" + b"\x00" * 100
    upload_res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("photo.jpg", io.BytesIO(jpeg), "image/jpeg")},
    )
    assert upload_res.status_code == 200
    local_path = upload_res.json()["local_path"]

    client.delete(f"/api/files/{upload_res.json()['id']}")
    assert not os.path.exists(local_path)


def test_file_stored_in_cp_subdirectory(client, connection_point_factory):
    cp = connection_point_factory()
    jpeg = b"\xff\xd8\xff" + b"\x00" * 100
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("img.jpg", io.BytesIO(jpeg), "image/jpeg")},
    )
    assert res.status_code == 200
    assert str(cp["id"]) in res.json()["local_path"]


def test_magic_bytes_override_content_type(client, connection_point_factory):
    """File with JPEG magic bytes but PDF content-type → stored as image/jpeg."""
    cp = connection_point_factory()
    jpeg = b"\xff\xd8\xff" + b"\x00" * 100
    res = client.post(
        f"/api/connection_points/{cp['id']}/files",
        files={"file": ("photo.pdf", io.BytesIO(jpeg), "application/pdf")},
    )
    assert res.status_code == 200
    assert res.json()["mimetype"] == "image/jpeg"
