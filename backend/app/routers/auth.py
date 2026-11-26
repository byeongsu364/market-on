# FastAPI dependency defaults are intentional.
# ruff: noqa: B008
"""Authentication transport and secure cookie settings."""

from typing import Literal

from fastapi import APIRouter, Depends, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core import captcha
from app.core.config import settings
from app.core.errors import AppError
from app.deps import current_user, get_db, require_csrf
from app.schemas.merchant import Credentials, Signup
from app.services import auth_service

router = APIRouter(prefix='/auth', tags=['auth'], dependencies=[Depends(require_csrf)])


def authenticated(response, result):
    user, token = result
    response.set_cookie(
        'mo_session',
        token,
        max_age=settings.SESSION_DAYS * 86400,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite='lax',
        path='/',
    )
    return {'user': user}


@router.get('/captcha')
def new_captcha(response: Response):
    response.headers['Cache-Control'] = 'no-store'
    return captcha.issue()


@router.post('/signup', status_code=201)
def signup(data: Signup, response: Response, conn=Depends(get_db)):
    return authenticated(response, auth_service.signup(conn, data))


@router.post('/login')
def login(data: Credentials, response: Response, conn=Depends(get_db)):
    result = auth_service.login(conn, data)
    if isinstance(result, AppError):
        return JSONResponse(
            status_code=result.status_code,
            content={'error': {'code': result.code, 'message': result.message}},
        )
    return authenticated(response, result)


@router.post('/logout', status_code=204)
def logout(request: Request, response: Response, user=Depends(current_user), conn=Depends(get_db)):
    auth_service.logout(conn, request.cookies.get('mo_session'))
    response.delete_cookie(
        'mo_session', path='/', secure=settings.COOKIE_SECURE, httponly=True, samesite='lax'
    )


@router.get('/me')
def me(user=Depends(current_user), conn=Depends(get_db)):
    return {'user': auth_service.public_user(conn, user)}


class LanguagePreference(BaseModel):
    lang: Literal['ko', 'en', 'zh', 'ja', 'vi']


@router.patch('/me')
def language(data: LanguagePreference, user=Depends(current_user), conn=Depends(get_db)):
    conn.execute('update users set lang=%s where id=%s', (data.lang, user['id']))
    return {'lang': data.lang}
