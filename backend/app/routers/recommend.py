"""Guest shopping composition endpoint."""

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header

from app.deps import get_db, require_csrf
from app.schemas.recommend import RecommendRequest, RecommendResponse
from app.services import recommend_service

router = APIRouter(tags=['recommend'])


@router.post('/recommend', response_model=RecommendResponse, dependencies=[Depends(require_csrf)])
def recommend(
    data: RecommendRequest,
    x_device_id: Annotated[UUID, Header()],
    conn: Annotated[Any, Depends(get_db)],
):
    return recommend_service.recommend(conn, data, x_device_id)
