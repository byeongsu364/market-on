"""사진 인식 요청 라우팅. 업로드는 FastAPI UploadFile(python-multipart)로 받아요. 허용 의존성: services."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, UploadFile

from app.core.errors import AppError
from app.deps import get_db
from app.schemas.scan import RecognizeResponse
from app.services import scan_service

router = APIRouter(tags=['scan'])


async def read_limited(upload: UploadFile | None, field: str) -> bytes:
    """업로드 파일을 최대 크기 + 1바이트까지만 읽어요 (큰 파일을 메모리에 다 올리지 않음)."""
    if upload is None or not upload.filename:
        raise AppError('VALIDATION_ERROR', f'{field} 파일 필드가 필요합니다.', 422)
    data = await upload.read(scan_service.MAX_IMAGE_BYTES + 1)
    if len(data) > scan_service.MAX_IMAGE_BYTES:
        raise AppError('IMAGE_TOO_LARGE', '사진은 최대 8MB까지 지원합니다.', 413)
    return data


@router.post('/recognize', response_model=RecognizeResponse)
async def recognize(
    conn: Annotated[Any, Depends(get_db)],
    photo: Annotated[UploadFile | None, File()] = None,
):
    image = await read_limited(photo, 'photo')
    return await scan_service.recognize(conn, image)
