"""Guest price report writes with CSRF and anonymous device headers."""

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header

from app.deps import get_db, require_csrf
from app.schemas.price_report import PriceReportRequest, PriceReportResponse
from app.services import price_report_service

router = APIRouter(tags=['price-reports'])


@router.post(
    '/price-reports',
    status_code=201,
    response_model=PriceReportResponse,
    dependencies=[Depends(require_csrf)],
)
def submit(
    data: PriceReportRequest,
    x_device_id: Annotated[UUID, Header()],
    conn: Annotated[Any, Depends(get_db)],
):
    return price_report_service.submit(conn, data, x_device_id)
