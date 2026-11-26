# FastAPI dependency defaults are intentional.
# ruff: noqa: B008
"""Public item reads."""

from fastapi import APIRouter, Depends, Query

from app.core.language import preferred_language, present
from app.deps import get_db
from app.schemas.item import InSeasonItem, Item
from app.services import item_service

router = APIRouter(prefix='/items', tags=['items'])


@router.get('/search', response_model=list[Item])
def search(q: str = '', conn=Depends(get_db), lang=Depends(preferred_language)):
    return item_service.search(conn, q, lang)


@router.get('/in-season', response_model=list[InSeasonItem])
def in_season(
    month: int | None = Query(default=None, ge=1, le=12),
    conn=Depends(get_db),
    lang=Depends(preferred_language),
):
    return present(conn, item_service.in_season(conn, month), lang)


@router.get('/{item_id}', response_model=Item)
def get_item(item_id: str, lang=Depends(preferred_language), conn=Depends(get_db)):
    return item_service.get_item(conn, item_id, lang)


@router.get('/{item_id}/varieties')
def varieties(item_id: str, conn=Depends(get_db), lang=Depends(preferred_language)):
    from app.services.price_service import list_varieties

    return present(conn, list_varieties(conn, item_id), lang)
