"""039 검수: 원문 재료 줄의 소제목을 재료로 세지 않아요."""

from app.knowledge.recipes import clean_lines, parse_ingredients

DICTIONARY = [('사과', 'item:apple'), ('양파', 'item:onion')]


def test_headers_are_not_ingredients():
    lines = ['오이무침 :', '오이 70g(1/3개)', '순두부사과 소스 :', '순두부 40g', '사과 50g(1/3개)']
    assert clean_lines('순두부 사과 소스 오이무침', lines) == [
        '오이 70g(1/3개)',
        '순두부 40g',
        '사과 50g(1/3개)',
    ]
    parsed = parse_ingredients('순두부 사과 소스 오이무침', lines, DICTIONARY)
    assert [p['text'] for p in parsed] == ['오이 70g(1/3개)', '순두부 40g', '사과 50g(1/3개)']
    assert [p['item_id'] for p in parsed if p['item_id']] == ['item:apple']


def test_prefix_and_dish_name_lines():
    lines = ['북엇국', '북어채 25g', '소스 : 맛간장 30g', '참깨 약간']
    assert clean_lines('사과 새우 북엇국', lines) == ['북어채 25g', '맛간장 30g', '참깨 약간']


def test_reason_particle_and_other_dish(monkeypatch):
    from app.services import recipe_service

    monkeypatch.setattr(recipe_service, 'rules', lambda name: {'rules': {}})
    assert (
        recipe_service.reason('단감', '반찬', [11], 11, None, [])
        == '11월 제철 단감으로 만드는 반찬'
    )
    assert recipe_service.reason('귤', '후식', [], 11, None, []) == '귤로 만드는 후식'
    assert recipe_service.reason('대파', '기타', [], 11, None, []) == '대파로 만드는 요리'
