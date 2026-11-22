"""지연 생성 및 재사용 Supabase 클라이언트. 허용 의존성: core 및 supabase."""
from functools import lru_cache
from supabase import Client, create_client
from app.core.config import settings
from app.core.errors import AppError

@lru_cache(maxsize=1)
def get_supabase() -> Client:
    if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
        raise AppError('DB_NOT_CONFIGURED', 'Supabase 설정이 필요합니다.', 503)
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
