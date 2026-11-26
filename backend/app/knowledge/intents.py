"""Single document-type to retrieval-intent mapping."""

DOC_TYPE_TO_INTENT = {
    'criterion': 'select',
    'grade': 'select',
    'storage': 'store',
    'prep': 'prep',
    'story': 'story',
    'origin': 'origin',
    'safety': 'safety',
    'context': 'context',
    'specialty': 'origin',
    'guide': 'guide',
    'recipe': 'recipe',
    'merchant_tip': 'select',
}


def doc_types_for_intent(intent: str) -> list[str]:
    types = [kind for kind, value in DOC_TYPE_TO_INTENT.items() if value == intent]
    if not types:
        raise ValueError(f'알 수 없는 intent: {intent}')
    return types
