"""Evaluate demo questions through the ask service without consuming visitor quota."""

import json
import statistics
import time
from datetime import UTC, datetime
from pathlib import Path

import httpx
import yaml

from app.core.errors import AppError
from app.knowledge import fact_check, retriever
from app.knowledge.intents import doc_types_for_intent
from app.llm.factory import get_embedder
from app.llm.translate import translate
from app.schemas.ask import AskRequest
from app.services import ask_service

from ._common import DATA, run


def evaluate(conn, *, data_dir: Path = DATA, questions=None, embedder=None) -> dict:
    questions = (
        questions
        if questions is not None
        else yaml.safe_load((data_dir / 'eval/questions.yaml').read_text())['questions']
    )
    rows = []
    for q in questions:
        row = {
            'id': q['id'],
            'question': q['question'],
            'lang': q.get('lang', 'ko'),
            'retrieval_hit': None,
        }
        korean_question = q['question']
        if row['lang'] != 'ko':
            korean_question, ok = translate(
                korean_question, 'ko', conn, source=row['lang'], check=False
            )
            if not ok:
                row['unavailable'] = '측정 못 함: 번역 서버'
        chunks = []
        request = AskRequest(
            **{k: q[k] for k in ('question', 'item_id', 'intent', 'lang') if k in q}
        )
        if q.get('doc_key') and not row.get('unavailable'):
            try:
                chunks = retriever.search(
                    conn,
                    embedder or get_embedder(),
                    korean_question,
                    entity_ids=[q['item_id']],
                    intent=q['intent'],
                    lang='ko',
                    k=5,
                )
                # RetrievedChunk deliberately has no doc_key; use stable chunk IDs.
                ids = [c.chunk_id for c in chunks]
                keys = (
                    conn.execute(
                        'select d.doc_key from chunks c join documents d on d.id=c.document_id where c.id=any(%s)',
                        (ids,),
                    ).fetchall()
                    if ids
                    else []
                )
                row['retrieval_hit'] = q['doc_key'] in {r[0] for r in keys}
                row['retrieval_mode'] = 'vector'
            except (httpx.HTTPError, TimeoutError, AppError):
                # Offline baseline, explicitly distinguished from vector retrieval.
                keys = conn.execute(
                    """select d.doc_key from chunks c join documents d on d.id=c.document_id
                    join chunk_entities ce on ce.chunk_id=c.id
                    where ce.entity_id=%s and d.doc_type=any(%s) and d.review_status != 'rejected'
                    order by ts_rank(to_tsvector('simple',c.content), plainto_tsquery('simple',%s)) desc,c.id limit 5""",
                    (q['item_id'], doc_types_for_intent(q['intent']), korean_question),
                ).fetchall()
                row['retrieval_hit'] = q['doc_key'] in {r[0] for r in keys}
                row['retrieval_mode'] = 'lexical_fallback'
                row['unavailable'] = '측정 못 함: 임베딩 서버'
        began = time.monotonic()
        try:
            if row.get('unavailable'):
                raise AppError('ASK_UNAVAILABLE', '측정 못 함', 503)
            result = ask_service.ask(
                conn,
                request,
                'evaluation',
                embedder=embedder,
                consume=False,
                use_cache=False,
                raise_unavailable=True,
            )
            row.update(kind=result.kind, seconds=time.monotonic() - began)
            if row['lang'] != 'ko' and result.answer:
                row['translation_pass'] = result.translated and fact_check.translation_check(
                    result.original or '', result.answer, row['lang']
                )
            if result.kind == 'recipes':
                row['cited'] = bool(result.citations)
                row['recipe_count'] = len(result.recipes or [])
                row['values_pass'] = result.answer is None
            if result.kind == 'answer':
                row['cited'] = bool(result.citations)
                # Check against the actual cited documents, including ontology shortcuts.
                evidence = conn.execute(
                    """select d.body from documents d join sources s on s.id=d.source_id
                    where d.review_status != 'rejected' and s.title=any(%s)""",
                    ([c.title for c in result.citations],),
                ).fetchall()
                row['values_pass'] = fact_check.values(
                    result.original or result.answer or ''
                ) <= fact_check.values('\n'.join(r[0] for r in evidence))
            if q.get('expect'):
                # 범위 밖 질문은 '지어내지 않은 안전한 응답'이면 정답: 자료 없음·범위 밖 거절·품목 되묻기,
                # 또는 질문마다 허용한 응답(예: 가격 예측 → 예측 없이 오늘 시세만)
                allowed = q['expect'] if isinstance(q['expect'], list) else [q['expect']]
                row['no_evidence_correct'] = result.kind in allowed
            began = time.monotonic()
            cached = ask_service.ask(
                conn,
                request,
                'evaluation',
                embedder=embedder,
                consume=False,
                raise_unavailable=True,
            )
            row['cache_seconds'] = time.monotonic() - began
            row['cache_hit'] = cached.cached
        except (httpx.HTTPError, TimeoutError, AppError):
            row['unavailable'] = '측정 못 함: 모델 또는 임베딩 서버'
        rows.append(row)

    def metric(field):
        measured = [r[field] for r in rows if field in r and r[field] is not None]
        return {
            'passed': sum(measured),
            'total': len(measured),
            'rate': sum(measured) / len(measured) if measured else None,
        }

    times = [r['seconds'] for r in rows if 'seconds' in r]
    cache_times = [r['cache_seconds'] for r in rows if r.get('cache_hit')]
    report = {
        'started_at': datetime.now(UTC).isoformat(),
        'questions': len(rows),
        'metrics': {
            'retrieval': metric('retrieval_hit'),
            'citations': metric('cited'),
            'translation': metric('translation_pass'),
            'values': metric('values_pass'),
            'no_evidence': metric('no_evidence_correct'),
            'latency': {
                'median': statistics.median(times) if times else None,
                'max': max(times) if times else None,
                'cache_hits': len(cache_times),
                'cache_median': statistics.median(cache_times) if cache_times else None,
                'cache_max': max(cache_times) if cache_times else None,
            },
        },
        'results': rows,
    }
    build = data_dir / 'build'
    build.mkdir(parents=True, exist_ok=True)
    (build / 'eval_report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    lines = [
        '# 시연 질문 평가',
        '',
        report['started_at'],
        '',
        '미측정(null): 측정 못 함. lexical_fallback은 서버 없는 검색 기준선이며 벡터 검색 점수가 아닙니다.',
        '',
    ]
    lines += [f'- {k}: {json.dumps(v, ensure_ascii=False)}' for k, v in report['metrics'].items()]
    lines += ['', '| 질문 | 결과 |', '|---|---|']
    lines += [f'| {r["question"]} | {r.get("unavailable", r.get("kind"))} |' for r in rows]
    (build / 'eval_report.md').write_text('\n'.join(lines) + '\n')
    return report


def main():
    from app.db.pool import connection

    with connection() as conn:
        evaluate(conn)


if __name__ == '__main__':
    run(main)
