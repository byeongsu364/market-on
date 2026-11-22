"""동기·비동기 HTTP의 타임아웃과 제한된 재시도를 검증해요."""
import asyncio
from unittest.mock import Mock, AsyncMock
import httpx
import pytest
from app.core import http


@pytest.mark.parametrize('sync', [True, False])
@pytest.mark.parametrize('method', ['get', 'post'])
@pytest.mark.parametrize('failure,retries', [
    (400, 0), (401, 0), (404, 0), (429, 2), (500, 2), (503, 2),
    ('connect', 2), ('timeout', 2), ('protocol', 0),
])
def test_retry_and_timeout(monkeypatch, sync, method, failure, retries):
    request = httpx.Request(method.upper(), 'http://localhost/test')
    if isinstance(failure, int):
        error = httpx.HTTPStatusError('status', request=request,
                                      response=httpx.Response(failure, request=request))
    else:
        cls = {'connect': httpx.ConnectError, 'timeout': httpx.ReadTimeout,
               'protocol': httpx.RemoteProtocolError}[failure]
        error = cls('failure', request=request)
    client = Mock()
    client.request = Mock(side_effect=error) if sync else AsyncMock(side_effect=error)
    manager = Mock() if sync else AsyncMock()
    if sync:
        manager.__enter__ = Mock(return_value=client)
        manager.__exit__ = Mock(return_value=False)
    else:
        manager.__aenter__.return_value = client
    constructor = Mock(return_value=manager)
    monkeypatch.setattr(http.httpx, 'Client' if sync else 'AsyncClient', constructor)
    sleep = Mock() if sync else AsyncMock()
    monkeypatch.setattr(http.time if sync else http.asyncio, 'sleep', sleep)
    with pytest.raises(type(error)):
        if sync:
            getattr(http, method + '_sync')('http://localhost/test', timeout=120.0)
        else:
            asyncio.run(getattr(http, method)('http://localhost/test', timeout=120.0))
    constructor.assert_called_once_with(timeout=120.0)
    assert client.request.call_count == retries + 1
    assert sleep.call_count == retries


@pytest.mark.parametrize('sync', [True, False])
def test_recovers_with_default_timeout(monkeypatch, sync):
    response = httpx.Response(200, request=httpx.Request('GET', 'http://localhost/test'))
    effects = [httpx.ConnectError('offline'), response]
    client = Mock()
    client.request = Mock(side_effect=effects) if sync else AsyncMock(side_effect=effects)
    manager = Mock() if sync else AsyncMock()
    if sync:
        manager.__enter__ = Mock(return_value=client)
        manager.__exit__ = Mock(return_value=False)
    else:
        manager.__aenter__.return_value = client
    constructor = Mock(return_value=manager)
    monkeypatch.setattr(http.httpx, 'Client' if sync else 'AsyncClient', constructor)
    monkeypatch.setattr(http.time if sync else http.asyncio, 'sleep', Mock() if sync else AsyncMock())
    result = http.get_sync('http://localhost/test') if sync else asyncio.run(http.get('http://localhost/test'))
    assert result is response
    constructor.assert_called_once_with(timeout=10.0)
    assert client.request.call_count == 2
