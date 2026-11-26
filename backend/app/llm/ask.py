"""Ask model calls stay within the LLM boundary; router handles escalation."""

import json
from pathlib import Path

from .router import run


def parse(text):
    try:
        value = json.loads(text[text.index('{') : text.rindex('}') + 1])
        return value if isinstance(value, dict) else None
    except (ValueError, TypeError):
        return None


def classify(question):
    prompt = (
        '다음 질문의 의도를 select, store, prep, season, price, where 중 하나로 분류하세요. 해당 없으면 out_of_scope. JSON만: {"intent":"..."}\n질문: '
        + json.dumps(question, ensure_ascii=False)
    )
    routed = run(
        'ask',
        lambda provider: parse(provider.generate(prompt)),
        lambda v: None if v and isinstance(v.get('intent'), str) else 'invalid_json',
    )
    return (routed.value or {}).get('intent')


def generate(question, chunks, accept):
    prompt = Path(__file__).with_name('prompts').joinpath('ask.txt').read_text()
    prompt += '\n질문: ' + json.dumps(question, ensure_ascii=False)
    prompt += '\n근거:\n' + '\n'.join(f'[{i}] {text}' for i, text in enumerate(chunks, 1))
    return run('ask', lambda provider: parse(provider.generate(prompt)), accept)
