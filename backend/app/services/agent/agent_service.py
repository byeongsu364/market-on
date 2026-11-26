"""Stateless service orchestration and final evidence checks."""

import json
import re

from app.core import chat_sign
from app.core.errors import AppError
from app.db.repositories import ask_repo, store_repo
from app.knowledge import fact_check
from app.knowledge.ingest import tag_entities
from app.llm import chat as chat_llm
from app.schemas.chat import ChatResponse
from app.services import ask_service, item_service

from . import tools

UNIT_LABELS = {'unit:piece': '개', 'unit:bunch': '단', 'unit:kg': 'kg', 'unit:g': 'g'}


def chat(conn, data, device_id):
    if not store_repo.get_market(conn, data.market_id):
        raise AppError('MARKET_NOT_FOUND', '시장을 찾을 수 없습니다.', 422)
    context = ''
    if data.item_id:
        item = item_service.get_item(conn, data.item_id)
        context = f'\n지금 보고 있는 품목: {item.name}({item.item_id})'
    ask_service.consume_quota(conn, device_id)
    dictionary = ask_repo.item_dictionary(conn)

    def execute(name, args):
        value = tools.execute(conn, data.market_id, device_id, name, args)
        return value.model_dump(mode='json') if hasattr(value, 'model_dump') else value

    def finalize(reply, results):
        evidence = '\n'.join(json.dumps(v, ensure_ascii=False, default=str) for _, _, v in results)

        # JSON numbers have no adjacent unit; preserve their service-defined denominations.
        def numeric_evidence(value):
            if isinstance(value, list):
                return '\n'.join(numeric_evidence(v) for v in value)
            if not isinstance(value, dict) or 'error' in value:
                return ''
            lines = []
            if {'total', 'in_market', 'stores'} <= value.keys():
                lines.extend(
                    [f'{value["total"]}개', f'{value["in_market"]}개', f'{value["stores"]}곳']
                )
            if isinstance(value.get('stores'), int):
                lines.append(f'{value["stores"]}곳')
            # 가격의 기준 단위("1개", "1단")도 근거로: 답에 "1개 1,540원"처럼 쓰기 때문
            label = (
                UNIT_LABELS.get(value.get('unit')) if isinstance(value.get('unit'), str) else None
            )
            if label:
                lines.append(f'1{label}')
            for key, v in value.items():
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    unit = (
                        '원'
                        if key
                        in (
                            'reference_price',
                            'price',
                            'unit_price',
                            'subtotal',
                            'total',
                            'budget',
                            'left',
                            'sale_price',
                            'regular_price',
                        )
                        else '%'
                        if key == 'diff_pct'
                        else None
                    )
                    if key == 'quantity':
                        unit = value.get('unit_label') or UNIT_LABELS.get(value.get('unit'))
                    if unit:
                        lines.append(f'{v}{unit}')
                elif isinstance(v, (dict, list)):
                    lines.append(numeric_evidence(v))
            return '\n'.join(lines)

        evidence += '\n' + '\n'.join(numeric_evidence(v) for _, _, v in results)
        for name, args, value in results:
            # 도구에 넘긴 조건(인원·예산)은 답에 다시 써도 됨 ("4명 선물", "3만원 예산")
            if name == 'compose_shopping' and isinstance(args, dict):
                if isinstance(args.get('headcount'), int):
                    evidence += f'\n{args["headcount"]}명'
                if isinstance(args.get('budget'), int):
                    evidence += f'\n{args["budget"]}원'
            if (
                isinstance(args, dict)
                and args.get('item_id')
                and not (isinstance(value, dict) and 'error' in value)
            ):
                evidence += '\n' + item_service.get_item(conn, args['item_id']).name
        checked, removed = fact_check.check(reply, evidence, data.item_id, dictionary)
        # Check unitless numbers too; the shared checker handles numeric units/ranges.
        supported_numbers = set(
            re.findall(r'-?\d+(?:\.\d+)?', fact_check.normalize_values(evidence))
        )
        kept_numbers = []
        for sentence in fact_check.sentences(checked or ''):
            if (
                not set(re.findall(r'-?\d+(?:\.\d+)?', fact_check.normalize_values(sentence)))
                <= supported_numbers
            ):
                removed += 1
            else:
                kept_numbers.append(sentence)
        checked = ' '.join(kept_numbers)
        if not results:
            kept = []
            for sentence in fact_check.sentences(checked or ''):
                if (
                    re.search(r'\d', sentence)
                    or tag_entities(sentence, dictionary)
                    or not re.fullmatch(
                        r'(?:안녕하세요|반가워요|이 시장 장보기 질문을 도와드릴 수 있어요|궁금한 점을 물어봐 주세요)[.!?。]?',
                        sentence,
                    )
                ):
                    removed += 1
                else:
                    kept.append(sentence)
            checked = ' '.join(kept)
        checked = ' '.join(fact_check.sentences(checked or '')[:4])
        citations, labels, items = {}, {}, {}
        for name, args, value in results:
            if name in tools.LABELS:
                labels[name] = {'name': name, 'label': tools.LABELS[name]}
            if isinstance(value, dict) and name == 'ask_knowledge':
                for source in value.get('citations', []):
                    key = tuple(source.get(k) for k in ('title', 'publisher', 'url', 'license'))
                    old = citations.get(key, {})
                    citations[key] = source | {
                        'draft': source.get('draft', False) or old.get('draft', False)
                    }

            if name == 'find_recipes' and isinstance(value, list):
                for recipe in value:
                    source = recipe.get('source')
                    if source:
                        citations[
                            tuple(source.get(k) for k in ('title', 'publisher', 'url', 'license'))
                        ] = source

            def collect(v):
                if isinstance(v, dict):
                    iid = v.get('item_id')
                    if iid and (v.get('name') or v.get('item_name')):
                        items[iid] = {'item_id': iid, 'name': v.get('name') or v['item_name']}
                    for nested in v.values():
                        collect(nested)
                elif isinstance(v, list):
                    for nested in v:
                        collect(nested)

            collect(value)
            if (
                isinstance(args, dict)
                and args.get('item_id')
                and not (isinstance(value, dict) and 'error' in value)
            ):
                item = item_service.get_item(conn, args['item_id'])
                items[item.item_id] = {'item_id': item.item_id, 'name': item.name}
        return ChatResponse(
            reply=' '.join(fact_check.sentences(checked or '')[:4]),
            removed=removed,
            citations=list(citations.values()),
            tools=list(labels.values()),
            items=[v for v in items.values() if v['name'] in (checked or '')],
        )

    try:
        history, _ = chat_sign.trusted_history(data.messages)
        routed = chat_llm.generate(history, tools.get_tools(), execute, finalize, context)
    except Exception as exc:
        raise AppError(
            'ASK_UNAVAILABLE', '지금은 답변을 찾을 수 없어요. 잠시 뒤 다시 물어봐 주세요.', 503
        ) from exc
    if not routed.value.reply:
        raise AppError(
            'ASK_UNAVAILABLE', '지금은 답변을 찾을 수 없어요. 잠시 뒤 다시 물어봐 주세요.', 503
        )
    routed.value.model = routed.model
    routed.value.reply_sig = chat_sign.sign(routed.value.reply)
    return routed.value
