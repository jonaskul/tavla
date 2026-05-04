from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from database import get_session
from models import Module, ModuleType
from schemas import ModuleRead, ModuleUpdate

router = APIRouter()


@router.put("/{module_id}", response_model=ModuleRead)
def update_module(module_id: int, data: ModuleUpdate, session: Session = Depends(get_session)):
    module = session.get(Module, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    fields = data.model_dump(exclude_unset=True)
    effective_type = fields.get("type", module.type)
    effective_vacant = fields.get("is_vacant", module.is_vacant)
    effective_circuit_id = fields.get("circuit_id", module.circuit_id)
    if effective_vacant and effective_circuit_id:
        raise HTTPException(status_code=400, detail="Vacant module cannot be assigned to a circuit")
    if effective_type == ModuleType.main_switch and effective_circuit_id:
        raise HTTPException(status_code=400, detail="Main switch cannot be assigned to a circuit")
    for field, value in fields.items():
        setattr(module, field, value)
    session.add(module)
    session.commit()
    session.refresh(module)
    return ModuleRead.model_validate(module)


@router.delete("/{module_id}", response_model=ModuleRead)
def delete_module(module_id: int, session: Session = Depends(get_session)):
    module = session.get(Module, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    module_data = ModuleRead.model_validate(module)
    session.delete(module)
    session.commit()
    return module_data
