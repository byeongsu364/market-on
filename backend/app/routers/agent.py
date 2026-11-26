"""Guest stateless chat endpoint."""

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header

from app.deps import get_db, require_csrf
from app.schemas.chat import ChatRequest, ChatResponse
from app.services.agent import agent_service

router = APIRouter(tags=['chat'])


@router.post('/chat', response_model=ChatResponse, dependencies=[Depends(require_csrf)])
def chat(
    data: ChatRequest, x_device_id: Annotated[UUID, Header()], conn: Annotated[Any, Depends(get_db)]
):
    return agent_service.chat(conn, data, x_device_id)
