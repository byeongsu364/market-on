"""Deterministic storage facts with relation-specific provenance."""

from app.db.repositories import knowledge_repo

from . import i18n
from .season import _source

QUESTION_WORDS = (
    'temperature',
    'how long',
    '温度',
    '保存',
    '几度',
    '多久',
    '何度',
    'どのくらい',
    'nhiệt độ',
    'bao lâu',
    '몇 도',
    '몇도',
    '온도',
    '며칠',
    '얼마나',
    '기간',
)


def is_fact_question(question):
    return any(word in (question or '') for word in QUESTION_WORDS)


def storage_statements(conn, item_id, name, *, lang='ko'):
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
        if lang != 'ko':
            temperature = i18n.text(value['label'], lang, value['label'], section='phrases')
            period = i18n.text(value.get('period_label', ''), lang, '', section='phrases')
            # Preserve Korean when a qualifier/period has no complete draft.
            if not value.get('note') and (not value.get('period_label') or period):
                text = i18n.template(
                    'storage_period' if period else 'storage',
                    lang,
                    text,
                    name=i18n.label(conn, item_id, lang, name),
                    temperature=temperature,
                    period=period,
                )
        statements.append((text, [_source(row)]))
    return statements
