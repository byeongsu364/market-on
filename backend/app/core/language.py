"""Supported language negotiation: explicit query, then weighted Accept-Language."""

from fastapi import Request

LANGUAGES = ('ko', 'en', 'zh', 'ja', 'vi')


def preferred_language(request: Request):
    explicit = request.query_params.get('lang')
    if explicit:
        return explicit if explicit in LANGUAGES else 'ko'
    choices = []
    for part in request.headers.get('accept-language', 'ko').split(','):
        code, *parameters = part.strip().lower().split(';')
        try:
            weight = float(
                next((p.strip()[2:] for p in parameters if p.strip().startswith('q=')), '1')
            )
        except ValueError:
            continue
        if code.split('-')[0] in LANGUAGES and 0 < weight <= 1:
            choices.append((weight, code.split('-')[0]))
    return max(choices, key=lambda pair: pair[0])[1] if choices else 'ko'


def present(conn, value, lang):
    if lang == 'ko':
        return value
    from fastapi.encoders import jsonable_encoder

    from app.knowledge.i18n import localize

    return localize(conn, jsonable_encoder(value, exclude_unset=True), lang)
