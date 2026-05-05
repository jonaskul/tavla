from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from database import get_session
from models import Channel, Circuit, ConnectionPoint, Equipment, Panel, Property

router = APIRouter()


@router.get("/{property_id}")
def export_property(property_id: int, session: Session = Depends(get_session)):
    prop = session.get(Property, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    panels = session.exec(select(Panel).where(Panel.property_id == property_id)).all()

    result = {
        "id": prop.id,
        "name": prop.name,
        "address": prop.address,
        "created_at": prop.created_at.isoformat(),
        "panels": [],
    }

    for panel in panels:
        circuits = session.exec(
            select(Circuit).where(Circuit.panel_id == panel.id)
        ).all()

        panel_data: dict = {
            "id": panel.id,
            "name": panel.name,
            "location": panel.location,
            "rows": panel.rows,
            "modules_per_row": panel.modules_per_row,
            "notes": panel.notes,
            "circuits": [],
        }

        for circuit in circuits:
            cps = session.exec(
                select(ConnectionPoint).where(ConnectionPoint.circuit_id == circuit.id)
            ).all()
            equip = session.exec(
                select(Equipment).where(Equipment.circuit_id == circuit.id)
            ).all()

            circuit_data: dict = {
                "id": circuit.id,
                "designation": circuit.designation,
                "name": circuit.name,
                "room": circuit.room,
                "cable_type": circuit.cable_type,
                "cross_section": circuit.cross_section,
                "conductor_count": circuit.conductor_count,
                "length_m": circuit.length_m,
                "notes": circuit.notes,
                "connection_points": [
                    {"id": cp.id, "type": cp.type, "location": cp.location}
                    for cp in cps
                ],
                "equipment": [],
            }

            for e in equip:
                channels = session.exec(
                    select(Channel).where(Channel.equipment_id == e.id)
                ).all()
                circuit_data["equipment"].append({
                    "id": e.id,
                    "type": e.type,
                    "brand": e.brand,
                    "model": e.model,
                    "watt": e.watt,
                    "channels": [
                        {
                            "id": ch.id,
                            "number": ch.number,
                            "label": ch.label,
                            "load": ch.load,
                            "watt": ch.watt,
                            "channel_type": ch.channel_type,
                        }
                        for ch in sorted(channels, key=lambda c: c.number)
                    ],
                })

            panel_data["circuits"].append(circuit_data)

        result["panels"].append(panel_data)

    return result
