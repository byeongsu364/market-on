# FastAPI dependency defaults are intentional.
# ruff: noqa: B008
"""Guest evidence-backed questions."""

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header

from app.core.language import preferred_language
from app.deps import get_db, require_csrf
from app.schemas.ask import AskRequest, AskResponse
from app.services import ask_service

router = APIRouter(tags=['ask'])


@router.post('/ask', response_model=AskResponse, dependencies=[Depends(require_csrf)])
def ask(
    data: AskRequest,
    x_device_id: Annotated[UUID, Header()],
    lang=Depends(preferred_language),
    conn: Annotated[Any, Depends(get_db)] = None,
):
    if 'lang' not in data.model_fields_set:
        data.lang = lang
    return ask_service.ask(conn, data, x_device_id)
