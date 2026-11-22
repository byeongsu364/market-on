"""Offline unit checks for matching, chunking and provider contracts."""
import math
from unittest.mock import MagicMock
import pytest
from app.knowledge.ingest import chunk_document, tag_entities, _hash
from app.knowledge.ontology import normalize
from app.llm.fake import FakeProvider
from app.llm.factory import get_embedder, get_llm
from app.core.config import settings
from app.core.errors import AppError
from app.schemas.knowledge import Document

DICTIONARY = [('양파', 'onion', '양파'), ('파', 'daepa', '파'),
              ('greenonion', 'daepa', 'green onion')]

def doc(**kwargs):
    values = dict(doc_key='a.md', source_key='team', doc_type='recipe', lang='ko',
                  title='연습', body='짧은 문서', entities=['item:green_onion'], entity_names=['대파'])
    return Document(**(values | kwargs))

@pytest.mark.parametrize('text,expected', [
    ('양파', {'onion'}), ('파 고르는 법', {'daepa'}), ('쪽파', set()),
    ('파는 단단해요', {'daepa'}), ('GREEN  ONION', {'daepa'}),
    ('green\tonion', {'daepa'}), ('(파)', {'daepa'})])
def test_tagging(text, expected):
    assert tag_entities(text, DICTIONARY) == expected

def test_short_document():
    chunks = chunk_document(doc())
    assert len(chunks) == 1
    assert chunks[0].content == '[대파 · 레시피] 짧은 문서'
    assert chunks[0].entity_ids == {'item:green_onion'}

@pytest.mark.parametrize('kind', ['criterion','season','storage','prep','merchant_tip'])
def test_whole_topics(kind):
    assert len(chunk_document(doc(doc_type=kind, body='가' * 1600))) == 1

def test_windows_overlap_and_prefix():
    body = '## 준비\n' + ''.join(str(i % 10) for i in range(1550))
    chunks = chunk_document(doc(body=body))
    prefix = '[대파 · 레시피] '
    pieces = [c.content.removeprefix(prefix) for c in chunks]
    assert len(pieces) >= 3
    assert all(c.content.startswith(prefix) for c in chunks)
    assert all(a[-50:] == b[:50] for a, b in zip(pieces, pieces[1:]))
    assert pieces[0] + ''.join(p[50:] for p in pieces[1:]) == body
    assert all(len(p) <= 500 for p in pieces)

def test_sections_and_sentence_boundary():
    chunks = chunk_document(doc(body='## 준비\n' + '문장입니다. ' * 180 + '\n## 마무리\n' + '끝입니다. ' * 40))
    assert any('## 마무리' in c.content for c in chunks)
    assert chunks[0].content.rstrip().endswith('.')

def test_normalize():
    assert normalize(' GREEN\tOnion\n ') == 'greenonion'
    assert normalize(' 대 파 ') == '대파'

def test_fake_and_independent_factory(monkeypatch):
    monkeypatch.setattr(settings, 'EMBEDDING_PROVIDER', 'fake')
    monkeypatch.setattr(settings, 'LLM_PROVIDER', 'gemma')
    assert isinstance(get_embedder(), FakeProvider)
    assert get_llm().__class__.__name__ == 'OllamaProvider'
    a, b, c = FakeProvider().embed(['대파', '대파', '사과'], task='document')
    assert a == b and a != c
    assert math.isclose(sum(x*x for x in a), 1.0)
    assert len(a) == settings.EMBEDDING_DIM
    assert FakeProvider().embed(['대파'], task='query')[0] == a

def test_hash_delimited_and_stable():
    assert _hash('ab','c') != _hash('a','bc')
    assert _hash('대파', None) == _hash('대파', None)

# No real Gemini request is made: test batching, task flags and retries with a mocked SDK.
def test_gemini_batches_and_retry(monkeypatch):
    from app.llm import gemini
    monkeypatch.setattr(settings, 'GEMINI_API_KEY', 'unit-test-placeholder')
    client = MagicMock()
    monkeypatch.setattr(gemini.genai, 'Client', lambda **kwargs: client)
    sleep = MagicMock()
    monkeypatch.setattr(gemini.time, 'sleep', sleep)
    response = MagicMock()
    embedding = MagicMock(values=[0.0]*settings.EMBEDDING_DIM)
    response.embeddings = [embedding]*100
    last = MagicMock(embeddings=[embedding])
    client.__enter__.return_value.models.embed_content.side_effect = [
        gemini.errors.APIError(429, {'error': {'message':'retry'}}), response, last]
    rows = gemini.GeminiProvider().embed(['x']*101, task='query')
    assert len(rows) == 101
    calls = client.__enter__.return_value.models.embed_content.call_args_list
    assert [len(c.kwargs['contents']) for c in calls] == [100,100,1]
    assert calls[0].kwargs['config'].task_type == 'RETRIEVAL_QUERY'
    sleep.assert_called_once_with(1)

def test_gemini_bad_dimension(monkeypatch):
    from app.llm import gemini
    monkeypatch.setattr(settings, 'GEMINI_API_KEY', 'unit-test-placeholder')
    client = MagicMock()
    monkeypatch.setattr(gemini.genai, 'Client', lambda **kwargs: client)
    client.__enter__.return_value.models.embed_content.return_value.embeddings = [MagicMock(values=[1.0])]
    with pytest.raises(AppError, match='차원'):
        gemini.GeminiProvider().embed(['x'], task='document')


@pytest.mark.parametrize('kind,topic', [('grade', '품질 등급'), ('story', '시장 이야기'),
    ('origin', '원산지'), ('safety', '안전 주의'), ('context', '구매 맥락'),
    ('specialty', '지역 특산물'), ('guide', '이용 안내')])
def test_new_topic_prefix(kind, topic):
    assert chunk_document(doc(doc_type=kind))[0].content == f'[대파 · {topic}] 짧은 문서'


def test_intent_mapping_and_search(monkeypatch):
    from app.knowledge.intents import doc_types_for_intent, DOC_TYPE_TO_INTENT
    from app.knowledge.retriever import search
    from app.db.repositories import knowledge_repo as repo
    from app.knowledge.ingest import TOPICS
    assert set(DOC_TYPE_TO_INTENT) == set(TOPICS)
    assert doc_types_for_intent('select') == ['criterion', 'grade', 'merchant_tip']
    assert doc_types_for_intent('origin') == ['origin', 'specialty']
    with pytest.raises(ValueError):
        doc_types_for_intent('unknown')
    match = MagicMock(return_value=[])
    monkeypatch.setattr(repo, 'match_chunks', match)
    search(None, FakeProvider(), '대파', entity_ids=['item:green_onion'], intent='store')
    assert match.call_args.args[3] == ['storage']
    search(None, FakeProvider(), '대파', entity_ids=[], intent='store', doc_types=['recipe'])
    assert match.call_args.args[3] == []
