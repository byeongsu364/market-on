"""Deterministic composition; models only supply checked evidence-backed reasons."""

from datetime import UTC, datetime
from math import ceil
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import httpx

from app.core.errors import AppError
from app.db.repositories import ask_repo, knowledge_repo, sale_repo, store_repo
from app.knowledge import answer_cache, citation, fact_check, i18n, retriever, season
from app.llm import recommend as recommend_llm
from app.llm.factory import get_embedder
from app.llm.translate import translate
from app.schemas.recommend import RecommendResponse

from . import ask_service, item_service, market_service, price_service

# All composition policy lives here. Tie breaks always use ascending item_id.
RULES = {
    '집밥': ('cat:vegetable', 'cat:fruit', 1),
    '선물': ('cat:fruit', None, 0),
    '모임': ('cat:fruit', 'cat:vegetable', 1),
}
QUANTITIES = {'fruit_per_person': 1, 'gift_per_person': 2, 'gift_min': 3, 'vegetable_people': 3}
MAX_ITEMS = 4
# 이유 문장에 넘길 근거 문서 종류 (용도에 맞는 사실을 쓰게). 앞 종류부터 검색 순위를 둠
PURPOSE_DOC_TYPES = {
    '선물': ['storage', 'criterion'],
    '모임': ['prep', 'criterion'],
    '집밥': ['prep', 'storage', 'criterion'],
}
PURPOSE_QUERY = {
    '선물': '오래 두고 먹는 보관 방법 제철',
    '모임': '손질하는 법 고르는 법',
    '집밥': '손질하는 법 보관하는 법',
}
FILL_RATIO = 0.6
NOTE = '기준시세로 계산한 예상 금액이에요. 실제 가격은 가게마다 달라요'


def quantity(category, unit, purpose, headcount):
    if category == 'cat:fruit' and unit == 'unit:piece':
        return (
            max(QUANTITIES['gift_min'], headcount * QUANTITIES['gift_per_person'])
            if purpose == '선물'
            else headcount * QUANTITIES['fruit_per_person']
        )
    return ceil(headcount / QUANTITIES['vegetable_people'])


def compose(candidates, purpose, headcount, budget):
    """Pure policy: category priority, item ID; reduce expensive units before removal."""
    primary, secondary, limit = RULES[purpose]
    ordered = sorted(
        (
            dict(c)
            for c in candidates
            if c['category'] in (primary, secondary) and c['unit_price'] > 0
        ),
        key=lambda c: (c['category'] != primary, c['item_id']),
    )
    selected = []
    for c in ordered:
        if len(selected) == MAX_ITEMS:
            break
        if (
            c['category'] == secondary
            and sum(i['category'] == secondary for i in selected) >= limit
        ):
            continue
        c['quantity'] = quantity(c['category'], c['unit'], purpose, headcount)
        # 예산 때문에 줄여도 목표 수량의 절반 아래로는 안 줄임 (선물에 배 1개 같은 구성 방지)
        c['floor'] = max(1, ceil(c['quantity'] / 2))
        selected.append(c)

    def total():
        return sum(c['unit_price'] * c['quantity'] for c in selected)

    def expensive(c):
        return (-c['unit_price'], c['item_id'])

    removed = set()
    while total() > budget and selected:
        # 품목이 하나만 남으면 빈 구성보다 적은 수량이 나아서 1개까지 줄임
        floor = (lambda c: 1) if len(selected) == 1 else (lambda c: c['floor'])
        reducible = sorted((c for c in selected if c['quantity'] > floor(c)), key=expensive)
        if reducible:
            reducible[0]['quantity'] -= 1
            continue
        # 모두 절반까지 줄였는데도 넘으면 가장 비싼 품목을 뺌 (다시 채울 때도 넣지 않음)
        drop = min(selected, key=expensive)
        selected.remove(drop)
        removed.add(drop['item_id'])
    # Fill in existing category order, adding an affordable candidate before increments.
    while total() < budget * FILL_RATIO:
        categories = {c['category'] for c in selected} or {primary}
        extra = next(
            (
                c
                for c in ordered
                if c['item_id'] not in {i['item_id'] for i in selected} | removed
                and c['category'] in categories
                and len(selected) < MAX_ITEMS
                and (
                    c['category'] != secondary
                    or sum(i['category'] == secondary for i in selected) < limit
                )
                and total() + c['unit_price'] <= budget
            ),
            None,
        )
        if extra:
            selected.append(dict(extra, quantity=1))
            continue
        affordable = next((c for c in selected if total() + c['unit_price'] <= budget), None)
        if not affordable:
            break
        affordable['quantity'] += 1
    return [
        {k: v for k, v in c.items() if k != 'floor'} | {'subtotal': c['quantity'] * c['unit_price']}
        for c in selected
    ]


def recommend(conn, data, device_id, *, embedder=None, consume=True):
    if consume:
        ask_service.consume_quota(conn, device_id)
    if not store_repo.get_market(conn, data.market_id):
        raise AppError('MARKET_NOT_FOUND', '시장을 찾을 수 없습니다.', 422)
    ids = sorted({r['item_id'] for r in store_repo.market_items(conn, data.market_id)})
    key = answer_cache.recommend_key(conn, data, ids)
    cached = answer_cache.get_cached_answer(conn, key)
    if cached:
        return RecommendResponse(**cached)
    sales = {
        s['store_id']
        for s in sale_repo.latest_active_by_store(conn, data.market_id, datetime.now(UTC))
    }
    candidates = []
    for item_id in ids:
        stores = market_service.selling_stores(conn, data.market_id, item_id)
        if not stores:
            continue
        relations = knowledge_repo.item_relations(conn, item_id)
        category = next((r['object_id'] for r in relations if r['predicate'] == 'isA'), None)
        if category not in ('cat:fruit', 'cat:vegetable'):
            continue
        item = item_service.get_item(conn, item_id)
        try:
            price = price_service.get_price(
                conn,
                item_id,
                market_id=data.market_id,
                on_date=datetime.now(ZoneInfo('Asia/Seoul')).date(),
                unit_id=item.default_unit,
            )
        except AppError as exc:
            if exc.code == 'PRICE_NOT_FOUND':
                continue
            raise
        # Only local traditional averages in the actual default sale denomination.
        traditional = price.by_market_type.get('traditional')
        if (
            price.mock
            or price.unit != item.default_unit
            or price.region == '전국'
            or not traditional
        ):
            continue
        label = next(
            (r['name_ko'] for r in relations if r['object_id'] == item.default_unit),
            item.default_unit,
        )
        candidates.append(
            {
                'item_id': item_id,
                'name': item.name,
                'category': category,
                'unit': item.default_unit,
                'unit_label': label,
                'unit_price': traditional.price,
                'stores': sorted(stores, key=lambda s: (s['store_id'] not in sales, s['store_id']))[
                    :3
                ],
            }
        )
    items = compose(candidates, data.purpose, data.headcount, data.budget)
    for item in items:
        item['reason'] = f'{data.purpose}에 맞춰 {item["quantity"]}{item["unit_label"]} 넣었어요'
        item['sources'] = []
    model = None
    if items:
        evidence = {}
        try:
            for item in items:
                evidence[item['item_id']] = retriever.search(
                    conn,
                    embedder or get_embedder(),
                    f'{item["name"]} {PURPOSE_QUERY[data.purpose]}',
                    entity_ids=[item['item_id']],
                    doc_types=PURPOSE_DOC_TYPES[data.purpose],
                    lang='ko',
                    k=4,
                )
        except (httpx.HTTPError, TimeoutError) as exc:
            raise AppError(
                'ASK_UNAVAILABLE', '지금은 답변을 찾을 수 없어요. 잠시 뒤 다시 물어봐 주세요.', 503
            ) from exc
        if data.purpose == '선물':
            month = datetime.now(ZoneInfo('Asia/Seoul')).month
            for item in items:
                statements = season.season_statements(
                    conn, item['item_id'], item['name'], month=month
                )
                evidence[item['item_id']].extend(
                    SimpleNamespace(content=text, season_sources=sources)
                    for text, sources in statements
                )
        dictionary = ask_repo.item_dictionary(conn)
        checked = {}

        def accept(value):
            checked.clear()
            if not isinstance(value, dict) or not isinstance(value.get('reasons'), dict):
                return 'invalid_json'
            for item in items:
                iid = item['item_id']
                reason = value['reasons'].get(iid)
                if (
                    not isinstance(reason, dict)
                    or not isinstance(reason.get('used'), list)
                    or not (reason.get('text') is None or isinstance(reason.get('text'), str))
                ):
                    return 'invalid_json'
                used = [
                    int(i) if isinstance(i, str) and i.strip().isdigit() else i
                    for i in reason['used']
                ]
                chunks = evidence[iid]
                if not used or any(type(i) is not int or not 1 <= i <= len(chunks) for i in used):
                    continue
                chosen = [chunks[i - 1] for i in sorted(set(used))]
                text, _ = fact_check.check(
                    reason.get('text') or '',
                    '\n'.join(citation.clean_evidence(c.content) for c in chosen),
                    iid,
                    dictionary,
                )
                if text:
                    checked[iid] = (' '.join(fact_check.sentences(text)[:2]), chosen)
            return None

        context = {
            'purpose': data.purpose,
            'relation': data.relation,
            'event': data.event,
            'headcount': data.headcount,
            'items': [
                {
                    'item_id': i['item_id'],
                    'quantity': i['quantity'],
                    'unit': i['unit_label'],
                    'evidence': [
                        {
                            'number': n,
                            'text': citation.clean_evidence(c.content),
                            **(
                                {'sources': [s.model_dump() for s in c.season_sources]}
                                if hasattr(c, 'season_sources')
                                else {}
                            ),
                        }
                        for n, c in enumerate(evidence[i['item_id']], 1)
                    ],
                }
                for i in items
            ],
        }
        if any(evidence.values()):
            try:
                routed = recommend_llm.generate(context, accept)
                if accept(routed.value) is None:
                    for item in items:
                        if item['item_id'] in checked:
                            item['reason'], chunks = checked[item['item_id']]
                            item['sources'] = (
                                citation.attach_citations(
                                    conn, [c for c in chunks if not hasattr(c, 'season_sources')]
                                )
                                if any(not hasattr(c, 'season_sources') for c in chunks)
                                else []
                            )
                            for chunk in chunks:
                                for source in getattr(chunk, 'season_sources', []):
                                    if source not in item['sources']:
                                        item['sources'].append(source)
                            model = routed.model
            except (AppError, httpx.HTTPError, TimeoutError):
                pass
    total = sum(i['subtotal'] for i in items)
    result = RecommendResponse(
        items=items,
        total=total,
        budget=data.budget,
        left=data.budget - total,
        note=NOTE if candidates else '이 시장에서 파는 품목의 시세가 아직 없어요',
        model=model,
    )
    for item in result.items:
        item.lang = data.lang
        item.original = item.reason
        item.reason, item.translated = translate(item.reason, data.lang, conn)
    result.items = [
        type(item)(**i18n.localize(conn, item.model_dump(), data.lang)) for item in result.items
    ]
    answer_cache.save(conn, key, result.model_dump(mode='json'), model)
    return result
