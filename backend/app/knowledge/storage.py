"""Deterministic storage facts with relation-specific provenance."""

from app.db.repositories import knowledge_repo
from .season import _source

QUESTION_WORDS = ('몇 도', '몇도', '온도', '며칠', '얼마나', '기간')


def is_fact_question(question):
    return any(word in (question or '') for word in QUESTION_WORDS)


def storage_statements(conn, item_id, name):
    statements = []
    particle = '은' if (ord(name[-1]) - 0xAC00) % 28 else '는'
    for row in knowledge_repo.storage_relations(conn, item_id):
        value = row['object_value']
        if value.get('period_label'):
            # 기간이 있는 사실은 한 문장으로: "부유 품종은 0℃에서 1~3개월 보관할 수 있다고 안내해요."
            subject = value.get('note') or f'{name}{particle}'
            text = (
                f'{subject} {value["label"]}에서 {value["period_label"]} 보관할 수 있다고 안내해요.'
            )
        else:
            text = f'{name}{particle} {value["label"]}에서 보관하는 게 알맞다고 안내해요.'
        statements.append((text, [_source(row)]))
    return statements
