"""Offline routing, deadlines and audit isolation."""

from unittest.mock import Mock
import pytest
from app.core.config import settings
from app.llm import router


@pytest.fixture
def routing(monkeypatch):
    monkeypatch.setattr(settings, 'LLM_ROUTES', {'write': ['gemma', 'openai']})
    monkeypatch.setattr(settings, 'OPENAI_API_KEY', 'test-secret')
    monkeypatch.setattr(settings, 'OLLAMA_BASE_URL', 'http://offline.invalid')
    monkeypatch.setattr(settings, 'OPENAI_CHAT_MODEL', 'test-model')
    factory = Mock(side_effect=lambda name: name)
    monkeypatch.setattr(router, '_provider', factory)
    audit = Mock()
    monkeypatch.setattr(router.llm_call_repo, 'record', audit)
    return factory, audit


def test_first_success(routing):
    result = router.run('write', lambda p: p)
    assert result.value == 'gemma'
    assert result.provider == 'gemma'
    assert not result.escalated and result.reason is None
    assert routing[1].call_args.kwargs['ok'] is True


def test_error_falls_back(routing):
    def call(provider):
        if provider == 'gemma':
            raise TimeoutError('offline')
        return 'answer'

    result = router.run('write', call)
    assert (result.value, result.provider, result.model, result.escalated, result.reason) == (
        'answer',
        'openai',
        'openai:test-model',
        True,
        'error',
    )
    assert routing[1].call_args_list[0].kwargs['ok'] is False


@pytest.mark.parametrize('reason', ['no_labels', 'unknown_item', 'low_confidence'])
def test_rejection_and_last_value(routing, reason):
    result = router.run('write', lambda p: p, lambda v: reason)
    assert result.value == 'openai' and result.escalated and result.reason == reason


@pytest.mark.parametrize('missing', ['OPENAI_API_KEY', 'OPENAI_CHAT_MODEL'])
def test_unconfigured_skip(routing, monkeypatch, missing):
    monkeypatch.setattr(settings, missing, '')
    result = router.run('write', lambda p: p, lambda v: 'unknown_item')
    assert result.value == 'gemma' and not result.escalated
    routing[0].assert_called_once_with('gemma')


def test_all_fail_last_exception(routing):
    error = RuntimeError('last')
    with pytest.raises(RuntimeError) as caught:
        router.run('write', Mock(side_effect=[ValueError('first'), error]))
    assert caught.value is error


def test_deadline(routing, monkeypatch):
    from threading import Event

    event = Event()
    monkeypatch.setitem(router.PROVIDER_TIMEOUTS, 'gemma', 0.01)
    try:
        result = router.run('write', lambda p: event.wait(1) if p == 'gemma' else 'ok')
        assert result.value == 'ok' and result.reason == 'error'
    finally:
        event.set()


def test_record_failure_is_ignored(monkeypatch):
    from app.db.repositories import llm_call_repo

    monkeypatch.setattr(llm_call_repo, 'connection', Mock(side_effect=RuntimeError('offline')))
    llm_call_repo.record(task='recognize')


def test_unconfigured_first_is_not_escalation(routing, monkeypatch):
    monkeypatch.setattr(settings, 'LLM_ROUTES', {'write': ['openai', 'gemma']})
    monkeypatch.setattr(settings, 'OPENAI_API_KEY', None)
    result = router.run('write', lambda p: p)
    assert result.provider == 'gemma' and not result.escalated


def test_no_configured_providers(routing, monkeypatch):
    from app.core.errors import AppError

    monkeypatch.setattr(settings, 'OPENAI_API_KEY', None)
    monkeypatch.setattr(settings, 'OLLAMA_BASE_URL', None)
    with pytest.raises(AppError) as error:
        router.run('write', lambda p: p)
    assert error.value.code == 'LLM_NOT_CONFIGURED'
    routing[0].assert_not_called()


def test_rejected_value_survives_later_errors(routing):
    # Gemma 답은 거절됐지만 GPT가 장애(예: 크레딧 없음)면 Gemma 답을 그대로 돌려줌
    def call(provider):
        if provider == 'openai':
            raise RuntimeError('insufficient_quota')
        return 'gemma-labels'

    result = router.run('write', call, lambda v: 'unknown_item')
    assert (result.value, result.provider, result.reason) == (
        'gemma-labels',
        'gemma',
        'unknown_item',
    )


def test_role_and_task_are_recorded(routing):
    """040: llm_calls에 역할(role)과 요청 이름(task)을 같이 남겨요."""
    router.run('write', lambda p: p, task='ask')
    kwargs = routing[1].call_args.kwargs
    assert (kwargs['role'], kwargs['task']) == ('write', 'ask')
    router.run('write', lambda p: p)
    assert routing[1].call_args.kwargs['task'] == 'write'


def test_failure_reason_logged_without_content(routing, caplog):
    def call(provider):
        if provider == 'gemma':
            raise TimeoutError('질문 내용이 들어 있는 오류')
        return 'ok'

    router.run('write', call)
    assert 'write 역할 gemma 실패: TimeoutError' in caplog.text
    assert '질문 내용' not in caplog.text
