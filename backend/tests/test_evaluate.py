from types import SimpleNamespace
from unittest.mock import Mock

import httpx

from app.schemas.ask import AskResponse
from scripts import evaluate as e


def test_three_question_metrics(tmp_path, monkeypatch):
    conn = Mock()
    conn.execute.return_value.fetchall.return_value = [('apple/storage.md',)]
    monkeypatch.setattr(e.retriever, 'search', lambda *a, **k: [SimpleNamespace(chunk_id=1)])
    calls = []

    def ask(c, request, device, **kwargs):
        calls.append(kwargs)
        if request.question == '범위 밖':
            return AskResponse(kind='no_evidence')
        if request.question == '범위 밖 2':
            return AskResponse(kind='out_of_scope')
        return AskResponse(
            kind='answer',
            answer='보관해요.',
            citations=[{'title': '사과', 'publisher': None, 'url': None, 'license': '제한 없음'}],
            cached=kwargs.get('use_cache', True),
        )

    monkeypatch.setattr(e.ask_service, 'ask', ask)
    questions = [
        {
            'id': str(i),
            'question': '사과',
            'item_id': 'item:apple',
            'intent': 'store',
            'doc_key': 'apple/storage.md',
        }
        for i in range(2)
    ] + [
        {'id': 'outside', 'question': '범위 밖', 'expect': 'no_evidence'},
        {'id': 'outside-list', 'question': '범위 밖 2', 'expect': ['out_of_scope', 'no_evidence']},
    ]
    report = e.evaluate(conn, data_dir=tmp_path, questions=questions, embedder=Mock())
    assert report['metrics']['retrieval']['rate'] == 1
    assert report['metrics']['citations']['total'] == 2
    assert report['metrics']['values']['rate'] == 1
    assert report['metrics']['no_evidence']['passed'] == 2
    assert report['metrics']['latency']['median'] is not None
    assert all(c['consume'] is False for c in calls)
    assert sum(c.get('use_cache') is False for c in calls) == 4
    assert (tmp_path / 'build/eval_report.md').exists()


def test_server_unavailable(tmp_path, monkeypatch):
    conn = Mock()
    conn.execute.return_value.fetchall.return_value = [('apple/storage.md',)]
    monkeypatch.setattr(e.retriever, 'search', Mock(side_effect=httpx.ConnectError('offline')))
    ask = Mock(side_effect=httpx.ConnectError('offline'))
    monkeypatch.setattr(e.ask_service, 'ask', ask)
    report = e.evaluate(
        conn,
        data_dir=tmp_path,
        embedder=Mock(),
        questions=[
            {
                'id': '1',
                'question': '사과',
                'item_id': 'item:apple',
                'intent': 'store',
                'doc_key': 'apple/storage.md',
            }
        ],
    )
    assert report['metrics']['retrieval']['rate'] == 1
    assert report['metrics']['citations']['rate'] is None
    assert '측정 못 함' in report['results'][0]['unavailable']
    ask.assert_not_called()


def test_foreign_translation_metrics(tmp_path, monkeypatch):
    from collections import Counter

    import yaml

    questions = yaml.safe_load((e.DATA / 'eval/questions.yaml').read_text())['questions']
    foreign = [q for q in questions if q.get('lang')]
    assert Counter(q['lang'] for q in foreign) == {'en': 4, 'zh': 2, 'ja': 2, 'vi': 2}
    by_id = {q['id']: q for q in questions}
    assert all(q['doc_key'] == by_id[q['id'][3:]]['doc_key'] for q in foreign)
    conn = Mock()
    conn.execute.return_value.fetchall.return_value = [('apple/storage.md',)]
    monkeypatch.setattr(e, 'translate', lambda *a, **kw: ('사과 보관', True))
    search = Mock(return_value=[SimpleNamespace(chunk_id=1)])
    monkeypatch.setattr(e.retriever, 'search', search)
    monkeypatch.setattr(
        e.ask_service,
        'ask',
        lambda *a, **kw: AskResponse(
            kind='answer',
            answer='Store for 1 month.',
            original='1개월 보관해요.',
            lang='en',
            translated=True,
            citations=[{'title': '원문 제목', 'publisher': None, 'url': None, 'license': None}],
        ),
    )
    report = e.evaluate(
        conn,
        data_dir=tmp_path,
        embedder=Mock(),
        questions=[
            {
                'id': 'en-test',
                'question': 'How to store apples?',
                'item_id': 'item:apple',
                'intent': 'store',
                'doc_key': 'apple/storage.md',
                'lang': 'en',
            }
        ],
    )
    assert report['metrics']['translation']['rate'] == 1
    assert report['metrics']['retrieval']['rate'] == 1
    assert report['metrics']['citations']['rate'] == 1
    assert search.call_args.args[2] == '사과 보관'
    assert search.call_args.kwargs['lang'] == 'ko'
