"""Export and import a whole property as JSON.

These two are inverses, and the round-trip test in tests/test_export.py
pins that down. That matters for three separate reasons:

- Data portability. With paying customers this is a GDPR obligation, not
  a nicety.
- Onboarding. It is how a customer arrives with existing documentation
  instead of retyping it.
- Rescue. It is the only way data survives moving between installations.

The export used to omit modules entirely, so a round-trip silently lost
the whole panel layout — the DIN rail placement that the app exists to
record. It now carries everything needed to rebuild a property.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from database import get_session
from models import (
    Channel,
    Circuit,
    ConnectionPoint,
    Equipment,
    Module,
    Panel,
    Property,
)
from schemas import PropertyExport, PropertyRead
from tenancy import CurrentOrg

router = APIRouter()

# Bumped when the shape changes incompatibly, so an old file fails loudly
# instead of importing as something subtly wrong.
FORMAT_VERSION = 2


def _owned_property(property_id: int, session: Session, org_id: int) -> Property:
    prop = session.get(Property, property_id)
    if not prop or prop.organization_id != org_id:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@router.get("/{property_id}")
def export_property(property_id: int, org: CurrentOrg, session: Session = Depends(get_session)):
    prop = _owned_property(property_id, session, org)
    panels = session.exec(select(Panel).where(Panel.property_id == property_id)).all()

    result = {
        "format_version": FORMAT_VERSION,
        "id": prop.id,
        "name": prop.name,
        "address": prop.address,
        "owner_name": prop.owner_name,
        "owner_email": prop.owner_email,
        "owner_phone": prop.owner_phone,
        "created_at": prop.created_at.isoformat(),
        "panels": [],
    }

    for panel in panels:
        modules = session.exec(select(Module).where(Module.panel_id == panel.id)).all()
        circuits = session.exec(select(Circuit).where(Circuit.panel_id == panel.id)).all()

        panel_data: dict = {
            "id": panel.id,
            "name": panel.name,
            "location": panel.location,
            "rows": panel.rows,
            "modules_per_row": panel.modules_per_row,
            "notes": panel.notes,
            # The panel layout. Absent from format 1, which made the export
            # lossy in exactly the place the app is most useful.
            "modules": [
                {
                    "row": m.row,
                    "position": m.position,
                    "width": m.width,
                    "type": m.type,
                    "label": m.label,
                    "ampere": m.ampere,
                    "has_rcd": m.has_rcd,
                    "is_vacant": m.is_vacant,
                    # Original circuit id; the importer remaps it.
                    "circuit_id": m.circuit_id,
                }
                for m in sorted(modules, key=lambda m: (m.row, m.position))
            ],
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
                    {
                        "id": cp.id,
                        "type": cp.type,
                        "location": cp.location,
                        "notes": cp.notes,
                    }
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
                    "notes": e.notes,
                    "channels": [
                        {
                            "id": ch.id,
                            "number": ch.number,
                            "label": ch.label,
                            "load": ch.load,
                            "watt": ch.watt,
                            "channel_type": ch.channel_type,
                            "notes": ch.notes,
                            # A channel may serve a circuit other than the one
                            # its equipment hangs off, so this is a real
                            # reference and not derivable from nesting.
                            "circuit_id": ch.circuit_id,
                        }
                        for ch in sorted(channels, key=lambda c: c.number)
                    ],
                })

            panel_data["circuits"].append(circuit_data)

        result["panels"].append(panel_data)

    return result


@router.post("", response_model=PropertyRead)
def import_property(
    data: PropertyExport, org: CurrentOrg, session: Session = Depends(get_session)
):
    """Recreate an exported property as a new one.

    Always creates; never merges into an existing property. Ids in the file
    are treated as references within it and remapped, so importing the same
    file twice gives two independent properties rather than a conflict.

    The whole import is one transaction: a file that fails partway leaves
    nothing behind, because half a documented installation is worse than
    none.
    """
    if data.format_version > FORMAT_VERSION:
        raise HTTPException(
            status_code=422,
            detail=f"Ukjent filformat (versjon {data.format_version}). Oppdater Tavla.",
        )

    prop = Property(
        name=data.name,
        address=data.address,
        owner_name=data.owner_name,
        owner_email=data.owner_email,
        owner_phone=data.owner_phone,
    )
    session.add(prop)
    session.flush()  # assigns ids without ending the transaction

    # Circuits are referenced by modules and channels that may live under a
    # different panel, so every circuit is created before anything points at
    # one. Maps the file's ids to the new rows'.
    circuit_ids: dict[int, int] = {}
    panel_rows: list[tuple[Panel, object]] = []

    for panel_data in data.panels:
        panel = Panel(
            property_id=prop.id,
            name=panel_data.name,
            location=panel_data.location,
            rows=panel_data.rows,
            modules_per_row=panel_data.modules_per_row,
            notes=panel_data.notes,
        )
        session.add(panel)
        session.flush()
        panel_rows.append((panel, panel_data))

        for circuit_data in panel_data.circuits:
            circuit = Circuit(
                panel_id=panel.id,
                designation=circuit_data.designation,
                name=circuit_data.name,
                room=circuit_data.room,
                cable_type=circuit_data.cable_type,
                cross_section=circuit_data.cross_section,
                conductor_count=circuit_data.conductor_count,
                length_m=circuit_data.length_m,
                notes=circuit_data.notes,
            )
            session.add(circuit)
            session.flush()
            if circuit_data.id is not None:
                circuit_ids[circuit_data.id] = circuit.id

    def remap(old_id):
        """Translate a circuit reference from the file, dropping dangling ones."""
        return circuit_ids.get(old_id) if old_id is not None else None

    for panel, panel_data in panel_rows:
        for m in panel_data.modules:
            session.add(Module(
                panel_id=panel.id,
                row=m.row,
                position=m.position,
                width=m.width,
                type=m.type,
                label=m.label,
                ampere=m.ampere,
                has_rcd=m.has_rcd,
                is_vacant=m.is_vacant,
                circuit_id=remap(m.circuit_id),
            ))

        for circuit_data in panel_data.circuits:
            new_circuit_id = circuit_ids.get(circuit_data.id) if circuit_data.id else None
            if new_circuit_id is None:
                continue

            for cp in circuit_data.connection_points:
                session.add(ConnectionPoint(
                    circuit_id=new_circuit_id,
                    type=cp.type,
                    location=cp.location,
                    notes=cp.notes,
                ))

            for e in circuit_data.equipment:
                equipment = Equipment(
                    circuit_id=new_circuit_id,
                    type=e.type,
                    brand=e.brand,
                    model=e.model,
                    watt=e.watt,
                    notes=e.notes,
                )
                session.add(equipment)
                session.flush()

                for ch in e.channels:
                    session.add(Channel(
                        equipment_id=equipment.id,
                        number=ch.number,
                        label=ch.label,
                        load=ch.load,
                        watt=ch.watt,
                        channel_type=ch.channel_type,
                        notes=ch.notes,
                        circuit_id=remap(ch.circuit_id),
                    ))

    session.commit()
    session.refresh(prop)
    return prop
