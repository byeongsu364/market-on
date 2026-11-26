"""Source-backed recipe shopping endpoints."""

from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query

from app.deps import get_db
from app.services import recipe_service

router = APIRouter(prefix='/recipes', tags=['recipes'])
Weather = Literal['cold', 'hot', 'rain', 'snow', 'clear']


@router.get('')
def recipes(
    item_id: str | None = None,
    market_id: str | None = None,
    month: int | None = Query(None, ge=1, le=12),
    weather: Weather | None = None,
    q: str | None = Query(None, max_length=200),
    limit: int = Query(3, ge=1, le=20),
    conn: Annotated[Any, Depends(get_db)] = None,
):
    return recipe_service.find_recipes(
        conn, item_id=item_id, market_id=market_id, month=month, weather=weather, q=q, limit=limit
    )


@router.get('/{recipe_id}')
def recipe(
    recipe_id: str, market_id: str | None = None, conn: Annotated[Any, Depends(get_db)] = None
):
    return recipe_service.get_recipe(conn, recipe_id, market_id=market_id)
