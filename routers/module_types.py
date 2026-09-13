from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlmodel import Session, select
from typing import Dict, List, Optional

from database import get_session
from models import Module, ModuleTypeDefinition
from schemas import ModuleTypeDefinitionCreate, ModuleTypeDefinitionRead, ModuleTypeDefinitionUpdate
from tenancy import CurrentOrg

router = APIRouter()

BUILTIN_TYPES = [
    {"key": "breaker",          "name_no": "Automatsikring",     "color": "#2563eb", "abbreviation": "LS", "can_have_circuit": True,  "can_have_ampere": True},
    {"key": "rcd",              "name_no": "Jordfeilbryter",     "color": "#ca8a04", "abbreviation": "JF", "can_have_circuit": False, "can_have_ampere": True},
    {"key": "rcd_breaker",      "name_no": "Kombibryter",        "color": "#16a34a", "abbreviation": "KO", "can_have_circuit": True,  "can_have_ampere": True},
    {"key": "shelly",           "name_no": "Shelly",             "color": "#ea580c", "abbreviation": "SH", "can_have_circuit": False, "can_have_ampere": False},
    {"key": "dynalite",         "name_no": "Dynalite",           "color": "#9333ea", "abbreviation": "DY", "can_have_circuit": False, "can_have_ampere": False},
    {"key": "surge_protection", "name_no": "Overspenningsvern",  "color": "#dc2626", "abbreviation": "OV", "can_have_circuit": False, "can_have_ampere": False},
    {"key": "main_switch",      "name_no": "Hovedbryter (OV50)", "color": "#374151", "abbreviation": "OV", "can_have_circuit": False, "can_have_ampere": True},
    {"key": "other",            "name_no": "Annet",              "color": "#6b7280", "abbreviation": "—",  "can_have_circuit": False, "can_have_ampere": False},
]


def seed_builtin_types(session: Session) -> None:
    """Insert any built-in type this database does not have yet.

    Built-ins carry organization_id = NULL and are shared by every tenant.
    Upserting per key rather than bailing out when the table is non-empty:
    the old version returned early if any row existed, so a type added to
    BUILTIN_TYPES later never reached an existing install.
    """
    existing = {
        row.key
        for row in session.exec(
            select(ModuleTypeDefinition).where(ModuleTypeDefinition.is_builtin == True)  # noqa: E712
        ).all()
    }
    added = False
    for data in BUILTIN_TYPES:
        if data["key"] in existing:
            continue
        session.add(ModuleTypeDefinition(is_builtin=True, organization_id=None, **data))
        added = True
    if added:
        session.commit()


def _usage_counts(session: Session, org_id: int) -> Dict[str, int]:
    """How many modules use each type, in one query rather than one per type."""
    rows = session.exec(
        select(Module.type, func.count(Module.id))
        .where(Module.organization_id == org_id)
        .group_by(Module.type)
    ).all()
    return {key: count for key, count in rows}


def _visible(session: Session, org_id: int) -> List[ModuleTypeDefinition]:
    """Built-in types plus this organization's own.

    Where an organization has customised a built-in, its version shadows the
    shared one — same key, one entry. See update_module_type.
    """
    rows = session.exec(
        select(ModuleTypeDefinition).where(
            (ModuleTypeDefinition.organization_id == org_id)
            | (ModuleTypeDefinition.organization_id == None)  # noqa: E711
        )
    ).all()
    by_key: Dict[str, ModuleTypeDefinition] = {}
    for row in rows:
        if row.key not in by_key or row.organization_id is not None:
            by_key[row.key] = row
    return list(by_key.values())


def _read(mtd: ModuleTypeDefinition, counts: Dict[str, int]) -> ModuleTypeDefinitionRead:
    d = ModuleTypeDefinitionRead.model_validate(mtd)
    d.usage_count = counts.get(mtd.key, 0)
    return d


def _get_visible(type_id: int, session: Session, org_id: int) -> ModuleTypeDefinition:
    mtd = session.get(ModuleTypeDefinition, type_id)
    if not mtd or mtd.organization_id not in (org_id, None):
        raise HTTPException(status_code=404, detail="Module type not found")
    return mtd


@router.get("", response_model=List[ModuleTypeDefinitionRead])
def list_module_types(org: CurrentOrg, session: Session = Depends(get_session)):
    counts = _usage_counts(session, org)
    result = [_read(row, counts) for row in _visible(session, org)]
    return sorted(result, key=lambda r: (0 if r.is_builtin else 1, r.name_no))


@router.get("/{type_id}", response_model=ModuleTypeDefinitionRead)
def get_module_type(type_id: int, org: CurrentOrg, session: Session = Depends(get_session)):
    mtd = _get_visible(type_id, session, org)
    return _read(mtd, _usage_counts(session, org))


@router.post("", response_model=ModuleTypeDefinitionRead)
def create_module_type(
    data: ModuleTypeDefinitionCreate, org: CurrentOrg, session: Session = Depends(get_session)
):
    # A key must be unique among what this organization can see, which
    # includes the shared built-ins.
    if any(row.key == data.key for row in _visible(session, org)):
        raise HTTPException(status_code=400, detail="Module type key already exists")
    mtd = ModuleTypeDefinition(is_builtin=False, organization_id=org, **data.model_dump())
    session.add(mtd)
    session.commit()
    session.refresh(mtd)
    return _read(mtd, _usage_counts(session, org))


@router.put("/{type_id}", response_model=ModuleTypeDefinitionRead)
def update_module_type(
    type_id: int,
    data: ModuleTypeDefinitionUpdate,
    org: CurrentOrg,
    session: Session = Depends(get_session),
):
    mtd = _get_visible(type_id, session, org)
    changes = data.model_dump(exclude_unset=True)

    if mtd.organization_id is None:
        # Built-ins are shared by every tenant, so editing one in place would
        # change it for everyone. Copy on write instead: this organization
        # gets its own version, which shadows the shared one by key. Deleting
        # that copy later reverts to the default.
        mtd = ModuleTypeDefinition(
            organization_id=org,
            key=mtd.key,
            is_builtin=True,
            name_no=changes.get("name_no", mtd.name_no),
            color=changes.get("color", mtd.color),
            abbreviation=changes.get("abbreviation", mtd.abbreviation),
            can_have_circuit=changes.get("can_have_circuit", mtd.can_have_circuit),
            can_have_ampere=changes.get("can_have_ampere", mtd.can_have_ampere),
        )
    else:
        for field, value in changes.items():
            setattr(mtd, field, value)

    session.add(mtd)
    session.commit()
    session.refresh(mtd)
    return _read(mtd, _usage_counts(session, org))


@router.delete("/{type_id}", response_model=ModuleTypeDefinitionRead)
def delete_module_type(type_id: int, org: CurrentOrg, session: Session = Depends(get_session)):
    mtd = _get_visible(type_id, session, org)
    if mtd.organization_id is None:
        # Shared across every tenant — not this organization's to remove.
        raise HTTPException(status_code=409, detail="Built-in types cannot be deleted")
    counts = _usage_counts(session, org)
    count = counts.get(mtd.key, 0)
    if count > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot delete: {count} module(s) use this type",
        )
    snapshot = ModuleTypeDefinitionRead.model_validate(mtd)
    snapshot.usage_count = 0
    session.delete(mtd)
    session.commit()
    return snapshot


@router.get("/{key}/usage")
def get_module_type_usage(key: str, org: CurrentOrg, session: Session = Depends(get_session)):
    return {"key": key, "count": _usage_counts(session, org).get(key, 0)}
