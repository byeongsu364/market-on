"""recipe 요청 라우터. 허용 의존성: services, schemas, core, deps."""
from fastapi import APIRouter

router = APIRouter(prefix='/recipe', tags=['recipe'])
