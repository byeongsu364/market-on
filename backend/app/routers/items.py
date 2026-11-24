"""Public item reads."""

from fastapi import APIRouter, Depends

from app.deps import get_db
from app.schemas.item import Item
from app.services import item_service

router = APIRouter(prefix='/items', tags=['items'])


@router.get('/search', response_model=list[Item])
def search(q: str = '', conn=Depends(get_db)):
    return item_service.search(conn, q)


@router.get('/{item_id}', response_model=Item)
def get_item(item_id: str, lang: str = 'ko', conn=Depends(get_db)):
    return item_service.get_item(conn, item_id, lang)
