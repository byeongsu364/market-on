"""Offline recognition contract, matching, persistence and provider failure checks."""

from contextlib import nullcontext
from unittest.mock import Mock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.repositories import knowledge_repo, media_repo, price_repo
from app.deps import get_db
from app.llm import json_output, router
from app.main import app
from app.services import scan_service

# 구조가 맞는 아주 작은 사진들 (메타데이터 없음 → 지워도 그대로). 모델은 가짜라 그림 내용은 상관없음
JPEG = (
    b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
    b'\xff\xda\x00\x08\x01\x01\x00\x00\x3f\x00sample\xff\xd9'
)
PNG = (
    b'\x89PNG\r\n\x1a\n'
    + b'\x00\x00\x00\x06IDATsample\x00\x00\x00\x00'
    + b'\x00\x00\x00\x00IEND\xaeB`\x82'
)
WEBP = b'RIFF\x16\x00\x00\x00WEBPVP8L\x0a\x00\x00\x00sample1234'


@pytest.fixture
def api(monkeypatch, tmp_path):
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: [])
    conn = Mock()
    conn.transaction.side_effect = nullcontext
    monkeypatch.setattr(settings, 'MEDIA_DIR', tmp_path)
    monkeypatch.setattr(settings, 'OLLAMA_BASE_URL', 'http://offline.invalid')
    media = Mock(return_value='11111111-1111-1111-1111-111111111111')
    monkeypatch.setattr(media_repo, 'insert_media', media)
    dictionary = [
        {'id': 'item:green_onion', 'name_ko': '대파', 'label': label}
        for label in ('scallion', 'green onion')
    ] + [
        {'id': 'item:apple', 'name_ko': '사과', 'label': 'apple'},
        {'id': 'item:pear', 'name_ko': '배', 'label': 'pear'},
        {'id': 'item:onion', 'name_ko': '양파', 'label': 'onion'},
    ]
    monkeypatch.setattr(knowledge_repo, 'vision_item_labels', lambda c: dictionary)
    monkeypatch.setattr(knowledge_repo, 'similar_items', lambda *a: [])
    monkeypatch.setattr(
        knowledge_repo,
        'item_vocabulary',
        lambda c: [
            {'item_id': 'item:pear', 'name_en': 'pear'},
            {'item_id': 'item:apple', 'name_en': 'apple'},
            {'item_id': 'item:green_onion', 'name_en': 'green onion'},
            {'item_id': 'item:duplicate', 'name_en': 'apple'},
        ],
    )
    provider = Mock()
    provider.generate.return_value = '{"labels": ["scallion"]}'
    monkeypatch.setattr(router, '_provider', lambda name: provider)
    monkeypatch.setattr(settings, 'OPENAI_API_KEY', None)
    monkeypatch.setattr(router.llm_call_repo, 'record', Mock())
    app.dependency_overrides[get_db] = lambda: conn
    try:
        with TestClient(app) as client:
            yield client, provider, media, tmp_path
    finally:
        app.dependency_overrides.pop(get_db, None)


def upload(client, data=JPEG):
    # Neither the filename nor the MIME type is trusted.
    return client.post('/recognize', files={'photo': ('photo.heic', data, 'text/plain')})


@pytest.mark.parametrize(
    ('labels', 'expected'),
    [
        (['scallion'], [('item:green_onion', 1.0)]),
        (['fuji apple'], [('item:apple', 0.7)]),
        # The expanded dictionary includes onion, a contiguous token of green onion.
        (['leek', 'green onion'], [('item:green_onion', 0.85), ('item:onion', 0.595)]),
        (['unknown'], []),
        (['pineapple'], []),  # apple is not a complete token in pineapple.
        (['other:banana'], []),
        (['other:apple'], []),  # Even known names with other: must not match.
        (['pear', 'apple'], [('item:pear', 1.0), ('item:apple', 0.85)]),
        (['onion'], [('item:onion', 1.0), ('item:green_onion', 0.7)]),
        (['FUJI-APPLE'], [('item:apple', 0.7)]),
        (['greenonion'], []),
        (['green fresh onion'], [('item:onion', 0.7)]),  # Tokens must be contiguous.
        ([], []),
        (['', 'unknown', ' APPLE '], [('item:apple', 0.7)]),
        # Same additional onion candidate from the second label, weighted by 0.85.
        (['green', 'green onion'], [('item:green_onion', 0.85), ('item:onion', 0.595)]),
    ],
)
def test_contract_and_weights(api, labels, expected):
    client, provider, _, _ = api
    import json

    provider.generate.return_value = json.dumps({'labels': labels})
    response = upload(client)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        *('vision_labels', 'candidates', 'media_id', 'price_tag', 'model'),
        'photo_location',
    }
    assert body['photo_location'] is None
    assert body['vision_labels'] == labels
    assert [(c['item_id'], c['confidence']) for c in body['candidates']] == expected
    assert all(set(c) == {'item_id', 'name', 'confidence'} for c in body['candidates'])
    if expected:
        assert body['candidates'][0]['name'] in ('대파', '사과', '배', '양파')
    assert provider.generate.call_args.kwargs['images'] == [JPEG]


@pytest.mark.parametrize('wrapper', ['```json\n%s\n```', 'Result: %s Thank you.'])
def test_json_wrappers(api, wrapper):
    client, provider, _, _ = api
    provider.generate.return_value = wrapper % '{"labels": ["scallion"]}'
    assert upload(client).json()['vision_labels'] == ['scallion']
    assert provider.generate.call_count == 1


@pytest.mark.parametrize('second', ['{"labels": ["apple"]}', 'broken', '{"labels": "apple"}'])
def test_json_retry_once(api, second):
    client, provider, _, _ = api
    provider.generate.side_effect = ['broken', second]
    body = upload(client).json()
    assert body['vision_labels'] == (['apple'] if second.startswith('{"labels": [') else [])
    assert provider.generate.call_count == 2
    assert 'JSON만 다시' in provider.generate.call_args.args[0]
    assert provider.generate.call_args.kwargs['images'] == [JPEG]


def test_similar_preserves_existing_and_limits(api, monkeypatch):
    client, provider, _, _ = api
    provider.generate.return_value = '{"labels": ["scallion", "apple"]}'
    monkeypatch.setattr(
        knowledge_repo,
        'similar_items',
        lambda *a: [
            {'id': 'item:apple', 'name_ko': '사과'},
            {'id': 'item:small_onion', 'name_ko': '쪽파'},
            {'id': 'item:substitute', 'name_ko': '대체품'},
        ],
    )
    candidates = upload(client).json()['candidates']
    assert [(c['item_id'], c['confidence']) for c in candidates] == [
        ('item:green_onion', 1.0),
        ('item:apple', 0.85),
        ('item:small_onion', 0.6),
    ]


@pytest.mark.parametrize('data', [b'', b'HEIC', b'RIFF1234NOPE', b'plain text'])
def test_unsupported(api, data):
    client, provider, media, _ = api
    response = upload(client, data)
    assert response.status_code == 415
    assert response.json()['error']['code'] == 'UNSUPPORTED_IMAGE'
    assert 'HEIC' in response.json()['error']['message']
    provider.generate.assert_not_called()
    media.assert_not_called()


def test_size_and_missing_field(api):
    client, provider, _, _ = api
    response = upload(client, JPEG + b'x' * scan_service.MAX_IMAGE_BYTES)
    assert response.status_code == 413
    assert response.json()['error']['code'] == 'IMAGE_TOO_LARGE'
    assert client.post('/recognize').status_code == 422
    assert client.post('/recognize', files={'image': ('a.jpg', JPEG)}).status_code == 422
    provider.generate.assert_not_called()


@pytest.mark.parametrize('exc', [httpx.ConnectError('offline'), httpx.ReadTimeout('timeout')])
def test_unavailable(api, exc):
    client, provider, _, _ = api
    provider.generate.side_effect = exc
    response = upload(client)
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'RECOGNIZE_UNAVAILABLE'


@pytest.mark.parametrize(
    ('data', 'ext', 'mime'),
    [
        (JPEG, 'jpg', 'image/jpeg'),
        (PNG, 'png', 'image/png'),
        (WEBP, 'webp', 'image/webp'),
    ],
)
def test_media_saved(api, data, ext, mime):
    client, _, media, root = api
    assert upload(client, data).status_code == 200
    paths = list(root.glob(f'photos/*/*.{ext}'))
    assert len(paths) == 1 and paths[0].read_bytes() == data
    assert len(paths[0].parent.name) == 8
    assert media.call_args.kwargs == {
        'kind': 'photo',
        'path': str(paths[0]),
        'mime': mime,
        'bytes': len(data),
    }


@pytest.mark.parametrize('failure', ['file', 'row'])
def test_save_failure_continues(api, monkeypatch, caplog, failure):
    client, _, media, root = api
    if failure == 'file':
        blocked = root / 'blocked'
        blocked.write_text('file')
        monkeypatch.setattr(settings, 'MEDIA_DIR', blocked)
    else:
        media.side_effect = RuntimeError('DB write failure')
    body = upload(client).json()
    assert body['candidates'][0]['item_id'] == 'item:green_onion'
    assert body['media_id'] is None
    assert '사진 저장 실패' in caplog.text


def test_deadline(monkeypatch):
    def timeout(*args, **kwargs):
        raise TimeoutError

    monkeypatch.setattr(json_output, 'run', timeout)
    from app.core.errors import AppError

    with pytest.raises(AppError) as error:
        import asyncio

        asyncio.run(json_output.recognize_labels(JPEG, []))
    assert error.value.code == 'RECOGNIZE_UNAVAILABLE'


def test_eight_megabyte_boundary(api):
    client, _, _, _ = api
    image = JPEG + b'x' * (scan_service.MAX_IMAGE_BYTES - len(JPEG))
    assert upload(client, image).status_code == 200
    response = upload(client, image + b'x')
    assert response.status_code == 413
    assert response.json()['error']['code'] == 'IMAGE_TOO_LARGE'


def test_unconfigured_provider(api, monkeypatch):
    from app.core.errors import AppError

    def unavailable(name):
        raise AppError('LLM_NOT_CONFIGURED', 'missing URL', 503)

    monkeypatch.setattr(router, '_provider', unavailable)
    response = upload(api[0])
    assert response.status_code == 503
    assert response.json()['error']['code'] == 'RECOGNIZE_UNAVAILABLE'


def test_vocabulary_prompt(api):
    client, provider, _, _ = api
    assert upload(client).status_code == 200
    prompt = provider.generate.call_args.args[0]
    assert '{vocabulary}' not in prompt
    assert '\napple\ngreen onion\npear\n' in prompt
    assert prompt.count('\napple\n') == 1
    assert 'other:<name>' in prompt
    assert '사과/배, 단감/복숭아, 대파/쪽파' in prompt
    assert '상태·신선도·품질을 평가하지 말 것. 가격을 추정하지 말 것.' in prompt


def test_empty_vocabulary_uses_free_prompt(api, monkeypatch):
    client, provider, _, _ = api
    monkeypatch.setattr(knowledge_repo, 'item_vocabulary', lambda c: [])
    assert upload(client).status_code == 200
    prompt = provider.generate.call_args.args[0]
    assert '영어 일반명(소문자) 1~3개' in prompt
    assert '{vocabulary}' not in prompt
    assert '아래 목록' not in prompt


@pytest.mark.parametrize(
    ('tag', 'expected'),
    [
        ({'price': 3000, 'unit_text': '1단', 'quantity': 1}, ('unit:bunch', 1)),
        ({'price': '5000', 'unit_text': '3개', 'quantity': None}, ('unit:piece', 3)),
        ({'price': 3000, 'unit_text': '1kg', 'quantity': 1}, ('unit:kg', 1)),
        ({'price': 3000, 'unit_text': '한 바구니', 'quantity': None}, (None, None)),
        (None, None),
        ({'price': '5천원', 'unit_text': '단'}, None),
        ({'price': 9, 'unit_text': '단'}, None),
        ({'price': 10000001, 'unit_text': '단'}, None),
        ({'price': 'NaN', 'unit_text': '단'}, None),
        ({'price': 3000}, None),
        ('bad', None),
    ],
)
def test_price_tag(api, monkeypatch, tag, expected):
    import json

    client, provider, _, _ = api
    monkeypatch.setattr(
        knowledge_repo,
        'unit_labels',
        lambda c: [
            {'id': 'unit:bunch', 'label': '단'},
            {'id': 'unit:piece', 'label': '개'},
            {'id': 'unit:kg', 'label': 'kg'},
        ],
    )
    provider.generate.return_value = json.dumps({'labels': ['green onion'], 'price_tag': tag})
    body = upload(client).json()
    assert body['candidates'][0]['item_id'] == 'item:green_onion'
    assert body['media_id'] == '11111111-1111-1111-1111-111111111111'
    assert provider.generate.call_count == 1
    if expected is None:
        assert body['price_tag'] is None
    else:
        assert set(body['price_tag']) == {'price', 'unit_text', 'unit', 'quantity', 'variety_id'}
        assert (body['price_tag']['unit'], body['price_tag']['quantity']) == expected
        assert body['price_tag']['price'] == float(tag['price'])


@pytest.mark.parametrize('label', ['other:pineapple', 'unknown', ''])
def test_escalates_unknown(api, monkeypatch, label):
    import json

    client, gemma, _, _ = api
    gemma.generate.return_value = json.dumps({'labels': [label] if label else []})
    gpt = Mock()
    gpt.generate.return_value = '{"labels": ["apple"]}'
    monkeypatch.setattr(settings, 'OPENAI_API_KEY', 'test-secret')
    monkeypatch.setattr(settings, 'OPENAI_CHAT_MODEL', 'test-model')
    monkeypatch.setattr(router, '_provider', lambda name: gpt if name == 'openai' else gemma)
    body = upload(client).json()
    assert body['model'] == 'openai:test-model'
    assert body['candidates'][0]['item_id'] == 'item:apple'
    assert gpt.generate.call_count == 1


def test_good_gemma_never_calls_gpt(api, monkeypatch):
    monkeypatch.setattr(settings, 'OPENAI_API_KEY', 'test-secret')
    monkeypatch.setattr(settings, 'OPENAI_CHAT_MODEL', 'test-model')
    factory = Mock(return_value=api[1])
    monkeypatch.setattr(router, '_provider', factory)
    body = upload(api[0]).json()
    assert body['model'] == settings.OLLAMA_CHAT_MODEL
    factory.assert_called_once_with('gemma')


def test_missing_gpt_returns_unknown_gemma(api):
    api[1].generate.return_value = '{"labels": ["other:pineapple"]}'
    body = upload(api[0]).json()
    assert body['vision_labels'] == ['other:pineapple']
    assert body['model'] == settings.OLLAMA_CHAT_MODEL


def test_low_confidence_escalates(api, monkeypatch):
    client, gemma, _, _ = api
    gpt = Mock()
    gpt.generate.return_value = '{"labels": ["apple"]}'
    gemma.generate.return_value = '{"labels": ["weak"]}'
    monkeypatch.setattr(settings, 'OPENAI_API_KEY', 'test-secret')
    monkeypatch.setattr(settings, 'OPENAI_CHAT_MODEL', 'test-model')
    monkeypatch.setattr(router, '_provider', lambda name: gpt if name == 'openai' else gemma)
    monkeypatch.setattr(
        scan_service,
        'match_vision_labels',
        lambda conn, labels: [
            {
                'item_id': 'item:apple',
                'name': '사과',
                'confidence': 0.5 if labels == ['weak'] else 1.0,
            }
        ],
    )
    body = upload(client).json()
    assert body['model'] == 'openai:test-model'
    assert router.llm_call_repo.record.call_args.kwargs['reason'] == 'low_confidence'


@pytest.mark.parametrize(
    ('tag', 'expected'),
    [
        ({'price': 5000, 'unit_text': '부사 3개', 'quantity': 3}, 'variety:apple-fuji'),
        ({'price': 5000, 'unit_text': '3개', 'variety_text': '홍로'}, 'variety:apple-hongro'),
        ({'price': 5000, 'unit_text': '3개'}, None),
        ({'price': 5000, 'unit_text': '신고배 3개'}, None),
    ],
)
def test_recognize_variety_from_tag(api, monkeypatch, tag, expected):
    import json
    from tests.test_variety_prices import choices
    from app.knowledge.ontology import normalize

    client, provider, _, _ = api
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: choices())
    monkeypatch.setattr(knowledge_repo, 'unit_labels', lambda *a: [])
    dictionary = [
        (normalize(label), v['id'], label)
        for v in choices()
        for labels in v['labels'].values()
        for label in labels
    ]
    monkeypatch.setattr(knowledge_repo, 'label_dictionary', lambda *a: dictionary)
    provider.generate.return_value = json.dumps({'labels': ['apple'], 'price_tag': tag})
    response = upload(client)
    assert response.status_code == 200
    assert response.json()['price_tag']['variety_id'] == expected
    assert 'variety_text' not in response.json()['price_tag']


@pytest.mark.parametrize(
    'raw',
    [
        # 2026-11-26 실제 Gemma 응답: price_tag를 두 번 쓰거나 품종을 바깥 키에 둠
        '{"labels":["apple"],"price_tag":{"price":5000,"unit_text":"개","quantity":3},'
        '"price_tag":{"variety_text":"부사"}}',
        '{"labels":["apple"],"price_tag":{"price":5000,"unit_text":"개","quantity":3},'
        '"price_tag_variety_text":"부사"}',
        '{"labels":["apple"],"price_tag":{"price":5000,"unit_text":"3개","quantity":3},'
        '"variety_text":"부사"}',
    ],
)
def test_variety_text_placements_keep_price(raw):
    from app.llm.json_output import parse_recognition

    tag = parse_recognition(raw)['price_tag']
    assert tag['price'] == 5000 and tag['variety_text'] == '부사'
