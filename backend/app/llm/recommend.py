"""장보기 이유 문장 (040 역할 reason = 제미나이 → GPT → 젬마). 품목·수량·금액은 코드가 정해요."""

import json
from pathlib import Path

from .ask import parse
from .router import run


def generate(context, accept):
    prompt = (
        Path(__file__).with_name('prompts').joinpath('recommend.txt').read_text(encoding='utf-8')
    )
    prompt += '\n데이터: ' + json.dumps(context, ensure_ascii=False)
    return run(
        'reason', lambda provider: parse(provider.generate(prompt)), accept, task='recommend'
    )
