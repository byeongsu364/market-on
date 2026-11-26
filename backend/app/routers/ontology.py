"""Public read-only graph for presentations and review."""

from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.core.errors import AppError
from app.db.repositories import ontology_repo
from app.deps import get_db

router = APIRouter(prefix='/ontology', tags=['ontology'])


@router.get('/items/{item_id}/graph')
def graph(
    item_id: str,
    conn: Annotated[object, Depends(get_db)],
    depth: int = Query(default=1, ge=1, le=2),
):
    result = ontology_repo.graph(conn, item_id, depth)
    if result is None:
        raise AppError('NOT_FOUND', '품목을 찾을 수 없어요.', 404)
    return result
