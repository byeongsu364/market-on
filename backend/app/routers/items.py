"""Public item reads."""

from fastapi import APIRouter, Depends, Query

from app.deps import get_db
from app.schemas.item import Item, InSeasonItem
from app.services import item_service

router = APIRouter(prefix='/items', tags=['items'])


@router.get('/search', response_model=list[Item])
def search(q: str = '', conn=Depends(get_db)):
    return item_service.search(conn, q)


@router.get('/in-season', response_model=list[InSeasonItem])
def in_season(month: int | None = Query(default=None, ge=1, le=12), conn=Depends(get_db)):
    return item_service.in_season(conn, month)


@router.get('/{item_id}', response_model=Item)
def get_item(item_id: str, lang: str = 'ko', conn=Depends(get_db)):
    return item_service.get_item(conn, item_id, lang)


@router.get('/{item_id}/varieties')
def varieties(item_id: str, conn=Depends(get_db)):
    from app.services.price_service import list_varieties

    return list_varieties(conn, item_id)
