"""Keyword-first closed-set intent resolution."""

INTENTS = ('select', 'store', 'prep', 'season', 'price', 'where', 'story')
RULES = (
    ('store', ('보관', '냉장', '냉동')),
    ('prep', ('손질', '씻', '다듬')),
    # 시기·산지를 묻는 말이 있으면 제철(온톨로지), 아니면 품종·특징은 특징 문서
    # ("사과 품종별 특징이 뭐예요?" → story, "후지 언제 수확해요?" → season)
    ('season', ('제철', '언제', '수확', '산지', '철이')),
    ('story', ('특징', '종류', '맛이 어때', '차이', '품종')),
    ('select', ('고르', '고를', '확인', '좋은 거')),
    ('price', ('얼마', '가격', '시세')),
    ('where', ('어디', '파는', '가게', '점포')),
)


def rule_intent(question):
    return next((intent for intent, words in RULES if any(w in question for w in words)), None)
