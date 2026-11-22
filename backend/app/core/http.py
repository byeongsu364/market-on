"""공통 외부 HTTP 전송과 두 번 재시도. 허용 의존성: core 및 httpx."""
import asyncio
import logging
from typing import Any
import httpx

logger = logging.getLogger(__name__)

async def _request(method: str, url: str, **kwargs: Any) -> httpx.Response:
    async with httpx.AsyncClient(timeout=10.0) as client:
        for attempt in range(3):
            try:
                response = await client.request(method, url, **kwargs)
                response.raise_for_status()
                return response
            except (httpx.TransportError, httpx.HTTPStatusError):
                logger.warning('HTTP %s failed (attempt %s)', method, attempt + 1)
                if attempt == 2:
                    raise
                await asyncio.sleep(0.25 * (attempt + 1))
    raise RuntimeError('Unreachable')

async def get(url: str, **kwargs: Any) -> httpx.Response:
    return await _request('GET', url, **kwargs)

async def post(url: str, **kwargs: Any) -> httpx.Response:
    return await _request('POST', url, **kwargs)
