from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from database import get_session
from models import Channel
from schemas import ChannelRead, ChannelUpdate

router = APIRouter()


@router.put("/{channel_id}", response_model=ChannelRead)
def update_channel(
    channel_id: int, data: ChannelUpdate, session: Session = Depends(get_session)
):
    channel = session.get(Channel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(channel, field, value)
    session.add(channel)
    session.commit()
    session.refresh(channel)
    return channel


@router.delete("/{channel_id}", response_model=ChannelRead)
def delete_channel(channel_id: int, session: Session = Depends(get_session)):
    channel = session.get(Channel, channel_id)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    data = ChannelRead.model_validate(channel)
    session.delete(channel)
    session.commit()
    return data
