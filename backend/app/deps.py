"""FastAPI dependencies: DB/LLM providers and service-backed authorization."""

from __future__ import annotations

from collections.abc import Iterator
from typing import TYPE_CHECKING

from fastapi import Depends, Request
from app.core.errors import AppError
from app.services import auth_service

if TYPE_CHECKING:
    from psycopg import Connection
from app.db import pool
from app.llm.base import LLMProvider
from app.llm.factory import get_llm


def get_db() -> Iterator[Connection]:
    with pool.connection() as conn:
        yield conn


def get_llm_dep() -> LLMProvider:
    return get_llm()


def require_csrf(request: Request):
    if (
        request.method in ('POST', 'PATCH', 'DELETE')
        and request.headers.get('X-Requested-With') != 'market-on'
    ):
        raise AppError('CSRF_REQUIRED', '요청 헤더를 확인하세요.', 403)


def current_user(request: Request, conn=Depends(get_db)):
    return auth_service.current(conn, request.cookies.get('mo_session'))


def require_merchant(user=Depends(current_user)):
    if user['role'] != 'merchant' or user['status'] != 'approved':
        raise AppError('NOT_APPROVED', '시장 관리자가 확인하면 열려요', 403)
    return user


def require_operator(user=Depends(current_user)):
    if user['role'] != 'operator' or user['status'] != 'approved':
        raise AppError('FORBIDDEN', '운영자 권한이 필요합니다.', 403)
    return user


def require_market_admin(user=Depends(current_user)):
    if user['role'] != 'market_admin' or user['status'] != 'approved':
        raise AppError('FORBIDDEN', '시장 관리자 권한이 필요합니다.', 403)
    return user
