"""앱 생성 및 라우터 등록. 허용 의존성: routers, core 및 db 풀 종료."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from app.db.pool import close_pool
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.errors import AppError, app_error_handler, validation_error_handler
from app.core.logging import setup_logging
from app.routers import (
    scan,
    price,
    merchant,
    stores,
    recipe,
    card,
    agent,
    auth,
    admin,
    sales,
    items,
    markets,
)

setup_logging()
routers = [
    scan.router,
    price.router,
    merchant.router,
    stores.router,
    recipe.router,
    card.router,
    agent.router,
    auth.router,
    admin.router,
    sales.router,
    items.router,
    markets.router,
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        yield
    finally:
        close_pool()


app = FastAPI(
    lifespan=lifespan,
    title='Market-On',
    openapi_tags=[{'name': router.tags[0]} for router in routers],
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
for router in routers:
    app.include_router(router)


@app.get('/health')
def health() -> dict[str, str]:
    return {'status': 'ok'}
