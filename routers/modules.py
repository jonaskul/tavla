from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from database import get_session
from models import Module
from schemas import ModuleRead, ModuleUpdate

router = APIRouter()


@router.put("/{module_id}", response_model=ModuleRead)
def update_module(module_id: int, data: ModuleUpdate, session: Session = Depends(get_session)):
    module = session.get(Module, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    for field, value in data.model_dump(exclude_unset=True).items():
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
