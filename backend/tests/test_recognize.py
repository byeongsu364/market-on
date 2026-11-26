"""사진 인식 (040): 구글 비전 라벨 → 온톨로지 품목, 가격표 글자 → 가격·단위·품종. AI 모델은 사진을 보지 않아요.

비전은 가짜(annotate 바꿔치기)로 돌려서 키 없이 테스트해요. 여기 라벨은 매칭 규칙을 시험하는 값이고,
온톨로지에 넣는 실제 비전 라벨은 실제 사진 응답으로 확인한 것만 넣어요 (지시서 1-2).
"""

from contextlib import nullcontext
from unittest.mock import Mock

import httpx
import pytest
from fastapi.testclient import TestClient

from app.clients import vision
from app.core.config import settings
from app.core.errors import AppError
from app.db.repositories import knowledge_repo, media_repo, price_repo
from app.deps import get_db
from app.llm import router
from app.main import app
from app.services import price_tag, scan_service, vision_usage

# 구조가 맞는 아주 작은 사진들 (메타데이터 없음 → 지워도 그대로). 비전은 가짜라 그림 내용은 상관없음
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
UNITS = [
    {'id': 'unit:bunch', 'label': '단'},
    {'id': 'unit:piece', 'label': '개'},
    {'id': 'unit:kg', 'label': 'kg'},
]


def seen(labels, text=''):
    return {'labels': [(label, 0.9 - i * 0.05) for i, label in enumerate(labels)], 'text': text}


@pytest.fixture
def api(monkeypatch, tmp_path):
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: [])
    conn = Mock()
    conn.transaction.side_effect = nullcontext
    monkeypatch.setattr(settings, 'MEDIA_DIR', tmp_path)
    monkeypatch.setattr(settings, 'GOOGLE_VISION_API_KEY', 'test-vision-key')
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
    monkeypatch.setattr(knowledge_repo, 'unit_labels', lambda c: UNITS)
    monkeypatch.setattr(knowledge_repo, 'label_dictionary', lambda c: [])
    annotate = Mock(return_value=seen(['Scallion']))
    monkeypatch.setattr(vision, 'annotate', annotate)
    monkeypatch.setattr(vision_usage, 'take', Mock(return_value=None))
    audit = Mock()
    monkeypatch.setattr(scan_service.llm_call_repo, 'record', audit)
    # 사진 인식은 AI 모델을 부르지 않아요
    monkeypatch.setattr(router, '_provider', Mock(side_effect=AssertionError('no LLM for photos')))
    app.dependency_overrides[get_db] = lambda: conn
    try:
        with TestClient(app) as client:
            yield client, annotate, media, tmp_path, audit
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
        (['leek', 'green onion'], [('item:green_onion', 0.85), ('item:onion', 0.595)]),
        (['unknown'], []),
        (['pineapple'], []),  # apple is not a complete token in pineapple.
        (['pear', 'apple'], [('item:pear', 1.0), ('item:apple', 0.85)]),
        (['onion'], [('item:onion', 1.0), ('item:green_onion', 0.7)]),
        (['greenonion'], []),
        ([], []),
    ],
)
def test_contract_and_weights(api, labels, expected):
    client, annotate, _, _, _ = api
    annotate.return_value = seen(labels)
    response = upload(client)
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        *('vision_labels', 'candidates', 'media_id', 'price_tag', 'model'),
        'photo_location',
        'variety_id',
        'variety_text',
    }
    assert body['model'] == 'google-vision'
    assert body['vision_labels'] == [label.lower() for label in labels]
    assert [(c['item_id'], c['confidence']) for c in body['candidates']] == expected
    assert all(set(c) == {'item_id', 'name', 'confidence'} for c in body['candidates'])
    assert annotate.call_args.args == (JPEG,)


def test_broad_labels_first_still_find_known_label(api):
    """비전은 Food·Vegetable 같은 넓은 라벨을 먼저 줄 때가 많아요. 사전에 있는 라벨을 찾아 써요."""
    client, annotate, _, _, _ = api
    annotate.return_value = seen(['Food', 'Vegetable', 'Natural foods', 'Scallion', 'Leaf'])
    body = upload(client).json()
    assert body['candidates'][0]['item_id'] == 'item:green_onion'
    # 넓은 라벨만 있으면 후보 없음 → 화면에서 직접 고르기
    annotate.return_value = seen(['Food', 'Fruit', 'Produce'])
    assert upload(client).json()['candidates'] == []


def test_labels_sorted_by_vision_score(api):
    client, annotate, _, _, _ = api
    annotate.return_value = {'labels': [('Apple', 0.5), ('Pear', 0.95)], 'text': ''}
    body = upload(client).json()
    assert body['vision_labels'][:2] == ['pear', 'apple']
    assert body['candidates'][0]['item_id'] == 'item:pear'


def test_similar_preserves_existing_and_limits(api, monkeypatch):
    client, annotate, _, _, _ = api
    annotate.return_value = seen(['scallion', 'apple'])
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
    client, annotate, media, _, _ = api
    response = upload(client, data)
    assert response.status_code == 415
    assert response.json()['error']['code'] == 'UNSUPPORTED_IMAGE'
    assert 'HEIC' in response.json()['error']['message']
    annotate.assert_not_called()
    media.assert_not_called()


def test_size_and_missing_field(api):
    client, annotate, _, _, _ = api
    response = upload(client, JPEG + b'x' * scan_service.MAX_IMAGE_BYTES)
    assert response.status_code == 413
    assert response.json()['error']['code'] == 'IMAGE_TOO_LARGE'
    assert client.post('/recognize').status_code == 422
    assert client.post('/recognize', files={'image': ('a.jpg', JPEG)}).status_code == 422
    annotate.assert_not_called()


@pytest.mark.parametrize('case', ['no_key', 'failed', 'daily_limit', 'monthly_limit'])
def test_vision_unavailable_is_unknown_not_ai(api, monkeypatch, case):
    """키 없음·실패·한도 → 모르는 품목(후보 없음)으로 끝나고 화면은 직접 고르기로. AI로 대신 보지 않아요."""
    client, annotate, _, _, audit = api
    if case == 'no_key':
        monkeypatch.setattr(settings, 'GOOGLE_VISION_API_KEY', '')
    elif case == 'failed':
        annotate.side_effect = AppError('VISION_FAILED', 'x', 503)
    else:
        monkeypatch.setattr(vision_usage, 'take', Mock(return_value=case))
    response = upload(client)
    assert response.status_code == 200
    body = response.json()
    assert body['candidates'] == [] and body['vision_labels'] == [] and body['price_tag'] is None
    assert body['media_id'] is not None
    if case == 'no_key':
        annotate.assert_not_called()
        audit.assert_not_called()
    elif case == 'failed':
        assert audit.call_args.kwargs | {'ms': 0} == {
            'task': 'recognize',
            'role': 'vision',
            'provider': 'vision',
            'model': 'google-vision',
            'escalated': False,
            'ms': 0,
            'reason': 'error',
            'ok': False,
        }
    else:
        annotate.assert_not_called()
        assert audit.call_args.kwargs['reason'] == case


def test_success_is_recorded(api):
    client, _, _, _, audit = api
    upload(client)
    kwargs = audit.call_args.kwargs
    assert (kwargs['role'], kwargs['provider'], kwargs['ok'], kwargs['reason']) == (
        'vision',
        'vision',
        True,
        None,
    )


@pytest.mark.parametrize(
    ('data', 'ext', 'mime'),
    [
        (JPEG, 'jpg', 'image/jpeg'),
        (PNG, 'png', 'image/png'),
        (WEBP, 'webp', 'image/webp'),
    ],
)
def test_media_saved(api, data, ext, mime):
    client, _, media, root, _ = api
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
    client, _, media, root, _ = api
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


def test_eight_megabyte_boundary(api):
    client, *_ = api
    image = JPEG + b'x' * (scan_service.MAX_IMAGE_BYTES - len(JPEG))
    assert upload(client, image).status_code == 200
    response = upload(client, image + b'x')
    assert response.status_code == 413
    assert response.json()['error']['code'] == 'IMAGE_TOO_LARGE'


@pytest.mark.parametrize(
    ('text', 'expected'),
    [
        ('대파 1단 3,000원', (3000.0, 'unit:bunch', 1.0)),
        ('양파\n3개\n5000원', (5000.0, 'unit:piece', 3.0)),
        ('사과 1kg ₩3,000', (3000.0, 'unit:kg', 1.0)),
        ('한 단 3천원', (3000.0, 'unit:bunch', 1.0)),
        ('1만원', (10000.0, None, None)),
        ('1만 5천원 2kg', (15000.0, 'unit:kg', 2.0)),
        ('3 000원', (3000.0, None, None)),
        ('1개 1,000원 3개 2,500원', None),  # 가격이 여럿이면 고르지 않음
        ('9원', None),
        ('10000001원', None),
        ('대파 1단', None),  # 가격 없음
        ('010-1234-5678 2026.11.27', None),  # 전화번호·날짜는 가격 아님
        ('', None),
        ('3000', (3000.0, None, None)),  # "원" 없이 숫자만
        ('3000 / 5000', None),
        ('2kg 3개', None),  # 단위 붙은 숫자는 가격 아님
    ],
)
def test_price_tag_from_text(api, text, expected):
    client, annotate, _, _, _ = api
    annotate.return_value = seen(['scallion'], text)
    body = upload(client).json()
    assert body['candidates'][0]['item_id'] == 'item:green_onion'
    if expected is None:
        assert body['price_tag'] is None
    else:
        tag = body['price_tag']
        assert set(tag) == {'price', 'unit_text', 'unit', 'quantity', 'variety_id'}
        assert (tag['price'], tag['unit'], tag['quantity']) == expected


@pytest.mark.parametrize(
    ('text', 'expected'),
    [
        ('부사 3개 5,000원', 'variety:apple-fuji'),
        ('홍로 3개 5000원', 'variety:apple-hongro'),
        ('3개 5000원', None),
        ('신고배 3개 5000원', None),
    ],
)
def test_variety_from_tag_text(api, monkeypatch, text, expected):
    from app.knowledge.ontology import normalize
    from tests.test_variety_prices import choices

    client, annotate, _, _, _ = api
    monkeypatch.setattr(price_repo, 'varieties', lambda *a: choices())
    dictionary = [
        (normalize(label), v['id'], label)
        for v in choices()
        for labels in v['labels'].values()
        for label in labels
    ]
    monkeypatch.setattr(knowledge_repo, 'label_dictionary', lambda *a: dictionary)
    annotate.return_value = seen(['apple'], text)
    tag = upload(client).json()['price_tag']
    assert tag['variety_id'] == expected and tag['price'] == 5000


def test_price_reader_without_item_keeps_price():
    assert price_tag.read_price('3,000원') == 3000
    assert price_tag.read_price('가격 3천원 · 1단') == 3000


def test_vision_request_and_response(monkeypatch):
    """키는 헤더로만, 사진 한 장에 라벨+글자 한 번에, 응답 모양 읽기."""
    monkeypatch.setattr(settings, 'GOOGLE_VISION_API_KEY', 'secret-key')
    post = Mock(
        return_value=Mock(
            json=lambda: {
                'responses': [
                    {
                        'labelAnnotations': [
                            {'description': 'Scallion', 'score': 0.93},
                            {'description': ' ', 'score': 0.5},
                        ],
                        'fullTextAnnotation': {'text': '대파 1단\n3,000원'},
                    }
                ]
            },
            raise_for_status=lambda: None,
        )
    )
    monkeypatch.setattr(vision.http, 'post_sync', post)
    result = vision.annotate(JPEG)
    assert result == {'labels': [('Scallion', 0.93)], 'text': '대파 1단\n3,000원'}
    args, kwargs = post.call_args
    assert args == (vision.URL,) and 'secret-key' not in args[0]
    assert kwargs['headers'] == {'x-goog-api-key': 'secret-key'}
    features = kwargs['json']['requests'][0]['features']
    assert features == [{'type': 'LABEL_DETECTION', 'maxResults': 10}, {'type': 'TEXT_DETECTION'}]
    assert kwargs['retries'] == 1 and kwargs['timeout'].connect == 5.0
    # textAnnotations만 있는 응답, 오류 응답
    assert vision.parse_response(
        {'responses': [{'textAnnotations': [{'description': '3000원'}]}]}
    ) == {'labels': [], 'text': '3000원'}
    with pytest.raises(AppError):
        vision.parse_response({'responses': [{'error': {'code': 403, 'message': 'x'}}]})


@pytest.mark.parametrize(
    'exc', [httpx.ConnectError('offline'), httpx.ReadTimeout('t'), ValueError()]
)
def test_vision_errors_hide_details(monkeypatch, exc):
    monkeypatch.setattr(settings, 'GOOGLE_VISION_API_KEY', 'secret-key')
    monkeypatch.setattr(vision.http, 'post_sync', Mock(side_effect=exc))
    with pytest.raises(AppError) as error:
        vision.annotate(JPEG)
    assert error.value.code == 'VISION_FAILED' and 'secret-key' not in str(error.value)


def test_vision_usage_limits(monkeypatch):
    vision_usage.reset()
    monkeypatch.setattr(settings, 'VISION_DAILY_LIMIT', 2)
    monkeypatch.setattr(settings, 'VISION_MONTHLY_LIMIT', 1000)
    monkeypatch.setattr(vision_usage.llm_call_repo, 'count_since', lambda *a: 0)
    assert [vision_usage.take() for _ in range(3)] == [None, None, 'daily_limit']
    vision_usage.reset()
    monkeypatch.setattr(vision_usage.llm_call_repo, 'count_since', lambda *a: 1000)
    assert vision_usage.take() == 'monthly_limit'
    # 기록을 못 읽어도 하루 상한은 지켜요
    vision_usage.reset()
    monkeypatch.setattr(
        vision_usage.llm_call_repo, 'count_since', Mock(side_effect=RuntimeError('db'))
    )
    assert [vision_usage.take() for _ in range(3)] == [None, None, 'daily_limit']
    vision_usage.reset()


def test_variety_without_price_response(api, monkeypatch):
    client, annotate, _, _, _ = api
    monkeypatch.setattr(price_tag, 'match_variety', lambda *a: 'variety:apple-fuji')
    annotate.return_value = seen(['apple'], '부사')
    body = upload(client).json()
    assert body['price_tag'] is None
    assert body['variety_id'] == 'variety:apple-fuji'
    assert body['variety_text'] == '부사'
