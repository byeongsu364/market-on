"""공통 예외와 응답. 허용 의존성: FastAPI."""

from fastapi import Request
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 500):
        super().__init__(message)
        self.code, self.message, self.status_code = code, message, status_code


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code, content={'error': {'code': exc.code, 'message': exc.message}}
    )


async def validation_error_handler(request: Request, exc) -> JSONResponse:
    # Pydantic errors may include the raw password input. Never echo request data.
    return JSONResponse(
        status_code=422,
        content={'error': {'code': 'VALIDATION_ERROR', 'message': '요청 값을 확인하세요.'}},
    )
