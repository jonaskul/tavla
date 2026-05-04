# Tavla – Fase 3: Tester og akseptansekriterier

## Akseptansekriterier

### AC-1: Kursdetalj-side (`/kurs/:id`)
- [ ] Viser kursbetegnelse og navn
- [ ] Viser rom, kabeltype, tverrsnitt, antall ledere, lengde og kommentar
- [ ] Lenke tilbake til sikringsskap (`/skap/:panel_id`)
- [ ] Lenke tilbake til eiendom (`/eiendommer/:property_id`)

### AC-2: Koblingspunkter
- [ ] Lister alle koblingspunkter for kursen
- [ ] «Legg til koblingspunkt»-knapp åpner dialog
- [ ] Rediger-knapp åpner dialog forhåndsutfylt med eksisterende verdier
- [ ] Slett-knapp åpner bekreftelsesdialog
- [ ] Kan ikke slette koblingspunkt som har filer → API returnerer 409 → norsk feilmelding vises
- [ ] Felter: type (dropdown med alle 7 typer), plassering (påkrevd), kommentar (valgfri)
- [ ] Type er påkrevd → valideringsfeil
- [ ] Plassering er påkrevd → valideringsfeil
- [ ] API automatisk logger endringslogg ved opprett, oppdater og slett

### AC-3: Filopplasting (`FileUpload`-komponent)
- [ ] Drag-and-drop eller klikk for å velge fil
- [ ] `data-testid="file-input"` på skjult filinput
- [ ] Kun JPG, PNG og PDF aksepteres – norsk feilmelding ved annen type
- [ ] Maks 20 MB – norsk feilmelding ved for stor fil
- [ ] Filnavn sanitiseres server-side (fjerner `../`, `/`, spesialtegn)
- [ ] Mimetype valideres mot magic bytes (ikke bare Content-Type-header)
- [ ] Bilder viser miniatyrbilde
- [ ] PDF-filer viser PDF-ikon med filnavn
- [ ] Klikk på miniatyrbilde åpner lightbox
- [ ] Klikk på PDF-ikon åpner i ny fane
- [ ] Slett fil med bekreftelse → fjernes fra DB og disk

### AC-4: Endringslogg (`ChangeLog`-komponent)
- [ ] Viser alle hendelser for kursen, sortert nyeste øverst
- [ ] Viser «utført av», «beskrivelse» og «tidspunkt» per hendelse
- [ ] «Registrer endring»-knapp åpner skjema
- [ ] Begge felt (utført av og beskrivelse) er påkrevd
- [ ] Ingen rediger- eller slett-knapper (endringslogg er append-only)

### AC-5: Sikkerhets- og valideringskrav (backend)
- [ ] Filnavn sanitiseres: fjerner `../`, `/`, og spesialtegn
- [ ] Mimetype bestemmes av magic bytes, ikke Content-Type-header
- [ ] Filer over 20 MB avvises med HTTP 413
- [ ] Filer med ugyldig magic bytes avvises med HTTP 415
- [ ] Filer lagres under `uploads/{connection_point_id}/`

### AC-6: Norske tekster
- [ ] All UI-tekst hentes fra `i18n/no.js`
- [ ] Nye strenger er lagt til i `i18n/no.js` før bruk

---

## Pytest-tester (`tests/test_connection_points.py`, `tests/test_files.py`)

```
tests/test_connection_points.py::test_create_connection_point
tests/test_connection_points.py::test_list_connection_points_for_circuit
tests/test_connection_points.py::test_create_auto_logs_changelog
tests/test_connection_points.py::test_update_connection_point
tests/test_connection_points.py::test_update_auto_logs_changelog
tests/test_connection_points.py::test_delete_connection_point
tests/test_connection_points.py::test_delete_auto_logs_changelog
tests/test_connection_points.py::test_delete_blocked_when_has_files
tests/test_connection_points.py::test_list_files_for_connection_point
tests/test_connection_points.py::test_circuit_404_for_connection_points

tests/test_files.py::test_upload_jpeg
tests/test_files.py::test_upload_png
tests/test_files.py::test_upload_pdf
tests/test_files.py::test_reject_wrong_magic_bytes
tests/test_files.py::test_reject_text_file
tests/test_files.py::test_reject_oversized_file
tests/test_files.py::test_sanitize_path_traversal_filename
tests/test_files.py::test_sanitize_special_chars_filename
tests/test_files.py::test_delete_file_removes_from_db_and_disk
tests/test_files.py::test_file_stored_in_cp_subdirectory
tests/test_files.py::test_content_type_header_ignored_magic_bytes_used
```

---

## Vitest-tester (`src/__tests__/CircuitDetail.test.jsx`)

```
CircuitDetail — circuit info
  ✓ shows designation and name
  ✓ shows room
  ✓ shows cable type
  ✓ shows cross section
  ✓ shows conductor count
  ✓ shows length
  ✓ shows back link to panel
  ✓ shows back link to property via panel

CircuitDetail — connection points
  ✓ lists connection points
  ✓ shows "Legg til koblingspunkt" button
  ✓ opens add dialog when clicking add button
  ✓ opens edit dialog pre-filled when clicking edit
  ✓ shows confirmation dialog on delete click
  ✓ shows 409 error when deleting CP with files

CircuitDetail — connection point dialog validation
  ✓ shows type error when submitting without type
  ✓ shows location error when submitting without location

CircuitDetail — file upload
  ✓ has file input with data-testid="file-input" in files section
  ✓ shows Norwegian error for invalid file type
  ✓ shows Norwegian error for oversized file

CircuitDetail — changelog
  ✓ shows changelog section heading
  ✓ shows changelog entries
  ✓ renders entries newest first
  ✓ shows "Registrer endring" button
  ✓ shows form when clicking "Registrer endring"
  ✓ shows validation errors when submitting empty form
```

---

## API-endepunkter implementert i Fase 3

```
GET    /api/circuits/{id}/connection_points
POST   /api/circuits/{id}/connection_points   ← oppretter + logger endringslogg
GET    /api/circuits/{id}/changelog
GET    /api/connection_points/{id}
PUT    /api/connection_points/{id}            ← oppdaterer + logger endringslogg
DELETE /api/connection_points/{id}            ← 409 ved filer, logger endringslogg
GET    /api/connection_points/{id}/files
POST   /api/connection_points/{id}/files      ← magic bytes + størrelse + sanitering
GET    /api/files/{id}
GET    /api/files/{id}/content                ← serverer filinnhold
DELETE /api/files/{id}                        ← fjerner fra DB og disk
```
