"""Keyword-first closed-set intent resolution."""

INTENTS = ('select', 'store', 'prep', 'season', 'price', 'where')
RULES = (
    ('store', ('보관', '냉장', '냉동')),
    ('prep', ('손질', '씻', '다듬')),
    ('season', ('제철', '언제', '철', '품종', '산지')),
    ('select', ('고르', '고를', '확인', '좋은 거')),
    ('price', ('얼마', '가격', '시세')),
    ('where', ('어디', '파는', '가게', '점포')),
)


def rule_intent(question):
    return next((intent for intent, words in RULES if any(w in question for w in words)), None)
