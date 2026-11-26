"""앱 생성 및 라우터 등록. 허용 의존성: routers, core 및 db 풀 종료."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from app.db.pool import close_pool
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.schemas.market import PublicConfig
from app.core.errors import AppError, app_error_handler, validation_error_handler
from app.core.logging import setup_logging
from app.routers import (
    recommend,
    ask,
    scan,
    price,
    merchant,
    stores,
    recipe,
    card,
    agent,
    auth,
    admin,
    market_admin,
    sales,
    items,
    markets,
    price_reports,
    join,
)

setup_logging()
routers = [
    recommend.router,
    ask.router,
    scan.router,
    price.router,
    price.plural_router,
    merchant.router,
    stores.router,
    recipe.router,
    card.router,
    agent.router,
    auth.router,
    admin.router,
    market_admin.router,
    sales.router,
    items.router,
    markets.router,
    price_reports.router,
    join.router,
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


@app.get('/config/public', response_model=PublicConfig)
def public_config():
    return PublicConfig(naver_map_client_id=settings.NAVER_MAP_CLIENT_ID)
