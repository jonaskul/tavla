# ElDok – Prosjektplan

## Mål

Dokumentasjonsverktøy for elektriske installasjoner i norske hjem.
Støtter flere eiendommer, visuell skap-mockup, koblingspunkter med
bilder/dokumenter, fastmontert utstyr og endringslogg per kurs.

---

## Faseoversikt

| Fase | Innhold | Status |
|---|---|---|
| 1 | Fundament – CRUD-routers + React-grunnstruktur | ✅ Ferdig |
| 2 | Skap-mockup (PanelCanvas, DinRail, Module) | ✅ Ferdig |
| 3 | Kurs og koblingspunkter | 🔲 Ikke startet |
| 4 | Fastmontert utstyr | 🔲 Ikke startet |
| 5 | Eksport og R2 | 🔲 Ikke startet |
| 6 | Auth | 🔲 Ikke startet |
| 7 | Installatørportal | 🔲 Ikke startet |

---

## Språkkonvensjon

| Lag | Språk |
|---|---|
| UI (React-komponenter, labels, meldinger) | Norsk |
| Kode, modeller, API-endepunkter, kommentarer | Engelsk |
| Git commits | Engelsk |
| Dokumentasjon (README, PLAN) | Norsk og engelsk |

---

## Datamodell

```
Property
├── id, name, address, created_at

Panel
├── id, property_id, name, location
├── rows (int)              # antall DIN-skinnerader
├── modules_per_row (int)   # moduler per skinne
└── created_at

DinRail
├── id, panel_id, row_number, label

Module
├── id, rail_id
├── position (int)          # startposisjon på skinnen
├── width (int)             # bredde i moduler (1, 2, 3...)
├── type                    # breaker | rcd | rcd_breaker | shelly |
│                           # dynalite | surge_protection | other
├── label                   # fritekst, vises i UI
├── ampere (nullable)
├── has_rcd (bool)
└── circuit_id (nullable)   # FK til Circuit

Circuit
├── id, panel_id, module_id
├── designation             # B01, L03, K12...
├── name                    # Lys stue/gang
├── room
├── cable_type              # NYM-J, PFXP, PFSP...
├── cross_section           # 1.5, 2.5, 4.0, 6.0, 10.0
├── conductor_count         # 2, 3, 5
├── length_m
├── notes
└── created_at

ConnectionPoint
├── id, circuit_id
├── type                    # junction_box | outlet | light |
│                           # switch | motor | other
├── location                # fritekst
├── notes
└── created_at

File
├── id
├── connection_point_id (nullable)
├── equipment_id (nullable)
├── filename
├── mimetype
├── local_path
├── r2_key (nullable)       # satt etter R2-sync
└── uploaded_at

Equipment                   # fastmontert utstyr
├── id, circuit_id
├── type                    # floor_heating | ev_charger |
│                           # heat_pump | boiler | other
├── brand, model
├── watt (nullable)
├── notes
└── created_at

ChangeLog
├── id
├── circuit_id (nullable)
├── connection_point_id (nullable)
├── equipment_id (nullable)
├── changed_by              # fritekst inntil auth er på plass
├── description
└── changed_at
```

---

## API-endepunkter

```
GET    /api/properties
POST   /api/properties
GET    /api/properties/{id}
PUT    /api/properties/{id}
DELETE /api/properties/{id}

GET    /api/properties/{id}/panels
POST   /api/properties/{id}/panels
GET    /api/panels/{id}
PUT    /api/panels/{id}
DELETE /api/panels/{id}

GET    /api/panels/{id}/modules
POST   /api/panels/{id}/modules
PUT    /api/modules/{id}
DELETE /api/modules/{id}

GET    /api/panels/{id}/circuits
POST   /api/panels/{id}/circuits
GET    /api/circuits/{id}
PUT    /api/circuits/{id}
DELETE /api/circuits/{id}

GET    /api/circuits/{id}/connection_points
POST   /api/circuits/{id}/connection_points
GET    /api/connection_points/{id}
PUT    /api/connection_points/{id}
DELETE /api/connection_points/{id}

GET    /api/circuits/{id}/equipment
POST   /api/circuits/{id}/equipment
PUT    /api/equipment/{id}
DELETE /api/equipment/{id}

GET    /api/circuits/{id}/changelog
GET    /api/connection_points/{id}/changelog
POST   /api/changelog                        # ny hendelse

POST   /api/files/upload
GET    /api/files/{id}
DELETE /api/files/{id}

GET    /api/panels/{id}/export/pdf
```

---

## Frontend-sider

```
/                           → Eiendommer (liste)
/eiendommer/:id             → Eiendomsdetaljer + skapliste
/skap/:id                   → Skap-mockup (visuell DIN-skinne)
/kurs/:id                   → Kursdetaljer + koblingspunkter + utstyr
/koblingspunkt/:id          → Koblingspunktdetaljer + filer + logg
```

---

## Skap-mockup UX (PanelCanvas)

1. Konfigurer skap: velg antall rader og moduler per rad
2. Canvas rendres som et grid – én rad per DIN-skinne
3. Klikk på tom modul og dra bortover → velg bredde (highlight aktive moduler)
4. Dialog åpnes med felter:
   - Type (automatsikring, jordfeilbryter, kombinert, Shelly, Dynalite, overspenningsvern, annet)
   - Ampere (om relevant)
   - Kursbetegnelse (om det er en kurs)
   - Etikett (vises i skapet)
5. Modul vises med farge og ikon etter type
6. Klikk på eksisterende modul → åpner detaljer / link til kurs

### Farger per modultype (forslag)

| Type | Farge |
|---|---|
| breaker | Blå |
| rcd | Gul |
| rcd_breaker | Grønn |
| shelly | Oransje |
| dynalite | Lilla |
| surge_protection | Rød |
| other | Grå |

---

## Byggrekkefølge

### Fase 1 – Fundament
- [ ] FastAPI-skjelett med CORS og feilhåndtering
- [ ] SQLite-oppsett med SQLModel
- [ ] Modeller: Property, Panel, DinRail, Module, Circuit
- [ ] CRUD-routers for Property og Panel
- [ ] React + Vite + Tailwind oppsett
- [ ] Eiendommer-side (liste + opprett)
- [ ] Skap-konfigurasjonsside (velg rader/moduler)

### Fase 2 – Skap-mockup
- [ ] PanelCanvas-komponent (grid-basert)
- [ ] DinRail-komponent
- [ ] Module-komponent med bredde-drag og fargekoding
- [ ] ModuleDialog med skjema
- [ ] Lagring av moduler mot API

### Fase 3 – Kurs og koblingspunkter
- [ ] Circuit CRUD
- [ ] ConnectionPoint CRUD
- [ ] Kursdetalj-side
- [ ] Koblingspunkt-side
- [ ] Filoppplasting (lokal lagring)
- [ ] Endringslogg-komponent

### Fase 4 – Fastmontert utstyr
- [ ] Equipment-modell og router
- [ ] Utstyrsskjema med typer (varmekabler, elbillader, varmepumpe...)
- [ ] Tilknytning til kurs

### Fase 5 – Eksport og R2
- [ ] PDF-eksport av kursoversikt (WeasyPrint eller ReportLab)
- [ ] R2-sync-service (rclone eller boto3 mot R2)
- [ ] Automatisk R2-upload ved filoppplasting

### Fase 6 – Auth
- [ ] JWT-autentisering (python-jose + passlib)
- [ ] Brukermodell
- [ ] Beskyttede endepunkter
- [ ] Login-side i React

### Fase 7 – Installatørportal

**Datamodell:**
```
ShareLink
├── id
├── property_id        # FK to Property
├── token              # UUID used in URL
├── created_by         # user id (from Phase 6)
├── expires_at         # derived from duration_days
├── duration_days      # 1, 7, 14 or 30
├── is_active          # owner can deactivate manually
├── permissions        # JSON: {connection_points, equipment, files, comments}
└── created_at
```

**Flyt:**
- Eier genererer lenke på eiendomssiden – velger varighet (1, 7, 14, 30 dager) og tillatelser
- URL-format: `http://tavla.local/installer/{token}`
- Installatør åpner lenken → mobilvennlig minimumsvisning av eiendommen
- Viser skap → kurs → installatør kan legge til koblingspunkter, utstyr, filer og kommentarer per kurs
- Utløpte eller deaktiverte lenker returnerer 403
- Eier ser alle genererte lenker med status (aktiv/utløpt/deaktivert) og kan deaktivere manuelt

**Byggrekkefølge:**
- [ ] ShareLink-modell og migrering
- [ ] `POST /api/share` — generer lenke (autentisert)
- [ ] `GET /api/share` — list lenker for eiendom (autentisert)
- [ ] `DELETE /api/share/{token}` — deaktiver lenke (autentisert)
- [ ] `GET /api/installer/{token}` — offentlig endepunkt, validerer token og returnerer eiendomsdata med tillatelser
- [ ] `POST /api/installer/{token}/connection_points` — scoped av tillatelser
- [ ] `POST /api/installer/{token}/equipment` — scoped av tillatelser
- [ ] `POST /api/installer/{token}/files` — scoped av tillatelser
- [ ] `POST /api/installer/{token}/comments` — scoped av tillatelser
- [ ] React-rute `/installer/:token` — mobilfirst minimalt UI på norsk
- [ ] Lenkeadministrasjon på eiendomssiden

---

## Tekniske valg og notater

### Backend
```
fastapi
sqlmodel
uvicorn
python-multipart    # filoppplasting
boto3               # Cloudflare R2 (S3-kompatibel)
weasyprint          # PDF-eksport
python-jose         # JWT (fase 6)
passlib             # passord-hashing (fase 6)
alembic             # databasemigrering
```

### Frontend
```
react + vite
tailwindcss
react-router-dom
@tanstack/react-query   # API-state
axios
react-hook-form         # skjemaer
```

### Cloudflare R2-konfig
R2 eksponeres som S3-kompatibelt API.
Bruk eksisterende `pbs-backup`-bucket-mønster, men eget bucket: `eldok-files`.

```python
# services/r2_sync.py
import boto3

s3 = boto3.client(
    "s3",
    endpoint_url="https://<ACCOUNT_ID>.r2.cloudflarestorage.com",
    aws_access_key_id=R2_ACCESS_KEY,
    aws_secret_access_key=R2_SECRET_KEY,
)
```

### Proxmox LXC
- Ubuntu 22.04 privilegert LXC
- Python 3.11 + Node 20
- Nginx som reverse proxy foran uvicorn
- `/opt/eldok/uploads` for lokal fillagring
- Systemd-service for uvicorn

---

## GitHub-repo

Anbefalt struktur:
```
github.com/jonaskul/eldok
```

Branch-strategi:
- `main` → produksjon
- `dev` → aktiv utvikling
- feature-branches per fase: `feat/panel-mockup`, `feat/file-upload` etc.
