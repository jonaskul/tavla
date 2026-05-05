from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from database import get_session
from models import Module, ModuleTypeDefinition, Panel
from schemas import ModuleRead, ModuleUpdate

router = APIRouter()


@router.put("/{module_id}", response_model=ModuleRead)
def update_module(module_id: int, data: ModuleUpdate, session: Session = Depends(get_session)):
    module = session.get(Module, module_id)
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")

    fields = data.model_dump(exclude_unset=True)

    new_row = fields.get("row", module.row)
    new_pos = fields.get("position", module.position)
    new_width = fields.get("width", module.width)

    # Validate position when row/position/width changes
    if "row" in fields or "position" in fields or "width" in fields:
        panel = session.get(Panel, module.panel_id)
        if panel and new_pos + new_width > panel.modules_per_row:
            raise HTTPException(status_code=422, detail="Posisjon er utenfor skapets grenser")

        others = session.exec(
            select(Module).where(
                Module.panel_id == module.panel_id,
                Module.id != module_id,
                Module.row == new_row,
            )
        ).all()
        occupied = set()
        for m in others:
            for i in range(m.width):
                occupied.add(m.position + i)
        target = set(range(new_pos, new_pos + new_width))
        if target & occupied:
            raise HTTPException(status_code=409, detail="Posisjon er opptatt av en annen modul")

    effective_type = fields.get("type", module.type)
    effective_vacant = fields.get("is_vacant", module.is_vacant)
    effective_circuit_id = fields.get("circuit_id", module.circuit_id)

    mtd = session.exec(
        select(ModuleTypeDefinition).where(ModuleTypeDefinition.key == effective_type)
    ).first()
    if "type" in fields and not mtd:
        raise HTTPException(status_code=422, detail=f"Unknown module type: {effective_type}")

    if effective_vacant and effective_circuit_id:
        raise HTTPException(status_code=400, detail="Vacant module cannot be assigned to a circuit")
    if mtd and not mtd.can_have_circuit and effective_circuit_id:
        raise HTTPException(
            status_code=400, detail=f"Module type '{effective_type}' cannot be assigned to a circuit"
        )

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
