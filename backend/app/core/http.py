"""공통 외부 HTTP 전송과 두 번 재시도. 허용 의존성: core 및 httpx."""
import asyncio
import logging
import time
from typing import Any
import httpx

logger = logging.getLogger(__name__)


def _retryable(exc: Exception) -> bool:
    if isinstance(exc, (httpx.ConnectError, httpx.TimeoutException)):
        return True
    return isinstance(exc, httpx.HTTPStatusError) and (
        exc.response.status_code == 429 or 500 <= exc.response.status_code < 600)


async def _request(method: str, url: str, *, timeout: float = 10.0, **kwargs: Any) -> httpx.Response:
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(3):
            try:
                response = await client.request(method, url, **kwargs)
                response.raise_for_status()
                return response
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                if attempt == 2 or not _retryable(exc):
                    raise
                logger.warning('HTTP %s failed (attempt %s)', method, attempt + 1)
                await asyncio.sleep(0.25 * (attempt + 1))
    raise RuntimeError('Unreachable')


def _request_sync(method: str, url: str, *, timeout: float = 10.0, **kwargs: Any) -> httpx.Response:
    with httpx.Client(timeout=timeout) as client:
        for attempt in range(3):
            try:
                response = client.request(method, url, **kwargs)
                response.raise_for_status()
                return response
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                if attempt == 2 or not _retryable(exc):
                    raise
                logger.warning('HTTP %s failed (attempt %s)', method, attempt + 1)
                time.sleep(0.25 * (attempt + 1))
    raise RuntimeError('Unreachable')


async def get(url: str, *, timeout: float = 10.0, **kwargs: Any) -> httpx.Response:
    return await _request('GET', url, timeout=timeout, **kwargs)


async def post(url: str, *, timeout: float = 10.0, **kwargs: Any) -> httpx.Response:
    return await _request('POST', url, timeout=timeout, **kwargs)


def get_sync(url: str, *, timeout: float = 10.0, **kwargs: Any) -> httpx.Response:
    return _request_sync('GET', url, timeout=timeout, **kwargs)


def post_sync(url: str, *, timeout: float = 10.0, **kwargs: Any) -> httpx.Response:
    return _request_sync('POST', url, timeout=timeout, **kwargs)
