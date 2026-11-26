"""Ordered model routing with bounded attempts and metadata-only auditing."""

import logging
from collections.abc import Callable
from concurrent.futures import Future
from dataclasses import dataclass
from threading import Thread
from time import monotonic
from typing import Generic, TypeVar

from app.core.config import settings
from app.core.errors import AppError
from app.db.repositories import llm_call_repo

from . import quota
from .base import LLMProvider
from .factory import _provider
from .limits import EXTERNAL_PROVIDERS, PROVIDER_TIMEOUTS

T = TypeVar('T')
logger = logging.getLogger(__name__)


@dataclass
class Routed(Generic[T]):
    value: T
    provider: str
    model: str
    escalated: bool
    reason: str | None


def model_name(name):
    if name in ('gemma', 'ollama'):
        return settings.OLLAMA_CHAT_MODEL
    if name == 'openai':
        return 'openai:' + (settings.OPENAI_CHAT_MODEL or '')
    if name == 'gemini':
        return 'gemini:' + settings.GEMINI_CHAT_MODEL
    return name


def _bounded(call, provider, timeout):
    future = Future()

    def invoke():
        try:
            future.set_result(call(provider))
        except BaseException as exc:  # noqa: BLE001 - propagate worker failures through Future
            future.set_exception(exc)

    Thread(target=invoke, daemon=True).start()
    return future.result(timeout=timeout)


def _configured(name):
    if name == 'openai':
        return bool(
            (settings.OPENAI_API_KEY or '').strip() and (settings.OPENAI_CHAT_MODEL or '').strip()
        )
    if name in ('gemma', 'ollama'):
        return bool((settings.OLLAMA_BASE_URL or '').strip() and settings.OLLAMA_CHAT_MODEL.strip())
    if name == 'gemini':
        return bool((settings.GEMINI_API_KEY or '').strip())
    return True


def run(
    role: str,
    call: Callable[[LLMProvider], T],
    accept: Callable[[T], str | None] = lambda _: None,
    *,
    task: str | None = None,
    audit: bool = True,
) -> Routed[T]:
    """role(route·plan·extract·write·reason)의 모델 순서대로 부름. task는 기록용 요청 이름(ask·chat…)."""
    record = llm_call_repo.record if audit else lambda **kwargs: None
    names = [
        name
        for name in (['gemma'] if role == 'translate' else settings.LLM_ROUTES.get(role, []))
        if _configured(name)
    ]
    task = task or role
    last_error = AppError('LLM_NOT_CONFIGURED', '사용 가능한 모델이 없습니다.', 503)
    reason = None
    fallback = None
    for index, name in enumerate(names):
        if name in EXTERNAL_PROVIDERS:
            limited = quota.take(name)
            if limited:
                # 외부 AI 사용 규칙에 걸리면 부르지 않고 다음 모델로 (젬마 답이 있으면 그걸 돌려줌)
                record(
                    task=task,
                    role=role,
                    provider=name,
                    model=model_name(name),
                    ms=0,
                    escalated=index > 0,
                    reason=limited,
                    ok=False,
                )
                last_error = AppError('LLM_LIMITED', '외부 AI 사용 한도에 도달했어요.', 503)
                continue
        start = monotonic()
        rejected = None
        ok = False
        try:
            provider = _provider(name)
            value = _bounded(call, provider, PROVIDER_TIMEOUTS.get(name, 45.0))
            rejected = accept(value)
            ok = True
        except Exception as exc:  # noqa: BLE001 - model failures advance the configured route
            last_error = exc
            reason = 'error'
            # 질문·답 내용은 남기지 않고 오류 종류만 (예: GEMINI_UNAVAILABLE, ReadTimeout)
            logger.warning(
                '%s 역할 %s 실패: %s', role, name, getattr(exc, 'code', None) or type(exc).__name__
            )
        finally:
            record(
                task=task,
                role=role,
                provider=name,
                model=model_name(name),
                ms=int((monotonic() - start) * 1000),
                escalated=index > 0,
                reason=reason if not ok else (rejected or reason),
                ok=ok,
            )
        if ok:
            if rejected is None or index == len(names) - 1:
                return Routed(value, name, model_name(name), index > 0, reason or rejected)
            reason = rejected
            # 다음 모델이 모두 실패해도 이 답은 돌려줄 수 있게 남겨 둠 (GPT 장애로 기존 동작이 나빠지지 않게)
            fallback = Routed(value, name, model_name(name), index > 0, rejected)
    if fallback is not None:
        return fallback
    raise last_error
