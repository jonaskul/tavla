from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List

from database import get_session
from models import Module, ModuleTypeDefinition
from schemas import ModuleTypeDefinitionCreate, ModuleTypeDefinitionRead, ModuleTypeDefinitionUpdate

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
    existing = session.exec(select(ModuleTypeDefinition)).first()
    if existing:
        return
    for data in BUILTIN_TYPES:
        session.add(ModuleTypeDefinition(is_builtin=True, **data))
    session.commit()


def _with_usage(mtd: ModuleTypeDefinition, session: Session) -> ModuleTypeDefinitionRead:
    d = ModuleTypeDefinitionRead.model_validate(mtd)
    d.usage_count = len(session.exec(select(Module).where(Module.type == mtd.key)).all())
    return d


@router.get("", response_model=List[ModuleTypeDefinitionRead])
def list_module_types(session: Session = Depends(get_session)):
    rows = session.exec(select(ModuleTypeDefinition)).all()
    result = [_with_usage(row, session) for row in rows]
    return sorted(result, key=lambda r: (0 if r.is_builtin else 1, r.name_no))


@router.get("/{type_id}", response_model=ModuleTypeDefinitionRead)
def get_module_type(type_id: int, session: Session = Depends(get_session)):
    mtd = session.get(ModuleTypeDefinition, type_id)
    if not mtd:
        raise HTTPException(status_code=404, detail="Module type not found")
    return _with_usage(mtd, session)


@router.post("", response_model=ModuleTypeDefinitionRead)
def create_module_type(data: ModuleTypeDefinitionCreate, session: Session = Depends(get_session)):
    if session.exec(select(ModuleTypeDefinition).where(ModuleTypeDefinition.key == data.key)).first():
        raise HTTPException(status_code=400, detail="Module type key already exists")
    mtd = ModuleTypeDefinition(is_builtin=False, **data.model_dump())
    session.add(mtd)
    session.commit()
    session.refresh(mtd)
    return _with_usage(mtd, session)


@router.put("/{type_id}", response_model=ModuleTypeDefinitionRead)
def update_module_type(
    type_id: int, data: ModuleTypeDefinitionUpdate, session: Session = Depends(get_session)
):
    mtd = session.get(ModuleTypeDefinition, type_id)
    if not mtd:
        raise HTTPException(status_code=404, detail="Module type not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(mtd, field, value)
    session.add(mtd)
    session.commit()
    session.refresh(mtd)
    return _with_usage(mtd, session)


@router.delete("/{type_id}", response_model=ModuleTypeDefinitionRead)
def delete_module_type(type_id: int, session: Session = Depends(get_session)):
    mtd = session.get(ModuleTypeDefinition, type_id)
    if not mtd:
        raise HTTPException(status_code=404, detail="Module type not found")
    count = len(session.exec(select(Module).where(Module.type == mtd.key)).all())
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
def get_module_type_usage(key: str, session: Session = Depends(get_session)):
    count = len(session.exec(select(Module).where(Module.type == key)).all())
    return {"key": key, "count": count}
