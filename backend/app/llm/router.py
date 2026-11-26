"""Ordered model routing with bounded attempts and metadata-only auditing."""

from concurrent.futures import Future
from dataclasses import dataclass
from threading import Thread
from time import monotonic
from typing import Callable, Generic, TypeVar

from app.core.config import settings
from app.core.errors import AppError
from app.db.repositories import llm_call_repo
from .base import LLMProvider
from .factory import _provider
from . import quota
from .limits import EXTERNAL_PROVIDERS, PROVIDER_TIMEOUTS

T = TypeVar('T')


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
        except BaseException as exc:
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
    task: str,
    call: Callable[[LLMProvider], T],
    accept: Callable[[T], str | None] = lambda _: None,
) -> Routed[T]:
    names = [name for name in settings.LLM_ROUTES.get(task, []) if _configured(name)]
    last_error = AppError('LLM_NOT_CONFIGURED', '사용 가능한 모델이 없습니다.', 503)
    reason = None
    fallback = None
    for index, name in enumerate(names):
        if name in EXTERNAL_PROVIDERS:
            limited = quota.take(name)
            if limited:
                # 외부 AI 사용 규칙에 걸리면 부르지 않고 다음 모델로 (젬마 답이 있으면 그걸 돌려줌)
                llm_call_repo.record(
                    task=task,
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
        except Exception as exc:
            last_error = exc
            reason = 'error'
        finally:
            llm_call_repo.record(
                task=task,
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
