"""Question orchestration: intent, item, delegation, cache, retrieval and checking."""

import re

import httpx

from app.core.errors import AppError
from app.db.repositories import ask_repo, knowledge_repo
from app.knowledge import (
    answer_cache,
    ask_intent,
    citation,
    fact_check,
    ontology,
    retriever,
    season,
)
from app.llm import ask as ask_llm
from app.llm.factory import get_embedder
from app.schemas.ask import AskResponse

from . import item_service, market_service, price_service
from .price_report_service import hash_device

TOPICS = {
    'select': '확인 포인트',
    'store': '보관',
    'prep': '손질',
    'season': '제철',
    'story': '품종과 특징',
}


def ask(conn, data, device_id, *, embedder=None, consume=True):
    if consume:
        consume_quota(conn, device_id)
    intent = data.intent or ask_intent.rule_intent(data.question) or ask_llm.classify(data.question)
    if intent not in ask_intent.INTENTS:
        return AskResponse(kind='out_of_scope')
    result = AskResponse(kind='need_item', intent=intent)
    if data.item_id:
        ids = [data.item_id]
    else:
        resolved = ontology.resolve_entities(conn, data.question or '')
        ids = [eid for eid in resolved if knowledge_repo.get_item(conn, eid)]
        varieties = [eid for eid in resolved if eid.startswith('variety:')]
        if not ids and varieties:
            ids = knowledge_repo.variety_items(conn, varieties)
    if len(ids) != 1:
        candidates = {}
        for query in [data.question or '', *re.findall(r'[가-힣A-Za-z]+', data.question or '')]:
            for item in item_service.search(conn, query):
                candidates[item.item_id] = {'item_id': item.item_id, 'name': item.name}
        result.candidates = list(candidates.values())[:5]
        return result
    item = knowledge_repo.get_item(conn, ids[0])
    if not item:
        raise AppError('ITEM_NOT_FOUND', '품목을 찾을 수 없습니다.', 404)
    result.item_id, result.item_name = ids[0], item['name_ko']
    if intent == 'price':
        result.kind = 'price'
        result.price = price_service.get_price(conn, ids[0], market_id=data.market_id)
        return result
    if intent == 'where':
        if not data.market_id:
            raise AppError('MARKET_REQUIRED', '시장을 선택해 주세요.', 422)
        result.kind = 'where'
        result.stores = market_service.selling_stores(conn, data.market_id, ids[0])
        return result
    if intent == 'season':
        variety_id = ontology.match_variety(conn, ids[0], data.question or '')
        statements = season.season_statements(conn, ids[0], item['name_ko'], variety_id=variety_id)
        result.kind = 'answer' if statements else 'no_evidence'
        result.answer = (
            ' '.join(text for text, _ in statements)
            if statements
            else '이 품목의 제철 자료가 아직 없어요'
        )
        result.citations = season.statement_citations(statements)
        return result
    key = answer_cache.cache_key(conn, ids[0], intent, data.lang, data.question)
    cached = answer_cache.get_cached_answer(conn, key)
    if cached:
        return AskResponse(**(cached | {'cached': True, 'model': None}))
    result.kind = 'no_evidence'
    result.answer = f'이 품목의 {TOPICS[intent]} 자료가 아직 없어요.'
    try:
        chunks = retriever.search(
            conn,
            embedder or get_embedder(),
            data.question or f'{item["name_ko"]} {TOPICS[intent]}',
            entity_ids=ids,
            intent=intent,
            lang=data.lang,
            k=4,
            min_similarity=0.45,
        )
    except (httpx.HTTPError, TimeoutError) as exc:
        # 임베딩 서버(bge-m3, Ollama)가 꺼져 있으면 500 대신 알 수 있는 오류로
        raise AppError(
            'ASK_UNAVAILABLE', '지금은 답변을 찾을 수 없어요. 잠시 뒤 다시 물어봐 주세요.', 503
        ) from exc
    if not chunks:
        return result
    cleaned = [citation.clean_evidence(chunk.content) for chunk in chunks]
    dictionary = ask_repo.item_dictionary(conn)
    checked = {}

    def accept(value):
        checked.clear()
        if (
            not isinstance(value, dict)
            or not isinstance(value.get('used'), list)
            or not (value.get('answer') is None or isinstance(value.get('answer'), str))
            or 'answer' not in value
        ):
            return 'invalid_json'
        # Gemma는 근거 번호를 "1"처럼 문자열로 줄 때가 있어 숫자로 맞춤
        used = [int(i) if isinstance(i, str) and i.strip().isdigit() else i for i in value['used']]
        value['used'] = used
        if not used or any(type(i) is not int or not 1 <= i <= len(chunks) for i in used):
            return 'unsupported'
        answer, removed = fact_check.check(
            value['answer'] or '', '\n'.join(cleaned[i - 1] for i in used), ids[0], dictionary
        )
        # 한 문장 답도 근거가 맞으면 받음 (GPT로 넘기지 않음), 길면 앞 4문장만
        parts = fact_check.sentences(answer or '')
        if len(parts) > 4:
            answer = ' '.join(parts[:4])
        checked.update(answer=answer, removed=removed, used=sorted(set(used)))
        return None if answer else 'unsupported'

    try:
        routed = ask_llm.generate(
            data.question or f'{item["name_ko"]} {TOPICS[intent]} 방법을 알려 주세요.',
            cleaned,
            accept,
        )
    except (AppError, httpx.HTTPError, TimeoutError):
        return result
    # Router may return the last rejected result or a rejected fallback.
    rejection = accept(routed.value)
    result.removed = checked.get('removed', 0)
    if rejection:
        return result
    result.kind, result.answer, result.model = 'answer', checked['answer'], routed.model
    result.citations = citation.attach_citations(conn, [chunks[i - 1] for i in checked['used']])
    answer_cache.save(conn, key, result.model_dump(mode='json'), routed.model)
    return result


def consume_quota(conn, device_id):
    if not ask_repo.consume_quota(conn, hash_device(device_id)):
        raise AppError('TOO_MANY_QUESTIONS', '한 시간에 60회까지 질문할 수 있어요.', 429)
