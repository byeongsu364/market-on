"""FastAPI 의존성 공급. 허용 의존성: db 및 llm."""
from supabase import Client
from app.db.client import get_supabase
from app.llm.base import LLMProvider
from app.llm.factory import get_llm

def get_db() -> Client:
    return get_supabase()

def get_llm_dep() -> LLMProvider:
    return get_llm()
